"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, Lightbulb, PartyPopper, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RoundHeader } from "./round-header";
import { GrowthBadge } from "./growth-badge";
import { GrowingKuwagataPanel } from "./growing-kuwagata-panel";
import { STAGE_COLORS, withAlpha } from "./stage-colors";
import { TappableText } from "./tappable-text";
import type { Stage0RoundQuestion, Stage0RoundResponse, WarmthLevel } from "./types";

type ViewState = "loading" | "round" | "round_complete" | "done" | "error";

type QuestionResult = {
  usageRuleId: string;
  title: string;
  correct: boolean;
  graduated: boolean;
};

type Stage0PracticeProps = {
  // カテゴリ選択UI用に、公開済みusage_rulesが実際に持っているerror_tagの一覧
  // （まだコンテンツが無いカテゴリは選択肢に出てこない）。
  availableErrorTags: string[];
};

const STAGE_COLOR = STAGE_COLORS[0];
const WARMTH_BORDER_ALPHA: Record<WarmthLevel, string> = { 0: "00", 1: "33", 2: "55", 3: "80" };
const WARMTH_BG_ALPHA: Record<WarmthLevel, string> = { 0: "00", 1: "0a", 2: "12", 3: "1a" };

const RESULT_SPARKLES = Array.from({ length: 10 }).map((_, i) => {
  const left = 6 + i * 9;
  const x = (i % 2 === 0 ? 1 : -1) * (8 + (i % 3) * 6);
  const y = -(20 + (i % 4) * 10);
  return {
    left,
    x,
    y,
    delay: (i % 5) * 0.05,
    warm: i % 2 === 0,
    large: i % 3 === 0,
  };
});

