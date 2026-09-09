"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Lightbulb, PartyPopper, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RoundHeader } from "./round-header";
import { GrowthBadge } from "./growth-badge";
import { STAGE_COLORS, withAlpha } from "./stage-colors";
import type { Stage0RoundQuestion, Stage0RoundResponse, WarmthLevel } from "./types";

type ViewState = "loading" | "round" | "round_complete" | "done" | "error";

type QuestionResult = {
  usageRuleId: string;
  title: string;
  correct: boolean;
  graduated: boolean;
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
export function Stage0Practice() {
  const [state, setState] = useState<ViewState>("loading");
  const [questions, setQuestions] = useState<Stage0RoundQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentQuestion = questions[currentIndex];

  async function loadRound() {
    setState("loading");
    setCurrentIndex(0);
    setResults([]);
    setRevealed(false);
    setError(null);

    try {
      const res = await fetch("/api/roadmap/stage0/round", { cache: "no-store" });
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
    loadRound();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleReveal() {
    if (!currentQuestion || revealed) return;
    setRevealed(true);
  }

  // 次の問題へ進む（ラウンド最後なら結果画面へ）。
  function advanceToNext() {
    setRevealed(false);
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

  if (state === "loading") {
    return <p className="text-sm text-zinc-400">読み込み中...</p>;
  }

  if (state === "error") {
    return <p className="text-sm text-red-600">{error ?? "エラーが発生しました"}</p>;
  }

  if (state === "done") {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-100/50 px-6 py-10 text-center">
        <PartyPopper className="mx-auto mb-3 h-6 w-6" style={{ color: STAGE_COLOR }} />
        <p className="text-sm text-zinc-700">今のところ、Stage0の感覚は全て卒業しました。</p>
        <p className="mt-1 text-xs text-zinc-400">新しい感覚が追加されたら、またここに出てきます。</p>
        <Link
          href="/roadmap"
          className="mt-4 inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400"
        >
          街に戻る
        </Link>
      </div>
    );
  }

  if (state === "round_complete") {
    const correctCount = results.filter((r) => r.correct).length;
    const graduated = results.filter((r) => r.graduated);

    return (
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

        <div className="relative mt-6 flex gap-3">
          <button
            type="button"
            onClick={loadRound}
            style={{ backgroundColor: STAGE_COLOR }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[.97]"
          >
            もう1ラウンド
          </button>
          <Link
            href="/roadmap"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400"
          >
            街に戻る
          </Link>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return <p className="text-sm text-zinc-400">読み込み中...</p>;
  }

  const hasTint = currentQuestion.warmth > 0;

  return (
    <div>
      <RoundHeader stage={0} subFormatLabel="感覚" current={currentIndex + 1} total={questions.length} />

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
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed px-4 py-2.5 text-sm font-medium transition-all duration-150 active:scale-[.97]"
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
              <p className="text-base font-semibold text-zinc-900">{currentQuestion.answerEn}</p>
            </div>

            {/* 解説は自己申告の前に、答え合わせと同時に必ず見せる（「なんとなく言えた」を選んだ人が
                核イメージを読み逃さないように）。 */}
            <div className="mb-4 flex gap-2 rounded-lg border border-violet-200 bg-violet-50 p-3 text-sm text-violet-900">
              <Lightbulb className="mt-0.5 h-4 w-4 flex-shrink-0" style={{ color: STAGE_COLOR }} />
              <p>{currentQuestion.coreImageJa}</p>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSelfReport(true)}
                style={{ backgroundColor: STAGE_COLOR }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[.97] disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                言えた
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => handleSelfReport(false)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-600 transition-all duration-150 hover:border-zinc-400 active:scale-[.97] disabled:opacity-50"
              >
                <X className="h-4 w-4" />
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
