"use client";

import { useState } from "react";
import { KuwagataAreaMap } from "@/components/roadmap/kuwagata-area-map";
import { KuwagataAreaUnlockCelebration } from "@/components/roadmap/kuwagata-area-unlock-celebration";
import { KUWAGATA_AREA_NAMES } from "@/lib/kuwagata-area-names";
import type { KuwagataAreaCode } from "@/lib/supabase/kuwagata";


const MAIN: KuwagataAreaCode[] = ["area1", "area2", "area3", "area4", "area5"];
const STEPS: { label: string; areas: KuwagataAreaCode[] }[] = [
  ...[1, 2, 3, 4, 5].map((n) => ({ label: `1〜${n}`, areas: MAIN.slice(0, n) })),
  ...[1, 2, 3, 4, 5].map((n) => ({ label: `1〜${n}＋古代`, areas: [...MAIN.slice(0, n), "ancient" as KuwagataAreaCode] })),
];

export function MapPreview() {
  const [step, setStep] = useState(1);
  const [playKey, setPlayKey] = useState(0);
  const areas = STEPS[step].areas;
  return (
    <div className="mx-auto max-w-md p-4">
      <div className="mb-3 flex flex-wrap gap-1.5">
        {STEPS.map((s, i) => (
          <button
            key={s.label}
            type="button"
            onClick={() => setStep(i)}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
              i === step ? "border-amber-500 bg-amber-500 text-white" : "border-amber-300 bg-white text-amber-800"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
      {areas.length > 1 && (
        <button
          type="button"
          onClick={() => setPlayKey((k) => k + 1)}
          className="mb-3 rounded-full border border-sky-300 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700"
        >
          解放演出（{KUWAGATA_AREA_NAMES[areas[areas.length - 1]]}）
        </button>
      )}
      {playKey > 0 && (
        <KuwagataAreaUnlockCelebration
          key={`${playKey}-${step}`}
          unlockedAreas={areas}
          newAreas={[areas[areas.length - 1]]}
          skipRecord
          onClose={() => setPlayKey(0)}
        />
      )}
      <KuwagataAreaMap unlockedAreas={areas} labels={KUWAGATA_AREA_NAMES} onSelect={() => {}} />
    </div>
  );
}
