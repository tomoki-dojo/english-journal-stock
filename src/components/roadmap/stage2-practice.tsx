"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Hourglass, PartyPopper, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RoundHeader } from "./round-header";
import { GrowthBadge } from "./growth-badge";
import { GrowingKuwagataPanel } from "./growing-kuwagata-panel";
import { STAGE_COLORS, withAlpha } from "./stage-colors";
import { TappableText } from "./tappable-text";
import { getStage2SubFormatLabel } from "./types";
import type { Stage2RoundQuestion, Stage2RoundResponse, WarmthLevel } from "./types";

type ViewState = "loading" | "round" | "round_complete" | "not_ready" | "done" | "error";

type QuestionResult = {
  expressionId: string;
  expressionEn: string;
  correct: boolean;
  graduated: boolean;
};

const STAGE_COLOR = STAGE_COLORS[2];
// warmth（0〜3）に応じて、問題カードの縁・背景にStage2カラーをうっすら重ねる度合い。
const WARMTH_BORDER_ALPHA: Record<WarmthLevel, string> = { 0: "00", 1: "33", 2: "55", 3: "80" };
const WARMTH_BG_ALPHA: Record<WarmthLevel, string> = { 0: "00", 1: "0a", 2: "12", 3: "1a" };

// ラウンド終了時のキラキラ演出用（Stage1と同じ配置ロジック）。
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

