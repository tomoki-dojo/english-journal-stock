"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Hourglass, Mic, PartyPopper, RotateCcw, Square, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RoundHeader } from "./round-header";
import { GrowthBadge } from "./growth-badge";
import { GrowingKuwagataPanel } from "./growing-kuwagata-panel";
import { STAGE_COLORS, withAlpha } from "./stage-colors";
import { useSpeechRecognition } from "@/lib/use-speech-recognition";
import type { Stage3JudgeResult, Stage3Question, Stage3SessionResponse, Stage3UsageInfo } from "./types";

type ViewState = "loading" | "question" | "not_ready" | "done" | "limit_exceeded" | "error";
// prompt: まだ声に出していない。review: 発話（または手入力）の内容を確認・修正できる。
// judging: AI判定中。result: 判定結果を表示中。
type AnswerPhase = "prompt" | "review" | "judging" | "result";

const STAGE_COLOR = STAGE_COLORS[3];

// Stage3（型を崩して自分の言葉で言う）の練習画面。Stage1・2の「ラウンドでまとめて出す」方式とは
// 違い、1回のAI判定＝1回の本番の発話として扱う（_reference/speaking-roadmap-design.md参照）。
// アクティブセットの先頭にある表現1件について、現在のサブステップの問題を都度1問だけ受け取り、
// 声に出す（Web Speech APIで書き起こし）→内容を確認・修正→AIが意味の一致を判定、の流れで進める。
export function Stage3Practice() {
  const [state, setState] = useState<ViewState>("loading");
  const [question, setQuestion] = useState<Stage3Question | null>(null);
  const [usage, setUsage] = useState<Stage3UsageInfo | null>(null);
  const [answerPhase, setAnswerPhase] = useState<AnswerPhase>("prompt");
  const [manualText, setManualText] = useState("");
  const [result, setResult] = useState<Stage3JudgeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [limit, setLimit] = useState(0);
  const [remainingToUnlock, setRemainingToUnlock] = useState(0);
  // 「ヒント付き言い換え」のヒント（お手本の英文）を最初から見せず、押したときだけ出す
  // （2026-09-11 実機フィードバック：ヒントを常時表示すると、それをそのまま読み上げるだけで
  // 通ってしまい「自分の言葉で言う」練習にならない。AI判定側は一字一句同じでも正解のまま変えない
  // ——それ自体は正しい判定であり、ヒントを見るかどうかを自己申告制にする方が筋が良い）。
  const [hintRevealed, setHintRevealed] = useState(false);

  const speech = useSpeechRecognition({ continuous: true });

  async function loadSession() {
    setState("loading");
    setAnswerPhase("prompt");
    setManualText("");
    setResult(null);
    setError(null);
    setHintRevealed(false);
    speech.reset();

    try {
      const res = await fetch("/api/roadmap/stage3/session", { cache: "no-store" });
      const json: Stage3SessionResponse | { error: string } = await res.json();

      if (!res.ok) {
        throw new Error("error" in json ? json.error : "出題データの取得に失敗しました");
      }
      const session = json as Stage3SessionResponse;

      if (session.status === "not_ready") {
        setRemainingToUnlock(session.remainingToUnlock);
        setState("not_ready");
        return;
      }
      if (session.status === "done") {
        setState("done");
        return;
      }
      if (session.status === "limit_exceeded") {
        setLimit(session.limit);
        setState("limit_exceeded");
        return;
      }

      setQuestion(session.question);
      setUsage(session.usage);
      setState("question");
    } catch (err) {
      setError(err instanceof Error ? err.message : "出題データの取得に失敗しました");
      setState("error");
    }
  }

  useEffect(() => {
    loadSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 音声認識が完了したら（idleに戻り、かつ何か書き起こせていたら）自動でreviewフェーズへ進む。
  useEffect(() => {
    if (speech.status === "idle" && speech.transcript && answerPhase === "prompt") {
      setManualText(speech.transcript);
      setAnswerPhase("review");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speech.status, speech.transcript]);

  async function submitAnswer() {
    if (!question || manualText.trim().length === 0) return;
    setAnswerPhase("judging");
    setError(null);

    try {
      const res = await fetch("/api/roadmap/stage3/judge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expressionId: question.expressionId, userSpokenText: manualText.trim() }),
      });
      const json = await res.json();

      if (!res.ok) {
        if (res.status === 429) {
          setLimit(json.limit ?? 0);
          setState("limit_exceeded");
          return;
        }
        throw new Error(json.error ?? "判定処理に失敗しました");
      }

      setResult(json as Stage3JudgeResult);
      setUsage((json as Stage3JudgeResult).usage);
      setAnswerPhase("result");
    } catch (err) {
      setError(err instanceof Error ? err.message : "判定処理に失敗しました");
      setAnswerPhase("review");
    }
  }

  function retrySpeaking() {
    setManualText("");
    speech.reset();
    setAnswerPhase("prompt");
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
        <p className="text-sm text-zinc-500">Stage3はStage1をあと{remainingToUnlock}個卒業すると開きます。</p>
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
        <p className="text-sm text-zinc-700">今のところ、Stage3に出題できる範囲は全て卒業しました。</p>
        <p className="mt-1 text-xs text-zinc-400">Stage1をさらに進めると、次の表現がStage3に出てきます。</p>
        <Link
          href="/roadmap"
          className="mt-4 inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400"
        >
          部屋に戻る
        </Link>
      </div>
    );
  }

  if (state === "limit_exceeded") {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-100/30 px-6 py-10 text-center">
        <p className="text-sm text-zinc-700">今日のAI判定は{limit}回まで使い切りました。</p>
        <p className="mt-1 text-xs text-zinc-400">また明日挑戦できます。Proにすると上限が大きく緩和されます。</p>
        <Link
          href="/roadmap"
          className="mt-4 inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400"
        >
          部屋に戻る
        </Link>
      </div>
    );
  }

  if (!question) {
    return <p className="text-sm text-zinc-400">読み込み中...</p>;
  }

  const hasTint = question.warmth > 0;
  const usageLabel = usage ? `今日のAI判定 あと${usage.remaining}回` : "";

  return (
    <div>
      <RoundHeader stage={3} subFormatLabel={question.subStep} usageLabel={usageLabel} />

      <div
        className={cn("rounded-xl border p-6", hasTint ? "" : "border-zinc-200 bg-zinc-100/50")}
        style={
          hasTint
            ? {
                borderColor: withAlpha(STAGE_COLOR, "55"),
                backgroundColor: withAlpha(STAGE_COLOR, "12"),
              }
            : undefined
        }
      >
        <div className="mb-1 flex items-center gap-2">
          <GrowthBadge stage={3} warmth={question.warmth} />
          {question.meaningJa && <p className="text-lg font-medium text-zinc-900">{question.meaningJa}</p>}
        </div>

        {question.hintExpressionEn &&
          (hintRevealed ? (
            <p className="mb-3 rounded-md bg-zinc-100/70 px-3 py-1.5 text-sm text-zinc-500">
              ヒント: {question.hintExpressionEn}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => setHintRevealed(true)}
              className="mb-3 rounded-md border border-dashed border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-700"
            >
              ヒントを出す
            </button>
          ))}

        {question.subStep === "ミニ拡張" && (
          <p className="mb-3 text-xs text-zinc-400">意味に加えて、状況を一言足して言ってみよう。</p>
        )}

        {answerPhase === "prompt" && (
          <div className="text-center">
            {speech.status === "unsupported" ? (
              <div>
                <p className="mb-2 text-xs text-zinc-400">
                  お使いのブラウザは音声入力に対応していないため、テキストで入力してください。
                </p>
                <textarea
                  value={manualText}
                  onChange={(e) => setManualText(e.target.value)}
                  placeholder="声に出す代わりに、ここに英文を入力"
                  rows={3}
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
                />
                <button
                  type="button"
                  disabled={manualText.trim().length === 0}
                  onClick={() => setAnswerPhase("review")}
                  style={{ backgroundColor: STAGE_COLOR }}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[.97] disabled:opacity-50"
                >
                  この内容で進む
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={speech.status === "listening" ? speech.stop : speech.start}
                style={{ backgroundColor: speech.status === "listening" ? "#dc2626" : STAGE_COLOR }}
                className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-white shadow-md transition-all duration-150 hover:opacity-90 active:scale-95"
              >
                {speech.status === "listening" ? <Square className="h-6 w-6" /> : <Mic className="h-6 w-6" />}
              </button>
            )}
            <p className="mt-3 text-xs text-zinc-400">
              {speech.status === "listening" ? "聞き取り中...もう一度タップで終了" : "タップして声に出す"}
            </p>
            {speech.status === "listening" && speech.liveText && (
              <p className="mt-3 rounded-lg bg-white px-3 py-2 text-left text-sm text-zinc-700">{speech.liveText}</p>
            )}
            {speech.errorMessage && <p className="mt-2 text-xs text-red-600">{speech.errorMessage}</p>}
          </div>
        )}

        {(answerPhase === "review" || answerPhase === "judging") && (
          <div className="animate-question-card-enter">
            <p className="mb-1.5 text-xs text-zinc-400">この内容で判定します（間違っていれば修正できます）</p>
            <textarea
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              disabled={answerPhase === "judging"}
              rows={3}
              className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none disabled:opacity-60"
            />
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                disabled={answerPhase === "judging" || manualText.trim().length === 0}
                onClick={submitAnswer}
                style={{ backgroundColor: STAGE_COLOR }}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[.97] disabled:opacity-50"
              >
                {answerPhase === "judging" ? "判定中..." : "判定する"}
              </button>
              <button
                type="button"
                disabled={answerPhase === "judging"}
                onClick={retrySpeaking}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-600 transition-all duration-150 hover:border-zinc-400 active:scale-[.97] disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                言い直す
              </button>
            </div>
          </div>
        )}

        {answerPhase === "result" && result && (
          <div className="animate-question-card-enter">
            <div
              className={cn(
                "mb-3 flex items-center gap-2 rounded-lg border px-4 py-3",
                result.correct ? "border-emerald-200 bg-emerald-50" : "border-zinc-300 bg-zinc-50"
              )}
            >
              {result.correct ? (
                <Check className="h-5 w-5 shrink-0 text-emerald-600" />
              ) : (
                <X className="h-5 w-5 shrink-0 text-zinc-500" />
              )}
              <p className="text-sm text-zinc-800">{result.feedbackJa}</p>
            </div>

            <div className="mb-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-lg border border-zinc-200 bg-white px-3 py-2">
                <p className="mb-0.5 text-[10px] font-semibold text-zinc-400">あなたの解答</p>
                <p className="text-sm text-zinc-800">{manualText.trim()}</p>
              </div>
              <div className="rounded-lg border bg-white px-3 py-2" style={{ borderColor: withAlpha(STAGE_COLOR, "66") }}>
                <p className="mb-0.5 text-[10px] font-semibold" style={{ color: STAGE_COLOR }}>
                  模範解答
                </p>
                <p className="text-sm text-zinc-800">{result.modelAnswerEn}</p>
              </div>
            </div>

            {result.graduated && (
              <div className="mb-3 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <PartyPopper className="h-4 w-4" />
                この表現、Stage3を卒業しました
              </div>
            )}
            {result.graduated && <GrowingKuwagataPanel />}

            <button
              type="button"
              onClick={loadSession}
              style={{ backgroundColor: STAGE_COLOR }}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[.97]"
            >
              次へ
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
