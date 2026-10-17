"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ShareButton } from "@/components/share-button";
import { CelebrationOverlay } from "./celebration-overlay";
import { TankOccupant } from "./kuwagata-shelf";
import { useFanfare } from "./roadmap-sound";

type GrowthLabel = "卵" | "幼虫" | "蛹";

const STAGE_LABEL: Record<GrowthLabel, string> = { 卵: "タマゴ", 幼虫: "幼虫", 蛹: "蛹" };

// 前振り（羽化前の姿が震える）→ 白い閃光 → 成虫の登場、の3段階。
const BUILDUP_MS = 2200;
const FLASH_MS = 700;

// Stage5卒業でテッペンクワたんが成虫になるときだけの特別な演出。
// 通常のタマゴ入手・Stage解放の演出より長く、光線と閃光を入れて盛り上げる。
export function HatchOverlay({
  speciesCode,
  speciesName,
  mandibleVariant,
  hatchedFrom,
  children,
}: {
  speciesCode: string;
  speciesName: string;
  mandibleVariant: number;
  hatchedFrom: string | null;
  children: ReactNode;
}) {
  const [phase, setPhase] = useState<"buildup" | "flash" | "reveal">("buildup");
  const before: GrowthLabel = hatchedFrom === "卵" || hatchedFrom === "幼虫" || hatchedFrom === "蛹" ? hatchedFrom : "蛹";

  const playFanfare = useFanfare();
  // 閃光のあと成虫が現れた瞬間に鳴らす
  useEffect(() => {
    if (phase === "reveal") playFanfare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    const toFlash = setTimeout(() => setPhase("flash"), BUILDUP_MS);
    const toReveal = setTimeout(() => setPhase("reveal"), BUILDUP_MS + FLASH_MS * 0.45);
    return () => {
      clearTimeout(toFlash);
      clearTimeout(toReveal);
    };
  }, []);

  if (phase === "reveal") {
    return (
      <>
        <CelebrationOverlay
          eyebrow="Stage5卒業！"
          art={
            <div className="relative flex h-28 w-28 items-center justify-center">
              <div
                className="animate-hatch-rays pointer-events-none absolute -inset-16 rounded-full"
                style={{
                  background:
                    "repeating-conic-gradient(from 0deg, rgba(253,230,138,0.55) 0deg 8deg, rgba(253,230,138,0) 8deg 24deg)",
                  maskImage: "radial-gradient(circle, #000 25%, transparent 70%)",
                  WebkitMaskImage: "radial-gradient(circle, #000 25%, transparent 70%)",
                }}
              />
              <TankOccupant
                color="#f59e0b"
                sizeScale={4}
                speciesCode={speciesCode}
                mandibleVariant={mandibleVariant}
                growthStage="成虫"
              />
            </div>
          }
          message={`${speciesName}が${hatchedFrom ? `${STAGE_LABEL[before]}から成長して、` : ""}成虫に羽化した！`}
        >
          <ShareButton
            campaign="hatch"
            label="みんなに自慢する"
            text={`英クワたんでStage5を卒業して、${speciesName}が成虫に羽化した！ #英クワたん`}
            className="inline-flex w-full max-w-xs items-center justify-center gap-1.5 rounded-full border-2 border-white/70 bg-white/10 py-2 text-sm font-bold text-white transition-transform active:scale-95"
          />
          {children}
        </CelebrationOverlay>
        <div className="animate-hatch-flash pointer-events-none fixed inset-0 z-[60] bg-white" />
      </>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-10 overflow-hidden bg-black/85 px-8 text-center">
      <div className="relative flex h-56 w-56 items-center justify-center">
        <div className="animate-egg-glow absolute inset-0 rounded-full bg-[radial-gradient(circle,rgba(253,230,138,0.85)_0%,rgba(251,191,36,0.35)_45%,rgba(251,191,36,0)_70%)]" />
        <div className="animate-hatch-shake relative">
          <TankOccupant
            color="#f59e0b"
            sizeScale={4}
            speciesCode={speciesCode}
            mandibleVariant={mandibleVariant}
            growthStage={before}
          />
        </div>
      </div>
      <p className="text-lg font-bold leading-relaxed text-white">Stage5卒業！</p>
      {phase === "flash" && <div className="animate-hatch-flash pointer-events-none fixed inset-0 z-[60] bg-white" />}
    </div>
  );
}
