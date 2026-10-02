"use client";

import { useState, type CSSProperties } from "react";
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

// 水槽内デコレーション（置物）。brand/kuwagata-asset-spec.mdの方針どおり、
// Free=2種・Pro=+3〜4種を想定しているが、現状はFree分の2種（石・エサ）のみ制作済みのため
// 全ユーザーに同じプールを出している。Pro分の素材が揃ったらDECORATION_POOLに追加し、
// plan（Free/Pro）に応じてプールを出し分ける形に拡張する。
const DECORATION_POOL: { id: string; file: string; widthPct: number }[] = [
  { id: "stone", file: "/roadmap/tank/tank_item_stone.svg", widthPct: 20 },
  { id: "food", file: "/roadmap/tank/tank_item_food.svg", widthPct: 16 },
];

const DECORATION_SLOTS: { left: string; bottom: number }[] = [
  { left: "14%", bottom: 8 },
  { left: "84%", bottom: 10 },
  { left: "50%", bottom: 6 },
];

// 水槽（speciesId）ごとに固定された組み合わせになるよう、開くたびに変わらないシード付き
// 乱数で選ぶ（hashHueと同じ考え方）。クワたん本体より先にDOMへ描画することで、本体が
// 手前に重なって見えるようにしている（z-indexは使わず描画順だけで奥行きを表現）。
function pickDecorations(tank: KuwagataShelfTank): { file: string; widthPct: number; slot: { left: string; bottom: number } }[] {
  const seed = hashHue(tank.speciesId);
  const count = 1 + (seed % 2);
  const picks: { file: string; widthPct: number; slot: { left: string; bottom: number } }[] = [];
  for (let i = 0; i < count; i++) {
    const item = DECORATION_POOL[(seed + i * 7) % DECORATION_POOL.length];
    const slot = DECORATION_SLOTS[(seed + i) % DECORATION_SLOTS.length];
    picks.push({ file: item.file, widthPct: item.widthPct, slot });
  }
  return picks;
}

// 水槽背景の実アート配置先。brand/kuwagata-asset-spec.mdの命名規則どおり
// public/roadmap/tank/tank_bg_terrarium.png・tank_bg_aquarium.pngを置くだけで反映される。
// ファイルが無い間は404になるが、2枚目のCSSグラデーションが代わりに表示されるので崩れない
// （roadmap-room.tsxの部屋背景と同じ、背景レイヤーを重ねる方式）。
function tankBgStyle(isAquarium: boolean): CSSProperties {
  const url = isAquarium ? "/roadmap/tank/tank_bg_aquarium.png" : "/roadmap/tank/tank_bg_terrarium.png";
  // background-imageのレイヤーには単色(#hexなど)を指定できない(CSS的に無効な値になり、
  // レイヤーリスト全体が無効化されて1枚目のurl()ごと効かなくなる)ため、フォールバックは
  // 単色ではなく必ずグラデーションにする(room_bg.pngと同じ考え方)。
  const fallback = isAquarium ? "linear-gradient(to bottom, #a5f3fc, #0ea5e9)" : "linear-gradient(to bottom, #e0f2fe, #ffffff)";
  return { backgroundImage: `url(${url}), ${fallback}` };
}

function EnlargedTankVisual({ tank, color }: { tank: KuwagataShelfTank; color: string }) {
  const isAquarium = tank.speciesAreaCode === "aquarium";

  return (
    <div
      className="relative mb-3.5 aspect-[4/3] w-full overflow-hidden rounded-lg border border-zinc-200 bg-cover bg-center"
      style={tankBgStyle(isAquarium)}
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
      {pickDecorations(tank).map((deco, index) => {
        const bottom = isAquarium ? deco.slot.bottom + 10 : deco.slot.bottom;
        return (
          <div
            key={index}
            className="absolute -translate-x-1/2"
            style={{ left: deco.slot.left, bottom, width: `${deco.widthPct}%` }}
          >
            <img src={deco.file} alt="" className="block w-full object-contain drop-shadow-sm" />
          </div>
        );
      })}
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

export function KuwagataShelf({
  tanks,
  knownShowcase,
}: {
  tanks: KuwagataShelfTank[];
  knownShowcase: KuwagataShelfTank | null;
}) {
  const [selectedTankId, setSelectedTankId] = useState<string | null>(null);
  const lookupTanks = knownShowcase ? [knownShowcase, ...tanks] : tanks;
  const selectedTank = lookupTanks.find((t) => t.speciesId === selectedTankId) ?? null;

  if (tanks.length === 0 && !knownShowcase) {
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
      {knownShowcase && (
        <button
          type="button"
          onClick={() => setSelectedTankId(knownShowcase.speciesId)}
          className="mb-4 flex w-full items-center gap-3 rounded-xl border border-amber-300 bg-gradient-to-r from-amber-50 to-white px-4 py-3 text-left shadow-sm transition-transform hover:scale-[1.01] hover:shadow-md active:scale-[0.99]"
        >
          <div className="flex -space-x-2">
            {knownShowcase.individuals.slice(0, 5).map((individual) => (
              <TankOccupant key={individual.id} color={KNOWN_SPECIES_COLOR} sizeScale={individual.sizeScale * 0.8} />
            ))}
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-semibold text-amber-800">{knownShowcase.speciesName}</span>
            <span className="text-[10px] text-amber-600">{knownShowcase.individuals.length}匹</span>
          </div>
        </button>
      )}

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
                {selectedTank.speciesKind === "known"
                  ? selectedTank.speciesName
                  : `棚${selectedTank.tankNumber}・${selectedTank.speciesName}`}
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
                      {selectedTank.speciesKind === "known"
                        ? individual.speciesName
                        : `${index + 1}匹目`}
                      ・{GROWTH_STAGE_LABEL[individual.growthStage]}
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
