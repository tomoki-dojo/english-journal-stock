"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Bug, X } from "lucide-react";
import type { KuwagataAreaCode } from "@/lib/supabase/kuwagata";

const AREA_LABEL: Record<KuwagataAreaCode, string> = {
  area1: "庭・裏庭",
  area2: "里山・雑木林",
  area3: "川",
  area4: "ジャングル・秘境",
  aquarium: "水中アクアリウム（Pro限定）",
};

type CatchResponse = {
  speciesName: string;
  speciesKind: "known" | "new";
  rarity: "コモン" | "レア" | "激レア";
  guaranteedRare: boolean;
  flavorTextJa: string | null;
};

const RARITY_STYLE: Record<CatchResponse["rarity"], { border: string; text: string; label: string }> = {
  コモン: { border: "border-zinc-200", text: "text-zinc-700", label: "" },
  レア: { border: "border-sky-300", text: "text-sky-700", label: "レア" },
  激レア: { border: "border-amber-400", text: "text-amber-700", label: "激レア" },
};

export function KuwagataCatchExpedition({
  initialPendingCount,
  initialUnlockedAreas,
}: {
  initialPendingCount: number;
  initialUnlockedAreas: KuwagataAreaCode[];
}) {
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState(initialPendingCount);
  const [picking, setPicking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CatchResponse | null>(null);

  if (pendingCount <= 0 && !result) {
    return (
      <p className="mb-4 text-xs text-zinc-400">
        ロードマップで表現を練習していくと、採集に出かけるチャンスが貯まります。
      </p>
    );
  }

  async function handleGoCatch(areaCode: KuwagataAreaCode) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/roadmap/kuwagata/catch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areaCode }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "採集に失敗しました");
        return;
      }
      setResult(json as CatchResponse);
      setPendingCount((n) => Math.max(0, n - 1));
      setPicking(false);
    } catch {
      setError("採集に失敗しました。時間を置いて再度お試しください。");
    } finally {
      setLoading(false);
    }
  }

  function startExpedition() {
    if (initialUnlockedAreas.length === 1) {
      void handleGoCatch(initialUnlockedAreas[0]);
      return;
    }
    setPicking(true);
  }

  function closeResult() {
    setResult(null);
    router.refresh(); // 棚の内容・残チャンス数をサーバー側から再取得する。
  }

  return (
    <div className="mb-4">
      {!picking && !result && (
        <button
          type="button"
          onClick={startExpedition}
          disabled={loading}
          className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" />
          採集に出かける（チャンス{pendingCount}）
        </button>
      )}

      {picking && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3">
          <p className="mb-2 text-xs font-semibold text-amber-800">どのエリアで採集する？</p>
          <div className="flex flex-wrap gap-1.5">
            {initialUnlockedAreas.map((areaCode) => (
              <button
                key={areaCode}
                type="button"
                onClick={() => handleGoCatch(areaCode)}
                disabled={loading}
                className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 transition-colors hover:bg-amber-100 disabled:opacity-50"
              >
                {AREA_LABEL[areaCode]}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setPicking(false)}
            className="mt-2 text-[11px] text-zinc-400 hover:text-zinc-600"
          >
            やめる
          </button>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      {result && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={closeResult}
        >
          <div
            className={`relative w-full max-w-xs rounded-2xl border-2 bg-white p-6 text-center shadow-xl ${RARITY_STYLE[result.rarity].border}`}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={closeResult}
              className="absolute right-3 top-3 rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
              aria-label="閉じる"
            >
              <X className="h-4 w-4" />
            </button>

            {RARITY_STYLE[result.rarity].label && (
              <p className={`mb-1 text-xs font-bold ${RARITY_STYLE[result.rarity].text}`}>
                {RARITY_STYLE[result.rarity].label}が出た！
              </p>
            )}
            <Bug className={`mx-auto mb-2 h-12 w-12 ${RARITY_STYLE[result.rarity].text}`} strokeWidth={1.5} />
            <p className="text-sm font-bold text-zinc-800">{result.speciesName}をゲットした！</p>
            {result.flavorTextJa && <p className="mt-2 text-xs text-zinc-500">{result.flavorTextJa}</p>}

            <button
              type="button"
              onClick={closeResult}
              className="mt-4 rounded-full bg-zinc-800 px-4 py-1.5 text-xs font-semibold text-white hover:bg-zinc-700"
            >
              棚を見る
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
