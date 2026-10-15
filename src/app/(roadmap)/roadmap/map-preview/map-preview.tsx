"use client";

import { useState } from "react";
import { KuwagataAreaMap } from "@/components/roadmap/kuwagata-area-map";
import type { KuwagataAreaCode } from "@/lib/supabase/kuwagata";

const LABELS: Record<KuwagataAreaCode, string> = {
  area1: "エリア1",
  area2: "エリア2",
  area3: "エリア3",
  area4: "エリア4",
  area5: "エリア5",
  aquarium: "水の底",
  ancient: "古代の森",
};

const MAIN: KuwagataAreaCode[] = ["area1", "area2", "area3", "area4", "area5"];
const STEPS: { label: string; areas: KuwagataAreaCode[] }[] = [
  ...[1, 2, 3, 4, 5].map((n) => ({ label: `1〜${n}`, areas: MAIN.slice(0, n) })),
  ...[1, 2, 3, 4, 5].map((n) => ({ label: `1〜${n}＋古代`, areas: [...MAIN.slice(0, n), "ancient" as KuwagataAreaCode] })),
];

export function MapPreview() {
  const [step, setStep] = useState(1);
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
      <KuwagataAreaMap unlockedAreas={STEPS[step].areas} labels={LABELS} onSelect={() => {}} />
    </div>
  );
}
