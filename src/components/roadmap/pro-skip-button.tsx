"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Rocket, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Plan } from "@/lib/plan";

type ProSkipButtonProps = {
  plan: Plan;
  proSkipEnabled: boolean;
  proSkipStartStage: 2 | 3 | 4 | null;
};

const STAGE_OPTIONS: { stage: 2 | 3 | 4; label: string }[] = [
  { stage: 2, label: "Stage2から" },
  { stage: 3, label: "Stage3から" },
  { stage: 4, label: "Stage4から" },
];

// Stageスキップ（#156、Pro限定・2026-09-14実装）。日常会話パート（Stage1〜3）を飛ばして
// 先のStageから始めたいPro会員向けのボタン。箱庭画面（RoadmapMapの上）に常設する。
// 選んだStage以降がまとめて解放される単一フラグ方式（進捗データは一切変更しない。
// 詳細は_reference/speaking-roadmap-design.md「将来検討：Stageスキップ」参照）ため、
// 「どこから始めるか」はあくまで現在地表示・導線の初期値であり、Stage1〜3はスキップ後も
// 常に自由に練習できる。
export function ProSkipButton({ plan, proSkipEnabled, proSkipStartStage }: ProSkipButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isPro = plan !== "free";

  async function selectStage(stage: 2 | 3 | 4) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/roadmap/skip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ startStage: stage }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error ?? "設定に失敗しました");
      }
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "設定に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:border-accent/50"
      >
        {!isPro && <Lock className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />}
        <Rocket className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
        {proSkipEnabled
          ? `スキップ中（Stage${proSkipStartStage}から）・変更する`
          : "Stageをスキップする"}
      </button>

      {open && !isPro && (
        <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent ring-1 ring-accent/20">
          <span>Stageスキップ（先のStageから始める機能）はPro会員限定です。</span>
          <Link href="/settings" className="font-medium underline underline-offset-2">
            プランを見る
          </Link>
        </div>
      )}

      {open && isPro && (
        <div className="mt-2 rounded-lg border border-zinc-200 bg-white p-3 shadow-sm">
          <p className="mb-2 text-xs text-zinc-500">
            どこから始めますか？（Stage1〜3はスキップ後もいつでも自由に練習できます）
          </p>
          <div className="flex flex-wrap gap-2">
            {STAGE_OPTIONS.map(({ stage, label }) => (
              <button
                key={stage}
                type="button"
                disabled={submitting}
                onClick={() => selectStage(stage)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50",
                  proSkipStartStage === stage
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-zinc-300 text-zinc-700 hover:border-accent/50"
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        </div>
      )}
    </div>
  );
}
