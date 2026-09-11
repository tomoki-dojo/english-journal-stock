"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { AudioPlayButton } from "./audio-play-button";
import type { Expression } from "./types";
import type { Plan } from "@/lib/plan";

type ReviewModalProps = {
  expression: Expression;
  plan: Plan;
  loggedIn: boolean;
  onClose: () => void;
};

// 街の掲示板（習得済み表現一覧）専用の軽量復習フロー（タスク#154）。
// Stage1〜3の出題エンジン（アクティブセット・サブステップ・AI判定）には一切乗らない、
// 「表現を見て、声に出して、できたら閉じる」だけのシンプルなカード。
// 記録するのはlast_practiced_atの更新と「今日の賑わい度」の加算だけで、
// streak/statusは変更しない（すでに習得済みのため卒業判定をやり直す必要がない）。
export function ReviewModal({ expression, plan, loggedIn, onClose }: ReviewModalProps) {
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");

  async function handleDone() {
    if (status === "saving") return;
    setStatus("saving");

    try {
      const res = await fetch("/api/roadmap/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expressionId: expression.id }),
      });

      if (!res.ok) {
        setStatus("error");
        return;
      }

      onClose();
    } catch {
      setStatus("error");
    }
  }

  // fixed要素がカード側のhover演出（transform）に閉じ込められないよう、
  // document.bodyへポータルする（このコンポーネント自体、開いたときしかマウントされない）。
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-900/40 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl border border-zinc-200 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">復習</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="閉じる"
            className="rounded-md p-1 text-zinc-400 transition-colors hover:text-zinc-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-2 flex items-start justify-between gap-2">
          <h3 className="text-lg font-semibold leading-snug text-zinc-900">{expression.expressionEn}</h3>
          <div className="-mr-1 -mt-1 shrink-0">
            <AudioPlayButton
              expressionId={expression.id}
              field="expression"
              plan={plan}
              loggedIn={loggedIn}
              hasAudio={expression.hasAudioExpression}
            />
          </div>
        </div>

        {expression.meaningJa && <p className="mb-6 text-sm text-zinc-600">{expression.meaningJa}</p>}

        <p className="mb-4 text-xs text-zinc-500">声に出して言ってみましょう。</p>

        <button
          type="button"
          onClick={handleDone}
          disabled={status === "saving"}
          className="w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "saving" ? "記録中..." : "言えた！"}
        </button>
        {status === "error" && (
          <p className="mt-2 text-xs text-red-600">記録に失敗しました。もう一度お試しください。</p>
        )}
      </div>
    </div>,
    document.body
  );
}