// Stage0（使い分けパーツ）の練習画面。Stage1〜5の一本道とは別の、いつでも寄れる独立エリア
// （ゲートにはしない。_reference/speaking-roadmap-design.md参照）。
//
// 「日本語の感覚のまま英語にすると事故る感覚」（例：可算名詞は単数のまま裸で使えない）を
// 1つの「感覚」として扱い、語彙を変えた出題文を繰り返しぶつける。1フレーズを覚えて卒業ではなく、
// 同じ感覚に対する複数パターンで安定して「言えた」が続くまでを卒業条件とする。
//
// フローはStage2のkind:"produce"と似ているが、決定的に違うのは解説（coreImageJa）の出し方：
// 先に読ませず、まず声に出させる→答えを確認する、まではStage2と同じ。答え合わせの時点で
// 解説（核イメージ）も必ず一緒に見せる（2026-09-09：当初は「言えなかった」を選んだ時だけ
// 出す設計にしていたが、「なんとなく」で言えた側を選んでしまう人もいるため、自己申告の正誤に
// 関係なく毎回見せる形に変更した）。自己申告の「言えた/言えなかった」はストリーク（卒業判定）
// にのみ使う。
//
// カテゴリ選択（2026-09-09追加）：「冠詞だけ集中的に練習したい」という声を受け、error_tagで
// 絞り込めるようにした。選択状態はnull=「すべて」として扱い、練習画面のどのビューでも
// 常に切り替えられる（選択を変えたら新しいラウンドを取り直す）。
export function Stage0Practice({ availableErrorTags }: Stage0PracticeProps) {
  const [state, setState] = useState<ViewState>("loading");
  const [questions, setQuestions] = useState<Stage0RoundQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [reaction, setReaction] = useState<"happy" | "sad" | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [deepOpen, setDeepOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedErrorTag, setSelectedErrorTag] = useState<string | null>(null);

  const currentQuestion = questions[currentIndex];

  async function loadRound(errorTag: string | null) {
    setState("loading");
    setCurrentIndex(0);
    setResults([]);
    setRevealed(false);
    setDeepOpen(false);
    setError(null);

    try {
      const url = errorTag
        ? `/api/roadmap/stage0/round?errorTag=${encodeURIComponent(errorTag)}`
        : "/api/roadmap/stage0/round";
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("出題データの取得に失敗しました");
      const json: Stage0RoundResponse = await res.json();

      if (json.status === "done") {
        setQuestions([]);
        setState("done");
        return;
      }

      setQuestions(json.questions);
      setState("round");
    } catch (err) {
      setError(err instanceof Error ? err.message : "出題データの取得に失敗しました");
      setState("error");
    }
  }

  useEffect(() => {
    loadRound(selectedErrorTag);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedErrorTag]);

  function handleSelectCategory(tag: string | null) {
    if (tag === selectedErrorTag) return;
    setSelectedErrorTag(tag);
  }

  function handleReveal() {
    if (!currentQuestion || revealed) return;
    setRevealed(true);
  }

  // 次の問題へ進む（ラウンド最後なら結果画面へ）。
  function advanceToNext() {
    setRevealed(false);
    setDeepOpen(false);
    if (currentIndex + 1 < questions.length) {
      setCurrentIndex((i) => i + 1);
    } else {
      setState("round_complete");
    }
  }

  // 結果を記録してすぐ次へ進む（解説は自己申告に関係なく答え合わせ時点で常に表示済みのため、
  // ここでの分岐は不要）。
  async function handleSelfReport(correct: boolean) {
    if (!currentQuestion || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/roadmap/stage0/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ usageRuleId: currentQuestion.usageRuleId, correct }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "結果の保存に失敗しました");
      }
      const json = await res.json();

      setReaction(correct ? "happy" : "sad");
      setTimeout(() => setReaction(null), 1100);

      setResults((prev) => [
        ...prev,
        {
          usageRuleId: currentQuestion.usageRuleId,
          title: currentQuestion.title,
          correct,
          graduated: Boolean(json.result?.graduated),
        },
      ]);

      advanceToNext();
    } catch (err) {
      setError(err instanceof Error ? err.message : "結果の保存に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  // カテゴリ選択。タグが15種類ほどあり、横並びのピルだとスマホで画面の大半を占めてしまうため、
  // 1行のセレクトに畳んでいる（「すべて」＋公開済みのerror_tag一覧）。
  // 1カテゴリしかない間は出し分ける意味が薄いので、2件以上あるときだけ表示する。
  const categorySelector =
    availableErrorTags.length > 1 ? (
      <div className="mb-4 flex items-center gap-2">
        <label className="relative inline-flex max-w-full items-center">
          <span className="sr-only">カテゴリ</span>
          <select
            value={selectedErrorTag ?? ""}
            onChange={(e) => handleSelectCategory(e.target.value === "" ? null : e.target.value)}
            className="max-w-full appearance-none truncate rounded-full py-2 pl-4 pr-9 text-sm font-bold text-white shadow-sm outline-none transition-all duration-150 active:scale-[.97]"
            style={{ backgroundColor: STAGE_COLOR }}
          >
            <option value="">すべて</option>
            {availableErrorTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-white" />
        </label>
      </div>
    ) : null;

  if (state === "loading") {
    return (
      <div>
        {categorySelector}
        <p className="text-sm text-zinc-400">読み込み中...</p>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div>
        {categorySelector}
        <p className="text-sm text-red-600">{error ?? "エラーが発生しました"}</p>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div>
        {categorySelector}
        <div className="rounded-xl border border-zinc-200 bg-zinc-100/50 px-6 py-10 text-center">
          <PartyPopper className="mx-auto mb-3 h-6 w-6" style={{ color: STAGE_COLOR }} />
          <p className="text-sm text-zinc-700">
            {selectedErrorTag
              ? `今のところ、「${selectedErrorTag}」の感覚は全て卒業しました。`
              : "今のところ、Stage0の感覚は全て卒業しました。"}
          </p>
          <p className="mt-1 text-xs text-zinc-400">新しい感覚が追加されたら、またここに出てきます。</p>
          <Link
            href="/roadmap"
            className="mt-4 inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400"
          >
            部屋に戻る
          </Link>
        </div>
      </div>
    );
  }

  if (state === "round_complete") {
    const correctCount = results.filter((r) => r.correct).length;
    const graduated = results.filter((r) => r.graduated);

    return (
      <div>
        {categorySelector}
        <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100/50 p-6 text-center animate-round-complete-pop">
          {RESULT_SPARKLES.map((s, i) => (
            <span
              key={i}
              className={cn(
                "absolute top-3 rounded-full animate-round-complete-sparkle",
                s.large ? "h-2 w-2" : "h-1.5 w-1.5"
              )}
              style={
                {
                  left: `${s.left}%`,
                  backgroundColor: s.warm ? STAGE_COLOR : "#fbbf24",
                  animationDelay: `${s.delay}s`,
                  "--sparkle-x": `${s.x}px`,
                  "--sparkle-y": `${s.y}px`,
                } as React.CSSProperties
              }
            />
          ))}

          <PartyPopper className="relative mx-auto mb-3 h-6 w-6" style={{ color: STAGE_COLOR }} />
          <p className="relative text-sm font-medium text-zinc-900">
            今回のラウンド：{results.length}問中{correctCount}問「言えた」
          </p>

          {graduated.length > 0 && (
            <div className="relative mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-left text-sm text-emerald-800">
              <p className="mb-1 font-medium">身についた感覚</p>
              <ul className="space-y-0.5">
                {graduated.map((r) => (
                  <li key={r.usageRuleId}>{r.title}</li>
                ))}
              </ul>
            </div>
          )}

          {graduated.length > 0 && <GrowingKuwagataPanel />}

          <div className="relative mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => loadRound(selectedErrorTag)}
              style={{ backgroundColor: STAGE_COLOR }}
              className="flex flex-1 items-center justify-center gap-1 sm:gap-1.5 rounded-lg px-2 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[.97]"
            >
              もう1ラウンド
            </button>
            <Link
              href="/roadmap"
              className="flex flex-1 items-center justify-center gap-1 whitespace-nowrap sm:gap-1.5 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400"
            >
              部屋に戻る
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return (
      <div>
        {categorySelector}
        <p className="text-sm text-zinc-400">読み込み中...</p>
      </div>
    );
  }

  const hasTint = currentQuestion.warmth > 0;

  return (
    <div>
      {categorySelector}
      <RoundHeader
        stage={0}
        subFormatLabel="感覚"
        current={currentIndex + 1}
        total={questions.length}
        arthurMood={reaction ?? "talk"}
      />

      <div
        key={currentIndex}
        className={cn(
          "animate-question-card-enter rounded-xl border p-6",
          hasTint ? "" : "border-zinc-200 bg-zinc-100/50"
        )}
        style={
          hasTint
            ? {
                borderColor: withAlpha(STAGE_COLOR, WARMTH_BORDER_ALPHA[currentQuestion.warmth]),
                backgroundColor: withAlpha(STAGE_COLOR, WARMTH_BG_ALPHA[currentQuestion.warmth]),
              }
            : undefined
        }
      >
        <div className="mb-1 flex items-center gap-2">
          <GrowthBadge stage={0} warmth={currentQuestion.warmth} />
          <p className="text-lg font-medium text-zinc-900">{currentQuestion.promptJa}</p>
        </div>
        <p className="mb-4 text-xs text-zinc-400">まず声に出して英語で言ってみよう。言えたら答えを確認します。</p>

        {!revealed ? (
          <button
            type="button"
            onClick={handleReveal}
            className="flex w-full items-center justify-center gap-1 sm:gap-1.5 rounded-lg border border-dashed px-2 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm font-medium transition-all duration-150 active:scale-[.97]"
            style={{ borderColor: STAGE_COLOR, color: STAGE_COLOR }}
          >
            答えを確認する
          </button>
        ) : (
          <div className="animate-question-card-enter">
            <div
              className="mb-3 rounded-lg border px-4 py-3"
              style={{ borderColor: withAlpha(STAGE_COLOR, "55"), backgroundColor: withAlpha(STAGE_COLOR, "12") }}
            >
              <TappableText
                text={currentQuestion.answerEn}
                accentColor={STAGE_COLOR}
                className="text-base font-semibold text-zinc-900"
              />
            </div>

            {/* 解説は自己申告の前に、答え合わせと同時に必ず見せる（「なんとなく言えた」を選んだ人が
                核イメージを読み逃さないように）。 */}
            <div className="mb-4 flex gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
              <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: STAGE_COLOR }} />
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-line">{currentQuestion.coreImageJa}</p>
                {currentQuestion.deepDiveJa && (
                  <>
                    <button
                      type="button"
                      onClick={() => setDeepOpen((v) => !v)}
                      className="mt-2 inline-flex items-center gap-1 text-xs font-bold underline-offset-2 hover:underline"
                      style={{ color: STAGE_COLOR }}
                    >
                      他のケースも見る
                      <ChevronDown className={`h-3.5 w-3.5 transition-transform ${deepOpen ? "rotate-180" : ""}`} />
                    </button>
                    {deepOpen && (
                      <p className="mt-2 whitespace-pre-line border-t border-violet-200 pt-2 text-[13px] leading-relaxed">
                        {currentQuestion.deepDiveJa}
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSelfReport(true)}
                style={{ backgroundColor: STAGE_COLOR }}
                className="flex flex-1 items-center justify-center gap-1 sm:gap-1.5 rounded-lg px-2 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[.97] disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                言えた
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSelfReport(false)}
                className="flex flex-1 items-center justify-center gap-1 whitespace-nowrap sm:gap-1.5 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm font-medium text-zinc-600 transition-all duration-150 hover:border-zinc-400 active:scale-[.97] disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                言えなかった
              </button>
            </div>
          </div>
        )}
        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
