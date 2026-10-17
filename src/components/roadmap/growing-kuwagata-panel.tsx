"use client";

import { useEffect, useState } from "react";
import type { KuwagataAdultGrowth, KuwagataGrowingIndividual } from "@/lib/supabase/kuwagata";
import type { RoadmapStageUp } from "@/lib/roadmap-notices";
import { GrowthStageOverlay } from "./growth-stage-overlay";
import { GrowthGauge, SizeGauge, TankOccupant } from "./kuwagata-shelf";

type GrowingResponse = {
  individuals?: KuwagataGrowingIndividual[];
  adults?: KuwagataAdultGrowth[];
  hiddenCount?: number;
  stageUps?: RoadmapStageUp[];
  maxSizeUps?: RoadmapStageUp[];
};

// ゲージが伸びきってから「成長した！」を出すまでの間。
const STAGE_UP_DELAY_MS = 1600;

// 成虫のサイズレベル1つ分（+6%）を、パネル内の見た目にもそのまま反映する（kuwagata.tsのSIZE_LEVEL_STEPと同じ値）。
const SIZE_STEP = 0.06;

// ラウンド結果画面用。フレーズ卒業のご褒美で、育成中のクワたんの成長（2色ゲージ）と、
// 成虫のクワたんの大きさ（サイズレベル）が進んだ様子を見せる。どちらもいなければ何も出さない。
// maxCount: 見せる匹数の上限(結果画面の下に答え合わせが続く画面では1匹だけにして、答えが下に追いやられないようにする)。
export function GrowingKuwagataPanel({ maxCount }: { maxCount?: number } = {}) {
  const [growing, setGrowing] = useState<KuwagataGrowingIndividual[]>([]);
  const [adults, setAdults] = useState<KuwagataAdultGrowth[]>([]);
  const [hiddenCount, setHiddenCount] = useState(0);
  const [stageUps, setStageUps] = useState<RoadmapStageUp[]>([]);
  const [maxSizeUps, setMaxSizeUps] = useState<RoadmapStageUp[]>([]);
  // 演出は「成長段階」→「最大サイズ」の順に、1つずつ出す。
  const [overlay, setOverlay] = useState<"none" | "stage" | "maxSize">("none");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    fetch("/api/roadmap/kuwagata/growing", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: GrowingResponse | null) => {
        if (cancelled || !json) return;
        setGrowing(json.individuals ?? []);
        setAdults(json.adults ?? []);
        setHiddenCount(json.hiddenCount ?? 0);
        const ups = json.stageUps ?? [];
        const maxUps = json.maxSizeUps ?? [];
        setStageUps(ups);
        setMaxSizeUps(maxUps);
        if (ups.length > 0) timer = setTimeout(() => setOverlay("stage"), STAGE_UP_DELAY_MS);
        else if (maxUps.length > 0) timer = setTimeout(() => setOverlay("maxSize"), STAGE_UP_DELAY_MS);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  if (growing.length === 0 && adults.length === 0) return null;

  // 匹数の上限があるときは、育成中(次の段階に近い順)→サイズアップした成虫の順に、上限まで見せる。
  const shownGrowing = maxCount === undefined ? growing : growing.slice(0, maxCount);
  const shownAdults = maxCount === undefined ? adults : adults.slice(0, Math.max(0, maxCount - shownGrowing.length));
  const shownHidden = maxCount === undefined ? hiddenCount : 0;

  return (
    <div className="relative mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
      {overlay === "stage" && (
        <GrowthStageOverlay
          stageUps={stageUps}
          onClose={() => {
            setStageUps([]);
            setOverlay(maxSizeUps.length > 0 ? "maxSize" : "none");
          }}
        />
      )}
      {overlay === "maxSize" && (
        <GrowthStageOverlay
          kind="maxSize"
          stageUps={maxSizeUps}
          onClose={() => {
            setMaxSizeUps([]);
            setOverlay("none");
          }}
        />
      )}
      <div className="flex flex-wrap items-end justify-center gap-4">
        {shownGrowing.map((individual) => (
          <div key={individual.id} className="flex flex-col items-center gap-1.5">
            <TankOccupant
              color="#f59e0b"
              sizeScale={2.5}
              speciesCode={individual.speciesCode}
              mandibleVariant={individual.mandibleVariant}
              growthStage={individual.growthStage}
            />
            <GrowthGauge gauge={individual.growthGauge} animateBoost className="w-16" />
            <span className="text-[11px] font-medium text-zinc-600">
              {individual.speciesName}（{individual.growthStage}）
            </span>
          </div>
        ))}
        {shownAdults.map((adult) => (
          <div
            key={adult.id}
            className={`flex flex-col items-center gap-1.5 ${adult.leveledUp ? "animate-round-complete-pop" : ""}`}
          >
            <TankOccupant
              color="#f59e0b"
              sizeScale={2.2 * (1 + SIZE_STEP * adult.sizeLevel)}
              speciesCode={adult.speciesCode}
              mandibleVariant={adult.mandibleVariant}
              growthStage="成虫"
            />
            <SizeGauge level={adult.sizeLevel} ratio={adult.sizeRatio} animate className="w-16" />
            <span className="text-[11px] font-medium text-zinc-600">
              {adult.speciesName}
              {adult.leveledUp && <span className="ml-1 font-bold text-emerald-700">サイズUP</span>}
            </span>
          </div>
        ))}
        {shownHidden > 0 && (
          <span className="self-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
            +{shownHidden}匹
          </span>
        )}
      </div>
    </div>
  );
}
