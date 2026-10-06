"use client";

import { useEffect, useState } from "react";
import type { KuwagataAdultGrowth, KuwagataGrowingIndividual } from "@/lib/supabase/kuwagata";
import { GrowthGauge, SizeGauge, TankOccupant } from "./kuwagata-shelf";

type GrowingResponse = {
  individuals?: KuwagataGrowingIndividual[];
  adults?: KuwagataAdultGrowth[];
  hiddenCount?: number;
};

// 成虫のサイズレベル1つ分（+10%）を、パネル内の見た目にもそのまま反映する。
const SIZE_STEP = 0.1;

// ラウンド結果画面用。フレーズ卒業のご褒美で、育成中のクワたんの成長（2色ゲージ）と、
// 成虫のクワたんの大きさ（サイズレベル）が進んだ様子を見せる。どちらもいなければ何も出さない。
export function GrowingKuwagataPanel() {
  const [growing, setGrowing] = useState<KuwagataGrowingIndividual[]>([]);
  const [adults, setAdults] = useState<KuwagataAdultGrowth[]>([]);
  const [hiddenCount, setHiddenCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/roadmap/kuwagata/growing", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: GrowingResponse | null) => {
        if (cancelled || !json) return;
        setGrowing(json.individuals ?? []);
        setAdults(json.adults ?? []);
        setHiddenCount(json.hiddenCount ?? 0);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (growing.length === 0 && adults.length === 0) return null;

  return (
    <div className="relative mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div className="flex flex-wrap items-end justify-center gap-4">
        {growing.map((individual) => (
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
        {adults.map((adult) => (
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
        {hiddenCount > 0 && (
          <span className="self-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-700">
            +{hiddenCount}匹
          </span>
        )}
      </div>
    </div>
  );
}
