"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";
import { CelebrationOverlay } from "./celebration-overlay";
import { TankOccupant } from "./kuwagata-shelf";
import { KuwagataWordChallenge } from "./kuwagata-word-challenge";
import { KuwagataAreaMap, KUWAGATA_MAP_AREA_CODES } from "./kuwagata-area-map";
import { KUWAGATA_AREA_NAMES } from "@/lib/kuwagata-area-names";
import type { KuwagataAreaCode } from "@/lib/supabase/kuwagata";
import { useRoadmapAdBreak } from "./roadmap-ad-break";
import { GetSeOnMount } from "./roadmap-sound";

// 採集エリア選択ではPro限定エリアに注記を付ける。
const AREA_LABEL: Record<KuwagataAreaCode, string> = Object.fromEntries(
  (Object.keys(KUWAGATA_AREA_NAMES) as KuwagataAreaCode[]).map((code) => [
    code,
    code === "aquarium" || code === "ancient" ? `${KUWAGATA_AREA_NAMES[code]}（Pro限定）` : KUWAGATA_AREA_NAMES[code],
  ]),
) as Record<KuwagataAreaCode, string>;

type CatchResponse = {
  speciesCode: string;
  speciesName: string;
  speciesKind: "known" | "new";
  rarity: "コモン" | "レア" | "激レア";
  guaranteedRare: boolean;
  flavorTextJa: string | null;
  // Freeの棚の表示枠を超えていて、この子が棚に飾れない
  hiddenOnShelf?: boolean;
};

const RARITY_STYLE: Record<
  CatchResponse["rarity"],
  { celebrateText: string; label: string }
> = {
  コモン: { celebrateText: "text-amber-300", label: "" },
  レア: { celebrateText: "text-sky-300", label: "レア" },
  激レア: { celebrateText: "text-pink-300", label: "激レア" },
};

// レア確定ボタンの周りに散らす光の粒（位置・大きさ・タイミングを固定にして、描画のたびにずれないようにする）。
const RARE_SPARKLES: { left: string; top: string; size: number; delay: string; duration: string }[] = [
  { left: "6%", top: "-8px", size: 10, delay: "0s", duration: "1.9s" },
  { left: "22%", top: "-14px", size: 7, delay: "0.5s", duration: "2.2s" },
  { left: "40%", top: "-10px", size: 9, delay: "1.1s", duration: "1.8s" },
  { left: "58%", top: "-14px", size: 6, delay: "0.3s", duration: "2.1s" },
  { left: "76%", top: "-9px", size: 10, delay: "0.8s", duration: "2s" },
  { left: "93%", top: "-12px", size: 7, delay: "1.4s", duration: "1.9s" },
  { left: "-6px", top: "40%", size: 8, delay: "0.6s", duration: "2.3s" },
  { left: "calc(100% - 2px)", top: "55%", size: 8, delay: "1.2s", duration: "2s" },
  { left: "12%", top: "calc(100% - 4px)", size: 7, delay: "0.9s", duration: "2.2s" },
  { left: "50%", top: "calc(100% - 2px)", size: 9, delay: "0.2s", duration: "1.9s" },
  { left: "84%", top: "calc(100% - 4px)", size: 6, delay: "1.5s", duration: "2.1s" },
];

