"use client";

import { useEffect, useState } from "react";
import type { KuwagataGrowingIndividual } from "@/lib/supabase/kuwagata";
import { GrowthGauge, TankOccupant } from "./kuwagata-shelf";

// ラウンド結果画面用。フレーズ卒業のご褒美で育成中のクワたんが成長した様子を、
// 姿と2色ゲージ（青＝練習のブースト分）で見せる。育成中の個体がいなければ何も出さない。
export function GrowingKuwagataPanel() {
  const [individuals, setIndividuals] = useState<KuwagataGrowingIndividual[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/roadmap/kuwagata/growing", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { individuals?: KuwagataGrowingIndividual[] } | null) => {
        if (!cancelled && json?.individuals) setIndividuals(json.individuals);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (individuals.length === 0) return null;

  return (
    <div className="relative mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
      <div className="flex flex-wrap items-end justify-center gap-4">
        {individuals.map((individual) => (
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
      </div>
    </div>
  );
}
