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

// 既知種の実アート(パーツ分解済みSVG)。brand/kuwagata-asset-spec.mdの命名規則どおり
// public/roadmap/kuwagata/配下に置くだけで反映される。まだエークワたん(KW-0001)の
// 正面向きしかないため、ここに無い種・向きはTankOccupantのフォールバック(Bugアイコン)になる。
// originXPct/originYPctは各パーツの付け根位置を112×112のキャンバスに対する%で記録した
// ものだが、現状の歩行アニメ(前後にスライドするtranslateX)では未使用。将来、脚ごとに
// 振れ幅や向きを個別調整する際の参考値として残している。
const KUWAGATA_ART_DIR = "/roadmap/kuwagata";

type CreaturePartArt = { src: string; originXPct: number; originYPct: number; delay: string };

type KnownCreatureArt = {
  body: string;
  mandible: string;
  legsL: CreaturePartArt[];
  legR: CreaturePartArt;
};

const KNOWN_CREATURE_ART: Partial<Record<string, KnownCreatureArt>> = {
  "KW-0001": {
    body: `${KUWAGATA_ART_DIR}/kuwagata_KW-0001_front_body.svg`,
    mandible: `${KUWAGATA_ART_DIR}/kuwagata_KW-0001_front_mandible_01.svg`,
    legsL: [
      { src: `${KUWAGATA_ART_DIR}/kuwagata_KW-0001_front_leg_L1.svg`, originXPct: 59.5, originYPct: 69.6, delay: "0s" },
      { src: `${KUWAGATA_ART_DIR}/kuwagata_KW-0001_front_leg_L2.svg`, originXPct: 67.9, originYPct: 65.9, delay: "-0.15s" },
      { src: `${KUWAGATA_ART_DIR}/kuwagata_KW-0001_front_leg_L3.svg`, originXPct: 74.7, originYPct: 62.1, delay: "-0.3s" },
    ],
    legR: { src: `${KUWAGATA_ART_DIR}/kuwagata_KW-0001_front_leg_R1.svg`, originXPct: 17.1, originYPct: 64.1, delay: "-0.55s" },
  },
};

// 実アートがある種だけ、パーツを重ねた正方形スプライトを描画する(無ければnullを返し、
// 呼び出し側がBugアイコンにフォールバックする)。描画順は奥から
// 「奥脚(R、1本のみ)→本体→手前脚(L3→L2→L1)→大顎」。手前の3本は本体より手前(上)に重ねて、
// 体の陰に隠れず歩いているのが見えるようにする。奥脚は本体の下に隠れて先端だけ覗く。
// 一番外側のdivにもanimate-kuwagata-bodyを付け、脚の動きに合わせて本体全体も
// わずかに上下するようにして「その場で歩いている」感を出す。
function KnownCreatureSprite({ code }: { code: string }) {
  const art = KNOWN_CREATURE_ART[code];
  if (!art) return null;

  return (
    <div className="relative h-full w-full animate-kuwagata-body">
      <img
        src={art.legR.src}
        alt=""
        className="absolute inset-0 h-full w-full animate-kuwagata-leg"
        style={{ animationDelay: art.legR.delay }}
      />
      <img src={art.body} alt="" className="absolute inset-0 h-full w-full drop-shadow-sm" />
      {[...art.legsL].reverse().map((leg, i) => (
        <img
          key={`l${i}`}
          src={leg.src}
          alt=""
          className="absolute inset-0 h-full w-full animate-kuwagata-leg"
          style={{ animationDelay: leg.delay }}
        />
      ))}
      <img src={art.mandible} alt="" className="absolute inset-0 h-full w-full" />
    </div>
  );
}

function TankOccupant({ color, sizeScale, speciesCode }: { color: string; sizeScale: number; speciesCode?: string }) {
  const basePx = 28;
  const px = basePx * sizeScale;
  if (speciesCode && KNOWN_CREATURE_ART[speciesCode]) {
    return (
      <div style={{ width: px, height: px }}>
        <KnownCreatureSprite code={speciesCode} />
      </div>
    );
  }
  return (
    <Bug
      className="drop-shadow-sm"
      style={{ color, width: px, height: px }}
      strokeWidth={1.75}
    />
  );
}

// 拡大水槽表示の中だけは、他の表示箇所(棚のグリッド・リストなど)と違って固定pxではなく
// コンテナ幅に対する%でサイズを決める(デコレーションと同じ考え方)。ポップアップの大きさが
// 変わっても常に水槽とバランスが取れた大きさになる。individual.sizeScaleは0.8〜1.3
// (kuwagata.tsのSIZE_SCALE_MIN/MAX)なので、それを10%〜16%の表示幅にマッピングする。
function creatureWidthPct(sizeScale: number): number {
  const t = (sizeScale - 0.8) / (1.3 - 0.8);
  return 10 + t * 6;
}

// テラリウム背景（tank_bg_terrarium.png）の「土の天面」の実測座標（コンテナに対する%）。
// 画像をピクセル解析し、天面（明るい土色）の連結領域から4頂点を抽出して算出した
// 平行四辺形（奥=back・右=right・手前=front・左=left）。側面（土の側面・濃い色）や
// 背景のガラス部分にアイテムが浮いて見えないよう、デコレーション・クワたんはこの中だけに置く。
const TANK_SURFACE = {
  back: { left: 26.7, top: 24.8 },
  right: { left: 97.7, top: 53.9 },
  left: { left: 1.9, top: 55.2 },
};

