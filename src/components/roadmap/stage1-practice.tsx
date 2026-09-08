"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, PartyPopper, Volume2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RoundHeader } from "./round-header";
import { GrowthBadge } from "./growth-badge";
import { STAGE_COLORS, withAlpha } from "./stage-colors";
import type { Stage1RoundQuestion, Stage1RoundResponse, WarmthLevel } from "./types";

type ViewState = "loading" | "round" | "round_complete" | "done" | "error";

type QuestionResult = {
  expressionId: string;
  expressionEn: string;
  correct: boolean;
  graduated: boolean;
};

const STAGE_COLOR = STAGE_COLORS[1];
// warmth（0〜3）に応じて、フレーズカードの縁・背景にStage1カラーをうっすら重ねる度合い。
const WARMTH_BORDER_ALPHA: Record<WarmthLevel, string> = { 0: "00", 1: "33", 2: "55", 3: "80" };
const WARMTH_BG_ALPHA: Record<WarmthLevel, string> = { 0: "00", 1: "0a", 2: "12", 3: "1a" };

// Stage1（音読・シャドーイング）の練習画面。
// アクティブセット（未卒業フレーズの先頭7件）から5件ランダムに出題する「ラウンド」単位で進行する。
// 1問終わるごとに次のフレーズに切り替わるので、1フレーズを卒業するまで固定、という単調さを避ける。
// AIによる正誤判定はせず、「言えた/言えなかった」の自己申告で進める。
export function Stage1Practice() {
  const [state, setState] = useState<ViewState>("loading");
  const [questions, setQuestions] = useState<Stage1RoundQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [entering, setEntering] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentQuestion = questions[currentIndex];

  async function loadRound() {
    setState("loading");
    setCurrentIndex(0);
    setResults([]);
    setAudioUrl(null);
    setError(null);

    try {
      const res = await fetch("/api/roadmap/stage1/round");
      if (!res.ok) throw new Error("出題データの取得に失敗しました");
      const json: Stage1RoundResponse = await res.json();

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

  // 問題が切り替わるたびに軽いフェード/スライド演出を入れる
  // （「問題が変わったのかわかりにくい」という指摘への対応）。
  useEffect(() => {
    setEntering(true);
    const id = requestAnimationFrame(() => setEntering(false));
    return () => cancelAnimationFrame(id);
  }, [currentIndex, state]);

  async function handlePlayAudio() {
    if (!currentQuestion || !currentQuestion.hasAudio || audioLoading) return;
    setAudioLoading(true);
    try {
      const res = await fetch(
        `/api/roadmap/stage1/audio?expressionId=${encodeURIComponent(currentQuestion.expressionId)}`
      );
      if (!res.ok) throw new Error("音声の取得に失敗しました");
      const json = await res.json();
      setAudioUrl(json.url);
      new Audio(json.url).play().catch(() => {});
    } catch {
      // 音声取得に失敗しても練習自体は続行できる
    } finally {
      setAudioLoading(false);
    }
  }

  async function handleReport(correct: boolean) {
    if (!currentQuestion || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/roadmap/stage1/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expressionId: currentQuestion.expressionId, correct }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "結果の保存に失敗しました");
      }
      const json = await res.json();

      setResults((prev) => [
        ...prev,
        {
          expressionId: currentQuestion.expressionId,
          expressionEn: currentQuestion.expressionEn,
          correct,
          graduated: Boolean(json.result?.graduated),
        },
      ]);
      setAudioUrl(null);

      if (currentIndex + 1 < questions.length) {
        setCurrentIndex((i) => i + 1);
      } else {
        setState("round_complete");
      }
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
        <p className="text-sm text-zinc-700">Stage1（音読・シャドーイング）は全て卒業しました。</p>
        <p className="mt-1 text-xs text-zinc-400">Stage2は準備中です。もうしばらくお待ちください。</p>
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
      <div className="rounded-xl border border-zinc-200 bg-zinc-100/50 p-6 text-center">
        <PartyPopper className="mx-auto mb-3 h-6 w-6" style={{ color: STAGE_COLOR }} />
        <p className="text-sm font-medium text-zinc-900">
          今回のラウンド：{results.length}問中{correctCount}問「言えた」
        </p>

        {graduated.length > 0 && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-left text-sm text-emerald-800">
            <p className="mb-1 font-medium">卒業したフレーズ</p>
            <ul className="space-y-0.5">
              {graduated.map((r) => (
                <li key={r.expressionId}>{r.expressionEn}</li>
              ))}
            </ul>
          </div>
        )}

        {/* 箱庭ビジュアル実装後、ここに増築・小物パーツなどの街の変化を表示する予定 */}
        <div className="mt-4 rounded-lg border border-dashed border-zinc-300 bg-zinc-50 p-3 text-xs text-zinc-400">
          （街の変化はここに表示予定です）
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={loadRound}
            style={{ backgroundColor: STAGE_COLOR }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
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
      <RoundHeader stage={1} current={currentIndex + 1} total={questions.length} />

      <div
        className={cn(
          "rounded-xl border p-6 transition-all duration-200",
          hasTint ? "" : "border-zinc-200 bg-zinc-100/50",
          entering ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100"
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
        <p className="mb-3 text-xs text-zinc-400">
          音声を真似して声に出す→一緒に言う→少し遅れて言う、と徐々にレベルを上げてみましょう。
        </p>

        <div className="mb-1 flex items-center gap-2">
          <GrowthBadge stage={1} warmth={currentQuestion.warmth} />
          <p className="text-lg font-medium text-zinc-900">{currentQuestion.expressionEn}</p>
        </div>
        {currentQuestion.meaningJa && (
          <p className="mb-4 text-sm text-zinc-500">{currentQuestion.meaningJa}</p>
        )}

        {currentQuestion.hasAudio && (
          <button
            type="button"
            onClick={handlePlayAudio}
            disabled={audioLoading}
            className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:border-zinc-400 disabled:opacity-50"
          >
            <Volume2 className="h-4 w-4" />
            {audioLoading ? "読み込み中..." : "音声を聴く"}
          </button>
        )}

        <p className="mb-3 text-xs text-zinc-400">声に出して練習したら、結果を選んでください。</p>
        <div className="flex gap-3">
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleReport(true)}
            style={{ backgroundColor: STAGE_COLOR }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            言えた
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleReport(false)}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-400 disabled:opacity-50"
          >
            <X className="h-4 w-4" />
            言えなかった
          </button>
        </div>
        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      </div>

      {audioUrl === null && !currentQuestion.hasAudio && (
        <p className="mt-3 text-xs text-zinc-400">このフレーズには音声がまだありません。テキストで練習してください。</p>
      )}
    </div>
  );
}
