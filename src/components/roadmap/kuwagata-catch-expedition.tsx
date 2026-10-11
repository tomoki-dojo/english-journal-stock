"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import { CelebrationOverlay } from "./celebration-overlay";
import { KuwagataWordChallenge } from "./kuwagata-word-challenge";
import type { KuwagataAreaCode } from "@/lib/supabase/kuwagata";

const AREA_LABEL: Record<KuwagataAreaCode, string> = {
  area1: "庭・裏庭",
  area2: "里山・雑木林",
  area3: "川",
  area4: "ジャングル・秘境",
  area5: "山岳",
  aquarium: "水の底の秘境（Pro限定）",
};

type CatchResponse = {
  speciesName: string;
  speciesKind: "known" | "new";
  rarity: "コモン" | "レア" | "激レア";
  guaranteedRare: boolean;
  flavorTextJa: string | null;
};

const RARITY_STYLE: Record<
  CatchResponse["rarity"],
  { celebrateText: string; label: string }
> = {
  コモン: { celebrateText: "text-amber-300", label: "" },
  レア: { celebrateText: "text-sky-300", label: "レア" },
  激レア: { celebrateText: "text-pink-300", label: "激レア" },
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
  // ミニゲーム中のエリア。ミニゲームが終わったら、その成績つきで採集を実行する。
  const [challengeArea, setChallengeArea] = useState<KuwagataAreaCode | null>(null);

  if (pendingCount <= 0 && !result) {
    return null;
  }

  async function handleGoCatch(areaCode: KuwagataAreaCode, sessionId?: string, answers?: number[]) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/roadmap/kuwagata/catch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areaCode, sessionId, answers }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(
          typeof json.error === "string" ? json.error : "採集に失敗しました",
        );
        return;
      }
      setResult(json as CatchResponse);
      setPendingCount((n) => Math.max(0, n - 1));
      setPicking(false);
      setChallengeArea(null);
    } catch {
      setError("採集に失敗しました。時間を置いて再度お試しください。");
      setChallengeArea(null);
    } finally {
      setLoading(false);
    }
  }

  function startExpedition() {
    if (initialUnlockedAreas.length === 1) {
      setChallengeArea(initialUnlockedAreas[0]);
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
      {!picking && !result && !challengeArea && (
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
          <p className="mb-2 text-xs font-semibold text-amber-800">
            どのエリアで採集する？
          </p>
          <div className="flex flex-wrap gap-1.5">
            {initialUnlockedAreas.map((areaCode) => (
              <button
                key={areaCode}
                type="button"
                onClick={() => {
                  setPicking(false);
                  setChallengeArea(areaCode);
                }}
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

      {challengeArea && (
        <KuwagataWordChallenge
          areaCode={challengeArea}
          onFinish={(sessionId, answers) => void handleGoCatch(challengeArea, sessionId, answers)}
          onCancel={() => setChallengeArea(null)}
        />
      )}

      {error && <p className="mt-2 text-xs text-red-500">{error}</p>}

      {result && (
        <CelebrationOverlay
          accentClassName={RARITY_STYLE[result.rarity].celebrateText}
          eyebrow={
            RARITY_STYLE[result.rarity].label
              ? `${RARITY_STYLE[result.rarity].label}が出た！`
              : undefined
          }
          message={`${result.speciesName}をゲットした！`}
          description={result.flavorTextJa}
        >
          <button
            type="button"
            onClick={closeResult}
            className="w-full rounded-full bg-amber-500 py-2.5 text-sm font-bold text-white transition-transform active:scale-95"
          >
            棚を見る
          </button>
          <Link
            href="/roadmap"
            className="flex items-center gap-1 rounded-full px-4 py-1.5 text-xs font-semibold text-white/80 hover:text-white"
          >
            つづきを練習する
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </CelebrationOverlay>
      )}
    </div>
  );
}