// 平行四辺形なので back + u*(right-back) + v*(left-back) で天面内の任意の点が求まる。
// u, vは0〜1だが、スプライトの見た目の大きさ分の余白を持たせるため呼び出し側では
// 0.12〜0.88程度の範囲に収めて「安全地帯」を作る。
function surfacePoint(u: number, v: number): { left: number; top: number } {
  const left = TANK_SURFACE.back.left + u * (TANK_SURFACE.right.left - TANK_SURFACE.back.left) + v * (TANK_SURFACE.left.left - TANK_SURFACE.back.left);
  const top = TANK_SURFACE.back.top + u * (TANK_SURFACE.right.top - TANK_SURFACE.back.top) + v * (TANK_SURFACE.left.top - TANK_SURFACE.back.top);
  return { left, top };
}

// クワたん・デコレーションの置き場所(u,v)。0.28〜0.72程度に収め、天面の縁から
// もう一回り内側に余白を持たせている(=座標のセーフティゾーン)。
const CREATURE_SPOTS: { u: number; v: number }[] = [
  { u: 0.5, v: 0.45 },
  { u: 0.32, v: 0.32 },
  { u: 0.68, v: 0.35 },
  { u: 0.36, v: 0.62 },
  { u: 0.66, v: 0.64 },
];

const DECORATION_SPOTS: { u: number; v: number }[] = [
  { u: 0.3, v: 0.68 },
  { u: 0.7, v: 0.3 },
  { u: 0.5, v: 0.7 },
];

// アクアリウムはまだ実アート未着手のため、天面の実測座標がない。既存の簡易な泡配置だけ残す。
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
  { id: "stone", file: "/roadmap/tank/tank_item_stone.svg", widthPct: 11 },
  { id: "food", file: "/roadmap/tank/tank_item_food.svg", widthPct: 9 },
];

// 水槽（speciesId）ごとに固定された組み合わせになるよう、開くたびに変わらないシード付き
// 乱数で選ぶ（hashHueと同じ考え方）。クワたん本体より先にDOMへ描画することで、本体が
// 手前に重なって見えるようにしている（z-indexは使わず描画順だけで奥行きを表現）。
function pickDecorations(tank: KuwagataShelfTank): { file: string; widthPct: number; spot: { u: number; v: number } }[] {
  const seed = hashHue(tank.speciesId);
  const count = 1 + (seed % 2);
  const picks: { file: string; widthPct: number; spot: { u: number; v: number } }[] = [];
  for (let i = 0; i < count; i++) {
    const item = DECORATION_POOL[(seed + i * 7) % DECORATION_POOL.length];
    const spot = DECORATION_SPOTS[(seed + i) % DECORATION_SPOTS.length];
    picks.push({ file: item.file, widthPct: item.widthPct, spot });
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
      {isAquarium &&
        AQUARIUM_BUBBLES.map((bubble, i) => (
          <div
            key={i}
            className="absolute rounded-full bg-white/50"
            style={{ left: bubble.left, bottom: bubble.bottom, width: bubble.size, height: bubble.size }}
          />
        ))}
      {!isAquarium &&
        pickDecorations(tank).map((deco, index) => {
          const pt = surfacePoint(deco.spot.u, deco.spot.v);
          return (
            <div
              key={index}
              className="absolute -translate-x-1/2 -translate-y-full"
              style={{ left: `${pt.left}%`, top: `${pt.top}%`, width: `${deco.widthPct}%` }}
            >
              <img src={deco.file} alt="" className="block w-full object-contain drop-shadow-sm" />
            </div>
          );
        })}
      {tank.individuals.map((individual, index) => {
        if (isAquarium) {
          // アクアリウムは実アート未着手のため、従来どおりの簡易配置のまま
          const left = ["62%", "28%", "45%", "78%", "15%"][index % 5];
          const bottom = [56, 52, 64, 50, 60][index % 5];
          return (
            <div
              key={individual.id}
              className="absolute -translate-x-1/2"
              style={{ left, bottom, transform: index % 2 === 1 ? "translateX(-50%) scaleX(-1)" : "translateX(-50%)" }}
            >
              <TankOccupant color={color} sizeScale={individual.sizeScale * 1.4} />
            </div>
          );
        }
        const spot = CREATURE_SPOTS[index % CREATURE_SPOTS.length];
        const pt = surfacePoint(spot.u, spot.v);
        const widthPct = creatureWidthPct(individual.sizeScale);
        const hasArt = Boolean(KNOWN_CREATURE_ART[individual.speciesCode]);
        return (
          <div
            key={individual.id}
            className="absolute -translate-y-full"
            style={{
              left: `${pt.left}%`,
              top: `${pt.top}%`,
              width: `${widthPct}%`,
              aspectRatio: hasArt ? "1 / 1" : undefined,
              // 実アートは正面向き固定(反転すると脚の左右が逆になってしまうため)。
              // Bugアイコンのフォールバックのみ、個体ごとに左右反転して向きにバリエーションを出す。
              transform: !hasArt && index % 2 === 1 ? "translateX(-50%) translateY(-100%) scaleX(-1)" : "translateX(-50%) translateY(-100%)",
            }}
          >
            {hasArt ? (
              <KnownCreatureSprite code={individual.speciesCode} />
            ) : (
              <Bug className="block w-full h-auto drop-shadow-sm" style={{ color }} strokeWidth={1.75} />
            )}
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
              <TankOccupant
                key={individual.id}
                color={KNOWN_SPECIES_COLOR}
                sizeScale={individual.sizeScale * 0.8}
                speciesCode={individual.speciesCode}
              />
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
              <TankOccupant color={color} sizeScale={representative.sizeScale} speciesCode={representative.speciesCode} />
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
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-zinc-800 sm:text-lg">
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
                  <TankOccupant
                    color={tankColor(selectedTank)}
                    sizeScale={individual.sizeScale}
                    speciesCode={individual.speciesCode}
                  />
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
