"use client";

import { useEffect, useState } from "react";
import { Check, PartyPopper, Volume2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Stage1NextResponse, Stage1SubStep } from "./types";

const SUB_STEP_LABELS: Record<Stage1SubStep, string> = {
  リピーティング: "リピーティング（聞いてすぐ真似する）",
  オーバーラッピング: "オーバーラッピング（音声と一緒に声に出す）",
  シャドーイング: "シャドーイング（少し遅れて声に出す）",
};

type LoadState = "loading" | "ready" | "done" | "error";

// Stage1（音読・シャドーイング）の練習画面。
// AIによる正誤判定はせず、「言えた/言えなかった」の自己申告で進める（設計通りコストゼロ）。
export function Stage1Practice() {
  const [state, setState] = useState<LoadState>("loading");
  const [next, setNext] = useState<Stage1NextResponse | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [justGraduated, setJustGraduated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadNext() {
    setState("loading");
    setJustGraduated(false);
    setAudioUrl(null);
    setError(null);

    try {
      const res = await fetch("/api/roadmap/stage1/next");
      if (!res.ok) throw new Error("出題データの取得に失敗しました");
      const json: Stage1NextResponse = await res.json();
      setNext(json);
      setState(json.done ? "done" : "ready");
    } catch (err) {
      setError(err instanceof Error ? err.message : "出題データの取得に失敗しました");
      setState("error");
    }
  }

  useEffect(() => {
    loadNext();
  }, []);

  async function handlePlayAudio() {
    if (!next || next.done || !next.phrase.hasAudio || audioLoading) return;
    setAudioLoading(true);
    try {
      const res = await fetch(
        `/api/roadmap/stage1/audio?expressionId=${encodeURIComponent(next.phrase.expressionId)}`
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
    if (!next || next.done || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/roadmap/stage1/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expressionId: next.phrase.expressionId, correct }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "結果の保存に失敗しました");
      }
      const json = await res.json();

      if (json.result.graduated) {
        setJustGraduated(true);
        setTimeout(loadNext, 1200);
      } else {
        await loadNext();
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

  if (state === "done" || !next || next.done) {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-100/50 px-6 py-10 text-center">
        <PartyPopper className="mx-auto mb-3 h-6 w-6 text-accent" />
        <p className="text-sm text-zinc-700">Stage1（音読・シャドーイング）は全て卒業しました。</p>
        <p className="mt-1 text-xs text-zinc-400">Stage2は準備中です。もうしばらくお待ちください。</p>
      </div>
    );
  }

  const { phrase, subStep, remainingCount, totalCount } = next;

  return (
    <div>
      {justGraduated && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
          <PartyPopper className="h-4 w-4" />
          このフレーズを卒業しました！次のフレーズに進みます。
        </div>
      )}

      <div className="mb-4 flex items-center justify-between text-xs text-zinc-500">
        <span>
          残り {remainingCount} / {totalCount}
        </span>
        <div className="flex gap-1">
          {(["リピーティング", "オーバーラッピング", "シャドーイング"] as Stage1SubStep[]).map((s) => (
            <span
              key={s}
              className={cn(
                "rounded-full px-2 py-0.5",
                s === subStep ? "bg-accent/10 text-accent font-medium" : "text-zinc-300"
              )}
            >
              {s}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-100/50 p-6">
        <p className="mb-1 text-xs text-zinc-400">{SUB_STEP_LABELS[subStep]}</p>
        <p className="mb-4 text-lg font-medium text-zinc-900">{phrase.expressionEn}</p>
        {phrase.meaningJa && <p className="mb-4 text-sm text-zinc-500">{phrase.meaningJa}</p>}

        {phrase.hasAudio && (
          <button
            type="button"
            onClick={handlePlayAudio}
            disabled={audioLoading}
            className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:border-accent/40 disabled:opacity-50"
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
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
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

      {audioUrl === null && !phrase.hasAudio && (
        <p className="mt-3 text-xs text-zinc-400">このフレーズには音声がまだありません。テキストで練習してください。</p>
      )}
    </div>
  );
}