// Stage2（瞬間英作文）の練習画面。
// アクティブセット（Stage1卒業済み＆Stage2コンテンツありのフレーズ、先頭7件）から
// 5件ランダムに出題する「ラウンド」単位で進行する（Stage1と同じ方式）。
// 「声に出すこと」が全Stage共通の大前提のため、穴埋め・全文瞬間英作文・文脈からの想起の
// 3サブステップも、4択をクリックして正誤判定する形にはせず「声に出す→答えを確認する→
// 言えたか自己申告する」（kind: "produce"）で進行する。以前作った選択肢データは、答え合わせ画面の
// 「似ているけど違う表現」の参考表示として使う。微改変は変わらず自由発話の自己申告。
export function Stage2Practice() {
  const [state, setState] = useState<ViewState>("loading");
  const [questions, setQuestions] = useState<Stage2RoundQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [reaction, setReaction] = useState<"happy" | "sad" | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [remainingToUnlock, setRemainingToUnlock] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const currentQuestion = questions[currentIndex];

  async function loadRound() {
    setState("loading");
    setCurrentIndex(0);
    setResults([]);
    setRevealed(false);
    setError(null);

    try {
      const res = await fetch("/api/roadmap/stage2/round", { cache: "no-store" });
      if (!res.ok) throw new Error("出題データの取得に失敗しました");
      const json: Stage2RoundResponse = await res.json();

      if (json.status === "not_ready") {
        setRemainingToUnlock(json.remainingToUnlock);
        setState("not_ready");
        return;
      }
      if (json.status === "done") {
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

  async function submitResult(correct: boolean) {
    if (!currentQuestion || submitting) return;
    setSubmitting(true);
    setError(null);

    const displayText =
      currentQuestion.kind === "free" ? currentQuestion.expressionEn : currentQuestion.answerText;

    try {
      const res = await fetch("/api/roadmap/stage2/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expressionId: currentQuestion.expressionId, correct }),
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
          expressionId: currentQuestion.expressionId,
          expressionEn: displayText,
          correct,
          graduated: Boolean(json.result?.graduated),
        },
      ]);

      if (currentIndex + 1 < questions.length) {
        setCurrentIndex((i) => i + 1);
        setRevealed(false);
      } else {
        setState("round_complete");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "結果の保存に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  function handleReveal() {
    if (!currentQuestion || currentQuestion.kind !== "produce" || revealed) return;
    setRevealed(true);
  }

  if (state === "loading") {
    return <p className="text-sm text-zinc-400">読み込み中...</p>;
  }

  if (state === "error") {
    return <p className="text-sm text-red-600">{error ?? "エラーが発生しました"}</p>;
  }

  if (state === "not_ready") {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-100/30 px-6 py-10 text-center">
        <Hourglass className="mx-auto mb-3 h-6 w-6 text-zinc-400" />
        <p className="text-sm text-zinc-500">Stage2はStage1の表現をあと{remainingToUnlock}個習得すると開きます。</p>
        <Link
          href="/roadmap/stage1"
          className="mt-4 inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400"
        >
          Stage1に進む
        </Link>
      </div>
    );
  }

  if (state === "done") {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-100/50 px-6 py-10 text-center">
        <PartyPopper className="mx-auto mb-3 h-6 w-6" style={{ color: STAGE_COLOR }} />
        <p className="text-sm text-zinc-700">今のところ、Stage2に出題できる範囲は全て習得しました。</p>
        <p className="mt-1 text-xs text-zinc-400">Stage1をさらに進めると、次のフレーズがStage2に出てきます。</p>
        <Link
          href="/roadmap"
          className="mt-4 inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400"
        >
          部屋に戻る
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
          今回のラウンド：{results.length}問中{correctCount}問正解
        </p>

        {graduated.length > 0 && (
          <div className="relative mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-left text-sm text-emerald-800">
            <p className="mb-1 font-medium">習得したフレーズ</p>
            <ul className="space-y-0.5">
              {graduated.map((r) => (
                <li key={r.expressionId}>{r.expressionEn}</li>
              ))}
            </ul>
          </div>
        )}

        {graduated.length > 0 && <GrowingKuwagataPanel />}

        <div className="relative mt-6 flex gap-3">
          <button
            type="button"
            onClick={loadRound}
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
    );
  }

  if (!currentQuestion) {
    return <p className="text-sm text-zinc-400">読み込み中...</p>;
  }

  const hasTint = currentQuestion.warmth > 0;
  const subFormatLabel = getStage2SubFormatLabel(currentQuestion.subStep);

  return (
    <div>
      <RoundHeader
        stage={2}
        subFormatLabel={subFormatLabel}
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
        {currentQuestion.kind === "produce" ? (
          <div>
            {currentQuestion.variationLabel && (
              <p className="mb-1 text-xs font-semibold" style={{ color: STAGE_COLOR }}>
                {currentQuestion.variationLabel}
              </p>
            )}
            <div className="mb-1 flex items-center gap-2">
              <GrowthBadge stage={2} warmth={currentQuestion.warmth} />
              {currentQuestion.promptEn ? (
                <TappableText
                  text={currentQuestion.promptEn}
                  accentColor={STAGE_COLOR}
                  className="text-lg font-medium text-zinc-900"
                />
              ) : currentQuestion.promptJa ? (
                <p className="text-lg font-medium text-zinc-900">{currentQuestion.promptJa}</p>
              ) : null}
            </div>
            {/*
              穴埋め音読（promptEnが入るサブステップ）だけ、meaningJaを手がかりとして併記する。
              以前はここでmeaningJaが完全に捨てられており（データはあるのに未使用）、空欄の英文
              だけを見て何も思い出せない場合に手がかりゼロになっていた。選択肢クリック式には
              戻さず、「産出前にヒントを見る」形で解決する（2026-09-11 実機フィードバックを受けて追加）。
              全文瞬間英作文・文脈からの想起はpromptJa側に既に適切なヒント（直訳／状況説明）が
              入っているため、ここでは重複させない。
            */}
            {currentQuestion.baseExpressionEn && (
              <p className="mb-3 text-sm text-zinc-400">もとの表現: {currentQuestion.baseExpressionEn}</p>
            )}
            {currentQuestion.promptEn && currentQuestion.meaningJa && (
              <p className="mb-3 text-sm text-zinc-500">{currentQuestion.meaningJa}</p>
            )}
            <p className="mb-4 text-xs text-zinc-400">まず声に出して言ってみよう。言えたら答えを確認します。</p>

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
                    text={currentQuestion.answerText}
                    accentColor={STAGE_COLOR}
                    className="text-base font-semibold text-zinc-900"
                  />
                </div>

                {currentQuestion.referenceChoices.length > 0 && (
                  <div className="mb-4">
                    <p className="mb-1.5 text-xs text-zinc-400">
                      {currentQuestion.subStep === "穴埋め音読"
                        ? "似ているけど、ここでは不自然な言い方"
                        : "似た場面で使う他の表現"}
                    </p>
                    <ul className="space-y-1">
                      {currentQuestion.referenceChoices.map((choice) => (
                        <li key={choice.text} className="rounded-md bg-zinc-100/70 px-3 py-1.5">
                          <p className="text-sm text-zinc-500">{choice.text}</p>
                          {/* AI生成の「なぜ不自然か」の理由（穴埋め音読のみ。2026-09-11 実機フィードバックで追加）。
                              全文瞬間英作文・文脈からの想起はreasonJaが常に空なので、ここは出ない。 */}
                          {choice.reasonJa && <p className="mt-0.5 text-xs text-zinc-400">{choice.reasonJa}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => submitResult(true)}
                    style={{ backgroundColor: STAGE_COLOR }}
                    className="flex flex-1 items-center justify-center gap-1 sm:gap-1.5 rounded-lg px-2 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[.97] disabled:opacity-50"
                  >
                    <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    言えた
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => submitResult(false)}
                    className="flex flex-1 items-center justify-center gap-1 whitespace-nowrap sm:gap-1.5 rounded-lg border border-zinc-300 bg-white px-2 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm font-medium text-zinc-600 transition-all duration-150 hover:border-zinc-400 active:scale-[.97] disabled:opacity-50"
                  >
                    <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                    言えなかった
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <div className="mb-1 flex items-center gap-2">
              <GrowthBadge stage={2} warmth={currentQuestion.warmth} />
              <TappableText
                text={currentQuestion.expressionEn}
                accentColor={STAGE_COLOR}
                className="text-lg font-medium text-zinc-900"
              />
            </div>
            {currentQuestion.meaningJa && (
              <p className="mb-4 text-sm text-zinc-500">{currentQuestion.meaningJa}</p>
            )}
            <div className="flex gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => submitResult(true)}
                style={{ backgroundColor: STAGE_COLOR }}
                className="flex flex-1 items-center justify-center gap-1 sm:gap-1.5 rounded-lg px-2 py-2 text-xs sm:px-4 sm:py-2.5 sm:text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[.97] disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
                言えた
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => submitResult(false)}
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
