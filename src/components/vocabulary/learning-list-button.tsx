"use client";

import { useState } from "react";
import Link from "next/link";
import { BrainCircuit, Check, Lock } from "lucide-react";
import type { Plan } from "@/lib/plan";
import { cn } from "@/lib/utils";

type LearningListButtonProps = {
  vocabularyId: string;
  plan: Plan;
  initialAdded?: boolean;
};

// 単語を学習リスト（間隔反復の対象）に追加/削除するボタン。
// Pro/Premium限定機能。audio-play-button.tsxと同じ「Freeはロック表示のみ」パターン。
export function LearningListButton({
  vocabularyId,
  plan,
  initialAdded = false,
}: LearningListButtonProps) {
  const [added, setAdded] = useState(initialAdded);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  if (plan === "free") {
    return (
      <Link
        href="/settings"
        aria-label="単語学習リストへの追加はPro会員限定です"
        title="単語学習リストへの追加はPro会員限定です"
        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-zinc-200/40 px-3 py-2 text-xs font-medium text-zinc-400"
      >
        <Lock className="h-3.5 w-3.5" />
        学習リストに追加
      </Link>
    );
  }

  async function handleToggle() {
    if (pending) return;
    setPending(true);
    setError("");

    const next = !added;

    try {
      const res = next
        ? await fetch("/api/vocabulary/learning-list", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ vocabularyId }),
          })
        : await fetch(`/api/vocabulary/learning-list/${vocabularyId}`, { method: "DELETE" });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "更新に失敗しました");
        return;
      }

      setAdded(next);
    } catch {
      setError("通信に失敗しました");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={handleToggle}
        disabled={pending}
        aria-pressed={added}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          added
            ? "border-accent/30 bg-accent/10 text-accent"
            : "border-zinc-300 bg-zinc-200/40 text-zinc-600 hover:border-zinc-400 hover:text-zinc-900"
        )}
      >
        {added ? <Check className="h-3.5 w-3.5" /> : <BrainCircuit className="h-3.5 w-3.5" />}
        {added ? "学習リストに追加済み" : "学習リストに追加"}
      </button>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