export function KuwagataCatchExpedition({
  initialPendingCount,
  initialGuaranteedCount = 0,
  initialUnlockedAreas,
}: {
  initialPendingCount: number;
  initialGuaranteedCount?: number;
  initialUnlockedAreas: KuwagataAreaCode[];
}) {
  const router = useRouter();
  const [pendingCount, setPendingCount] = useState(initialPendingCount);
  const [guaranteedCount, setGuaranteedCount] = useState(
    Math.min(initialGuaranteedCount, initialPendingCount),
  );
  // 今回の採集が、レア確定のチャンスか普通のチャンスか
  const [useGuaranteed, setUseGuaranteed] = useState(false);
  const [picking, setPicking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CatchResponse | null>(null);
  const { notifyBreak } = useRoadmapAdBreak();
  // ミニゲーム中のエリア。ミニゲームが終わったら、その成績つきで採集を実行する。
  const [challengeArea, setChallengeArea] = useState<KuwagataAreaCode | null>(
    null,
  );

  if (pendingCount <= 0 && !result) {
    return null;
  }

  async function handleGoCatch(
    areaCode: KuwagataAreaCode,
    sessionId?: string,
    answers?: number[],
  ) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/roadmap/kuwagata/catch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areaCode, sessionId, answers, guaranteed: useGuaranteed }),
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
      if (useGuaranteed) setGuaranteedCount((n) => Math.max(0, n - 1));
      setPicking(false);
      setChallengeArea(null);
    } catch {
      setError("採集に失敗しました。時間を置いて再度お試しください。");
      setChallengeArea(null);
    } finally {
      setLoading(false);
    }
  }

  function startExpedition(guaranteed: boolean) {
    setUseGuaranteed(guaranteed);
    if (initialUnlockedAreas.length === 1) {
      setChallengeArea(initialUnlockedAreas[0]);
      return;
    }
    setPicking(true);
  }

  function closeResult() {
    setResult(null);
    notifyBreak(); // 採集結果を閉じたところを区切りとして、間隔が空いていれば広告枠を出す
    router.refresh(); // 棚の内容・残チャンス数をサーバー側から再取得する。
  }

  return (
    <div className="mb-4">
      {!picking && !result && !challengeArea && (
        <div className="flex flex-col items-start gap-4">
          {guaranteedCount > 0 && (
            <div className="relative">
              {RARE_SPARKLES.map((s, i) => (
                <span
                  key={i}
                  aria-hidden
                  className="catch-cta-sparkle pointer-events-none absolute z-10"
                  style={{
                    left: s.left,
                    top: s.top,
                    width: s.size,
                    height: s.size,
                    animationDelay: s.delay,
                    animationDuration: s.duration,
                  }}
                />
              ))}
              <button
                type="button"
                onClick={() => startExpedition(true)}
                disabled={loading}
                className="catch-cta inline-flex items-center justify-center gap-2 rounded-full border-2 border-amber-700 px-5 py-3.5 text-base font-black tracking-wide text-white transition-transform disabled:opacity-50"
                style={{ textShadow: "0 2px 0 rgba(120,53,15,0.8), 0 0 8px rgba(120,53,15,0.4)" }}
              >
                <Sparkles className="catch-cta-icon h-5 w-5" />
                レア確定の採集に出かける！
                <span className="rounded-full bg-white/90 px-2 py-0.5 text-xs font-black text-orange-600" style={{ textShadow: "none" }}>
                  チャンス{guaranteedCount}
                </span>
                <Sparkles className="catch-cta-icon h-5 w-5" />
              </button>
            </div>
          )}
          {pendingCount - guaranteedCount > 0 && (
            <button
              type="button"
              onClick={() => startExpedition(false)}
              disabled={loading}
              className="catch-cta-normal inline-flex items-center justify-center gap-1.5 rounded-full border-2 border-emerald-800 px-4 py-2 text-sm font-black tracking-wide text-white transition-transform active:translate-y-0.5 disabled:opacity-50"
              style={{ textShadow: "0 1px 0 rgba(6,78,59,0.8)" }}
            >
              採集に出かける
              <span className="rounded-full bg-white/90 px-1.5 py-0.5 text-[11px] font-black text-emerald-700" style={{ textShadow: "none" }}>
                チャンス{pendingCount - guaranteedCount}
              </span>
            </button>
          )}
        </div>
      )}

      {picking && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4"
          onClick={() => setPicking(false)}
        >
          <div
            className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-2xl border border-amber-200 bg-amber-50 p-3 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <KuwagataAreaMap
              unlockedAreas={initialUnlockedAreas}
              labels={AREA_LABEL}
              disabled={loading}
              onSelect={(areaCode) => {
                setPicking(false);
                setChallengeArea(areaCode);
              }}
            />
            {initialUnlockedAreas.some(
              (a) => !KUWAGATA_MAP_AREA_CODES.includes(a),
            ) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {initialUnlockedAreas
                  .filter((a) => !KUWAGATA_MAP_AREA_CODES.includes(a))
                  .map((areaCode) => (
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
            )}
            <button
              type="button"
              onClick={() => setPicking(false)}
              className="mt-2 text-[11px] text-zinc-400 hover:text-zinc-600"
            >
              やめる
            </button>
          </div>
        </div>
      )}

      {challengeArea && (
        <KuwagataWordChallenge
          areaCode={challengeArea}
          onFinish={(sessionId, answers) =>
            void handleGoCatch(challengeArea, sessionId, answers)
          }
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
          art={
            <div className="flex h-28 w-28 items-center justify-center">
              <TankOccupant
                color="#f59e0b"
                sizeScale={4}
                speciesCode={result.speciesCode}
                growthStage="成虫"
              />
            </div>
          }
          message={`${result.speciesName}をゲットした！`}
          description={result.flavorTextJa}
        >
          {result.rarity !== "コモン" && <GetSeOnMount />}
          {result.hiddenOnShelf && (
            <div className="w-full rounded-xl bg-white/10 px-3 py-2.5 text-center ring-1 ring-white/25">
              <p className="text-xs font-semibold text-white">棚がいっぱいで、この子は飾れない…</p>
              <Link
                href="/roadmap/pro?from=catch"
                className="mt-2 inline-flex items-center gap-1 rounded-full bg-white px-4 py-1.5 text-xs font-black text-amber-600 transition-transform active:scale-95"
              >
                Proで棚を広げる
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          )}
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
