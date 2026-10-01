"use client";

import { useState } from "react";
import { Bug, X } from "lucide-react";
import type { KuwagataShelfTank } from "@/lib/supabase/kuwagata";

const GROWTH_STAGE_LABEL: Record<string, string> = {
  卵: "卵",
  幼虫: "幼虫",
  蛹: "蛹",
  成虫: "成虫",
};

const KNOWN_SPECIES_COLOR = "#92400e";

function hashHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  }
  return hash;
}

function tankColor(tank: KuwagataShelfTank): string {
  if (tank.speciesKind === "known") return KNOWN_SPECIES_COLOR;
  return `hsl(${hashHue(tank.speciesName)}, 55%, 40%)`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function TankOccupant({ color, sizeScale }: { color: string; sizeScale: number }) {
  const basePx = 28;
  return (
    <Bug
      className="drop-shadow-sm"
      style={{ color, width: basePx * sizeScale, height: basePx * sizeScale }}
      strokeWidth={1.75}
    />
  );
}

const TANK_VISUAL_SLOTS: { left: string; bottom: number }[] = [
  { left: "62%", bottom: 26 },
  { left: "28%", bottom: 22 },
  { left: "45%", bottom: 34 },
  { left: "78%", bottom: 20 },
  { left: "15%", bottom: 30 },
];

const AQUARIUM_BUBBLES: { left: string; bottom: number; size: number }[] = [
  { left: "20%", bottom: 10, size: 5 },
  { left: "50%", bottom: 60, size: 4 },
  { left: "75%", bottom: 25, size: 6 },
  { left: "85%", bottom: 90, size: 3 },
];

function EnlargedTankVisual({ tank, color }: { tank: KuwagataShelfTank; color: string }) {
  const isAquarium = tank.speciesAreaCode === "aquarium";

  return (
    <div
      className={`relative mb-3.5 h-40 overflow-hidden rounded-lg border border-zinc-200 ${
        isAquarium ? "bg-gradient-to-b from-cyan-200 to-sky-500" : "bg-sky-100"
      }`}
    >
      {isAquarium ? (
        AQUARIUM_BUBBLES.map((bubble, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white/50"
            style={{ left: bubble.left, bottom: bubble.bottom, width: bubble.size, height: bubble.size }}
          />
        ))
      ) : (
        <div className="absolute inset-x-0 bottom-0 h-[18px] bg-amber-100" />
      )}
      {tank.individuals.map((individual, index) => {
        const slot = TANK_VISUAL_SLOTS[index % TANK_VISUAL_SLOTS.length];
        const bottom = isAquarium ? slot.bottom + 30 : slot.bottom;
        return (
          <div
            key={individual.id}
            className="absolute -translate-x-1/2"
            style={{ left: slot.left, bottom, transform: index % 2 === 1 ? "translateX(-50%) scaleX(-1)" : "translateX(-50%)" }}
          >
            <TankOccupant color={color} sizeScale={individual.sizeScale * 1.4} />
          </div>
        );
      })}
    </div>
  );
}

export function KuwagataShelf({ tanks }: { tanks: KuwagataShelfTank[] }) {
  const [selectedTankId, setSelectedTankId] = useState<string | null>(null);
  const selectedTank = tanks.find((t) => t.speciesId === selectedTankId) ?? null;

  if (tanks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-amber-200 bg-white/60 px-6 py-12 text-center">
        <Bug className="mx-auto mb-3 h-8 w-8 text-amber-300" strokeWidth={1.5} />
        <p className="text-sm text-zinc-500">
          まだ誰も棚に届いていません。ロードマップで表現を練習していくと、アーサーのもとに最初の1匹が届きます。
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tanks.map((tank) => {
          const color = tankColor(tank);
          const representative = tank.individuals.reduce((a, b) => (b.sizeScale > a.sizeScale ? b : a));

          return (
            <button
              key={tank.speciesId}
              type="button"
              onClick={() => setSelectedTankId(tank.speciesId)}
              className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-4 shadow-sm transition-transform hover:scale-[1.03] hover:shadow-md active:scale-95 ${
                tank.speciesAreaCode === "aquarium"
                  ? "border-cyan-200 bg-gradient-to-b from-cyan-50 to-white"
                  : "border-zinc-200 bg-gradient-to-b from-sky-50 to-white"
              }`}
            >
              <span className="text-[10px] font-medium text-zinc-400">棚{tank.tankNumber}</span>
              <TankOccupant color={color} sizeScale={representative.sizeScale} />
              <span className="text-xs font-semibold text-zinc-700">{tank.speciesName}</span>
              <span className="text-[10px] text-zinc-400">
                {tank.individuals.length > 1 ? `${tank.individuals.length}匹` : GROWTH_STAGE_LABEL[representative.growthStage]}
              </span>
            </button>
          );
        })}
      </div>

      {selectedTank && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setSelectedTankId(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold text-zinc-800">
                棚{selectedTank.tankNumber}・{selectedTank.speciesName}
              </h2>
              <button
                type="button"
                onClick={() => setSelectedTankId(null)}
                className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                aria-label="閉じる"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <EnlargedTankVisual tank={selectedTank} color={tankColor(selectedTank)} />

            <ul className="flex flex-col gap-2">
              {selectedTank.individuals.map((individual, index) => (
                <li
                  key={individual.id}
                  className="flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2"
                >
                  <TankOccupant color={tankColor(selectedTank)} sizeScale={individual.sizeScale} />
                  <div className="flex flex-col text-xs text-zinc-600">
                    <span className="font-semibold text-zinc-800">
                      {index + 1}匹目・{GROWTH_STAGE_LABEL[individual.growthStage]}
                    </span>
                    <span className="text-zinc-400">
                      {individual.obtainedVia === "stage_clear" ? "確定入手" : "野生採集"}・
                      {formatDate(individual.obtainedAt)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
