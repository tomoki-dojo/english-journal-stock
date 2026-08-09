"use client";

import { useState } from "react";
import { Bookmark, ChevronDown } from "lucide-react";
import { AudioPlayButton } from "./audio-play-button";
import type { Expression, Level, VerificationStatus } from "./types";
import type { Plan } from "@/lib/plan";
import { cn } from "@/lib/utils";

const levelBadgeClasses: Record<Level, string> = {
  初級: "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20",
  中級: "bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/20",
  上級: "bg-rose-500/10 text-rose-700 ring-1 ring-rose-500/20",
};

const verificationBadgeClasses: Record<VerificationStatus, string> = {
  "AI生成のみ": "bg-zinc-300/60 text-zinc-600",
  クロスチェック済み: "bg-accent/10 text-accent ring-1 ring-accent/20",
  ネイティブ確認済み: "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20",
};

type ExpressionCardProps = {
  expression: Expression;
  plan: Plan;
  initialSaved?: boolean;
};

export function ExpressionCard({ expression, plan, initialSaved = false }: ExpressionCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [saved, setSaved] = useState(initialSaved);
  const [savePending, setSavePending] = useState(false);
  const [saveError, setSaveError] = useState("");

  const hasMore =
    Boolean(expression.example2En) ||
    Boolean(expression.similarExpressions?.length) ||
    Boolean(expression.usageNotes);

  async function handleToggleSave() {
    if (savePending) return;
    setSavePending(true);
    setSaveError("");

    const next = !saved;

    try {
      const res = next
        ? await fetch("/api/saved-expressions", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ expressionId: expression.id }),
          })
        : await fetch(`/api/saved-expressions/${expression.id}`, { method: "DELETE" });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveError(
          res.status === 401
            ? "ログインすると保存できます"
            : (data.error ?? "保存に失敗しました")
        );
        return;
      }

      setSaved(next);
    } catch {
      setSaveError("通信に失敗しました");
    } finally {
      setSavePending(false);
    }
  }

  const saveButton = (
    <button
      type="button"
      onClick={handleToggleSave}
      disabled={savePending}
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
  );

  return (
    <article className="group flex flex-col rounded-xl border border-zinc-200 bg-zinc-100/50 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lg hover:shadow-accent/20">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {expression.sceneTags.map((tag) => (
          <span
            key={tag}
            className="rounded-md bg-zinc-300/60 px-2 py-1 text-[11px] font-medium text-zinc-700"
          >
            {tag}
          </span>
        ))}
        {expression.intentTags?.map((tag) => (
          <span
            key={tag}
            className="rounded-md bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent"
          >
            {tag}
          </span>
        ))}
        <span
          className={cn(
            "rounded-md px-2 py-1 text-[11px] font-medium",
            levelBadgeClasses[expression.level]
          )}
        >
          {expression.level}
        </span>
      </div>

      <div className="mb-1 flex items-start justify-between gap-2">
        <h3 className="text-base font-semibold leading-snug text-zinc-900 transition-colors group-hover:text-black">
          {expression.expressionEn}
        </h3>
        <div className="-mr-1.5 -mt-1 shrink-0">
          <AudioPlayButton
            expressionId={expression.id}
            field="expression"
            plan={plan}
            hasAudio={expression.hasAudioExpression}
          />
        </div>
      </div>

      <>
          <p className="mb-4 text-sm text-zinc-600">{expression.meaningJa}</p>

          {expression.example1En && (
            <div className="mb-3 flex items-start justify-between gap-2 rounded-lg bg-zinc-200/40 p-3">
              <div>
                <p className="text-sm text-zinc-800">{expression.example1En}</p>
                {expression.example1Ja && (
                  <p className="mt-1 text-xs text-zinc-500">{expression.example1Ja}</p>
                )}
              </div>
              <div className="shrink-0">
                <AudioPlayButton
                  expressionId={expression.id}
                  field="example1"
                  plan={plan}
                  hasAudio={expression.hasAudioExample1}
                />
              </div>
            </div>
          )}

          {expanded && (
            <div className="mb-3 space-y-3">
              {expression.example2En && (
                <div className="flex items-start justify-between gap-2 rounded-lg bg-zinc-200/40 p-3">
                  <div>
                    <p className="text-sm text-zinc-800">{expression.example2En}</p>
                    {expression.example2Ja && (
                      <p className="mt-1 text-xs text-zinc-500">{expression.example2Ja}</p>
                    )}
                  </div>
                  <div className="shrink-0">
                    <AudioPlayButton
                      expressionId={expression.id}
                      field="example2"
                      plan={plan}
                      hasAudio={expression.hasAudioExample2}
                    />
                  </div>
                </div>
              )}

              {expression.similarExpressions && expression.similarExpressions.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
                    類似・言い換え表現
                  </p>
                  <p className="text-sm text-zinc-700">
                    {expression.similarExpressions.join(" / ")}
                  </p>
                </div>
              )}

              {expression.usageNotes && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
                    使用上の注意
                  </p>
                  <p className="text-sm text-zinc-600">{expression.usageNotes}</p>
                </div>
              )}
            </div>
          )}

          <div className="mt-auto flex items-center justify-between gap-2 border-t border-zinc-200/80 pt-4">
            <span
              className={cn(
                "rounded-md px-2 py-1 text-[10px] font-medium",
                verificationBadgeClasses[expression.verificationStatus]
              )}
            >
              {expression.verificationStatus}
            </span>

            <div className="flex items-center gap-1.5">
              {hasMore && (
                <button
                  type="button"
                  onClick={() => setExpanded((prev) => !prev)}
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-zinc-600 transition-colors hover:text-accent"
                >
                  {expanded ? "閉じる" : "もっと見る"}
                  <ChevronDown
                    className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-180")}
                  />
                </button>
              )}
              {saveButton}
            </div>
          </div>
          {saveError && <p className="mt-2 text-xs text-red-600">{saveError}</p>}
        </>
    </article>
  );
}
