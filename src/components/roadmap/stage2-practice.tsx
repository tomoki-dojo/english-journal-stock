"use client";

import { useEffect, useState } from "react";
import { Check, Hourglass, PartyPopper, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Stage2NextResponse, Stage2SubStep } from "./types";

const SUB_STEP_LABELS: Record<Stage2SubStep, string> = {
  穴埋め音読: "穴埋め音読（空欄に入る語句を選んで、声に出して読む）",
  全文瞬間英作文: "全文瞬間英作文（日本語を見て、正しい英文を選ぶ）",
  文脈からの想起: "文脈からの想起（思い出しながら、正しい英文を選ぶ）",
  微改変: "微改変（少し変えて、自分の言葉で言ってみる）",
};

const SUB_STEP_ORDER: Stage2SubStep[] = ["穴埋め音読", "全文瞬間英作文", "文脈からの想起", "微改変"];

type LoadState = "loading" | "ready" | "done" | "not_ready" | "error";

// Stage2（瞬間英作文）の練習画面。
// 穴埋め・全文選択の3サブステップは選択式（正誤はクライアント側で判定して記録するだけ）、
// 微改変は自由発話の自己申告（Stage1と同じ思想でAI不要）。
export function Stage2Practice() {
  const [state, setState] = useState<LoadState>("loading");
  const [next, setNext] = useState<Stage2NextResponse | null>(null);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [justGraduated, setJustGraduated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadNext() {
    setState("loading");
    setJustGraduated(false);
    setSelectedIndex(null);
    setError(null);

    try {
      const res = await fetch("/api/roadmap/stage2/next");
      if (!res.ok) throw new Error("出題データの取得に失敗しました");
      const json: Stage2NextResponse = await res.json();
      setNext(json);
      setState(json.status === "question" ? "ready" : json.status);
    } catch (err) {
      setError(err instanceof Error ? err.message : "出題データの取得に失敗しました");
      setState("error");
    }
  }

  useEffect(() => {
    loadNext();
  }, []);

  async function submitResult(correct: boolean) {
    if (!next || next.status !== "question" || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/roadmap/stage2/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expressionId: next.expressionId, correct }),
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

  function handleChoiceSelect(choiceIndex: number) {
    if (!next || next.status !== "question" || next.kind !== "choice" || selectedIndex !== null) return;
    setSelectedIndex(choiceIndex);
    const isCorrect = choiceIndex === next.correctIndex;
    setTimeout(() => submitResult(isCorrect), 600);
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
        <p className="text-sm text-zinc-500">
          Stage2はStage1を卒業したフレーズから始まります。まずはStage1を進めてください。
        </p>
      </div>
    );
  }

  if (state === "done" || !next || next.status !== "question") {
    return (
      <div className="rounded-xl border border-zinc-200 bg-zinc-100/50 px-6 py-10 text-center">
        <PartyPopper className="mx-auto mb-3 h-6 w-6 text-accent" />
        <p className="text-sm text-zinc-700">
          今のところ、Stage2に出題できる範囲は全て卒業しました。
        </p>
        <p className="mt-1 text-xs text-zinc-400">
          Stage1をさらに進めると、次のフレーズがStage2に出てきます。
        </p>
      </div>
    );
  }

  const { subStep, remainingCount, totalCount } = next;

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
          {SUB_STEP_ORDER.map((s) => (
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
        <p className="mb-4 text-xs text-zinc-400">{SUB_STEP_LABELS[subStep]}</p>

        {next.kind === "choice" ? (
          <div>
            {next.promptEn ? (
              <p className="mb-4 text-lg font-medium text-zinc-900">{next.promptEn}</p>
            ) : next.meaningJa ? (
              <p className="mb-4 text-lg font-medium text-zinc-900">{next.meaningJa}</p>
            ) : null}

            <div className="space-y-2">
              {next.choices.map((choice, i) => {
                const isSelected = selectedIndex === i;
                const isCorrectChoice = i === next.correctIndex;
                const showResult = selectedIndex !== null;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={selectedIndex !== null}
                    onClick={() => handleChoiceSelect(i)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-left text-sm transition-colors",
                      showResult && isCorrectChoice
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : showResult && isSelected
                          ? "border-red-300 bg-red-50 text-red-800"
                          : "border-zinc-200 bg-white text-zinc-700 hover:border-accent/40"
                    )}
                  >
                    {choice}
                    {showResult && isCorrectChoice && <Check className="h-4 w-4" />}
                    {showResult && isSelected && !isCorrectChoice && <X className="h-4 w-4" />}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <div>
            <p className="mb-1 text-lg font-medium text-zinc-900">{next.expressionEn}</p>
            {next.meaningJa && <p className="mb-4 text-sm text-zinc-500">{next.meaningJa}</p>}
            <p className="mb-3 text-xs text-zinc-400">
              主語や時制を少し変えて、自分の言葉で声に出してみてください。言えたら結果を選んでください。
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={() => submitResult(true)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:opacity-50"
              >
                <Check className="h-4 w-4" />
                言えた
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => submitResult(false)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-400 disabled:opacity-50"
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
