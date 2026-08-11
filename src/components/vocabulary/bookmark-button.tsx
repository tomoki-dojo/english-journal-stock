"use client";

import { useState } from "react";
import { Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";

type BookmarkButtonProps = {
  vocabularyId: string;
  initialSaved?: boolean;
};

// 単語をお気に入り（マイリスト）に保存/削除するボタン。Free/Pro問わず誰でも使える。
// expression-card.tsxの保存ボタンと同じアイコン・見た目のパターン。
export function BookmarkButton({ vocabularyId, initialSaved = false }: BookmarkButtonProps) {
  const [saved, setSaved] = useState(initialSaved);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function handleToggle() {
    if (pending) return;
    setPending(true);
    setError("");

    const next = !saved;

    try {
      const res = next
        ? await fetch("/api/saved-vocabulary", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ vocabularyId }),
          })
        : await fetch(`/api/saved-vocabulary/${vocabularyId}`, { method: "DELETE" });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          res.status === 401 ? "ログインすると保存できます" : (data.error ?? "保存に失敗しました")
        );
        return;
      }

      setSaved(next);
    } catch {
      setError("通信に失敗しました");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={handleToggle}
        disabled={pending}
        aria-label={saved ? "保存済み" : "保存する"}
        aria-pressed={saved}
        className={cn(
          "rounded-lg border p-2 transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          saved
            ? "border-accent/30 bg-accent/10 text-accent"
            : "border-zinc-300 bg-zinc-200/40 text-zinc-500 hover:border-zinc-400 hover:text-zinc-900"
        )}
      >
        <Bookmark className={cn("h-3.5 w-3.5", saved && "fill-current")} />
      </button>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
