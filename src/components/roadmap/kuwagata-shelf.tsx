"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
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
// public/roadmap/kuwagata/配下に置くだけで反映される。種ごとにfront(正面)/back(背面)を
// 持てる形にしており、backが未着手の種・向きはKnownCreatureSprite側でfrontにフォール
// バックする。ここに無い種はTankOccupantのフォールバック(Bugアイコン)になる。
// legsBehindBody/legsInFrontOfBodyは配列の並び順がそのままDOM描画順(=重ね順)になる。
// 正面(front)は「奥脚(1本)→本体→手前脚3本→大顎」、背面(back)は「奥脚3本→本体→大顎」
// という向きごとに違う重なり方になるため、2つの配列に分けて向きごとに自由に組めるように
// している(体より奥に描く脚=legsBehindBody、体より手前に描く脚=legsInFrontOfBody)。
const KUWAGATA_ART_DIR = "/roadmap/kuwagata";

type CreaturePartArt = { src: string; delay: string };

type KnownCreatureArt = {
  body: string;
  // 背面からは構造上ほぼ見えないはずのパーツだが、素材があれば使う(無ければ省略可)。
  // 個体ごとのmandible_variant(DBのsmallint列、1始まり)をキーにした差分バリエーション。
  mandibles: Partial<Record<number, string>>;
  legsBehindBody: CreaturePartArt[];
  legsInFrontOfBody: CreaturePartArt[];
};

type Facing = "front" | "back";

const KNOWN_CREATURE_ART: Partial<Record<string, Partial<Record<Facing, KnownCreatureArt>>>> = {
  "KW-0001": {
    front: {
      body: `${KUWAGATA_ART_DIR}/kuwagata_KW-0001_front_body.svg`,
      mandibles: {
        1: `${KUWAGATA_ART_DIR}/kuwagata_KW-0001_front_mandible_01.svg`,
        2: `${KUWAGATA_ART_DIR}/kuwagata_KW-0001_front_mandible_02.svg`,
        3: `${KUWAGATA_ART_DIR}/kuwagata_KW-0001_front_mandible_03.svg`,
      },
      // 奥脚(見えているのは1本のみ、他2本は本体の陰に隠れる想定で未作成)
      legsBehindBody: [{ src: `${KUWAGATA_ART_DIR}/kuwagata_KW-0001_front_leg_R1.svg`, delay: "-0.55s" }],
      // 手前脚3本。配列の末尾(L1)が一番手前に重なる
      legsInFrontOfBody: [
        { src: `${KUWAGATA_ART_DIR}/kuwagata_KW-0001_front_leg_L3.svg`, delay: "-0.3s" },
        { src: `${KUWAGATA_ART_DIR}/kuwagata_KW-0001_front_leg_L2.svg`, delay: "-0.15s" },
        { src: `${KUWAGATA_ART_DIR}/kuwagata_KW-0001_front_leg_L1.svg`, delay: "0s" },
      ],
    },
    back: {
      body: `${KUWAGATA_ART_DIR}/kuwagata_KW-0001_back_body.svg`,
      mandibles: {
        1: `${KUWAGATA_ART_DIR}/kuwagata_KW-0001_back_mandible_01.svg`,
        2: `${KUWAGATA_ART_DIR}/kuwagata_KW-0001_back_mandible_02.svg`,
        3: `${KUWAGATA_ART_DIR}/kuwagata_KW-0001_back_mandible_03.svg`,
      },
      // 背面は3本とも本体の奥(後ろ)に重なる。配列の並び順=DOM描画順(先に描いたものほど
      // 奥)なので、一番手前に見せたいR1を配列の最後に置く(R3→R2→R1の順で描画される)
      legsBehindBody: [
        { src: `${KUWAGATA_ART_DIR}/kuwagata_KW-0001_back_leg_R3.svg`, delay: "-0.3s" },
        { src: `${KUWAGATA_ART_DIR}/kuwagata_KW-0001_back_leg_R2.svg`, delay: "-0.15s" },
        { src: `${KUWAGATA_ART_DIR}/kuwagata_KW-0001_back_leg_R1.svg`, delay: "0s" },
      ],
      legsInFrontOfBody: [],
    },
  },
};

// 実アートがある種だけ、パーツを重ねた正方形スプライトを描画する(無ければnullを返し、
// 呼び出し側がBugアイコンにフォールバックする)。描画順は奥から
// 「legsBehindBody→本体→legsInFrontOfBody→大顎(あれば)」。
// 一番外側のdivにもanimate-kuwagata-bodyを付け、脚の動きに合わせて本体全体も
// わずかに上下するようにして「その場で歩いている」感を出す。
// facingは歩く方向(下/左→正面、上/右→背面)から決まるが、backアートが無い種は
// 自動でfrontにフォールバックする。mandibleVariantは個体のmandible_variant列
// (1始まり)で、対応するバリエーションが無ければ1番にフォールバックする。
function KnownCreatureSprite({ code, facing, mandibleVariant }: { code: string; facing: Facing; mandibleVariant: number }) {
  const artSet = KNOWN_CREATURE_ART[code];
  const art = artSet?.[facing] ?? artSet?.front;
  if (!art) return null;
  const mandible = art.mandibles[mandibleVariant] ?? art.mandibles[1];

  return (
    <div className="relative h-full w-full animate-kuwagata-body">
      {art.legsBehindBody.map((leg, i) => (
        <img
          key={`behind${i}`}
          src={leg.src}
          alt=""
          className="absolute inset-0 h-full w-full animate-kuwagata-leg"
          style={{ animationDelay: leg.delay }}
        />
      ))}
      <img src={art.body} alt="" className="absolute inset-0 h-full w-full drop-shadow-sm" />
      {art.legsInFrontOfBody.map((leg, i) => (
        <img
          key={`front${i}`}
          src={leg.src}
          alt=""
          className="absolute inset-0 h-full w-full animate-kuwagata-leg"
          style={{ animationDelay: leg.delay }}
        />
      ))}
      {mandible && <img src={mandible} alt="" className="absolute inset-0 h-full w-full" />}
    </div>
  );
}

function TankOccupant({
  color,
  sizeScale,
  speciesCode,
  mandibleVariant = 1,
}: {
  color: string;
  sizeScale: number;
  speciesCode?: string;
  mandibleVariant?: number;
}) {
  const basePx = 28;
  const px = basePx * sizeScale;
  if (speciesCode && KNOWN_CREATURE_ART[speciesCode]) {
    return (
      <div style={{ width: px, height: px }}>
        <KnownCreatureSprite code={speciesCode} facing="front" mandibleVariant={mandibleVariant} />
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

// 衝突回避の判定は見た目(画面上の距離)で行う。left/topはそれぞれコンテナの
// 横幅/縦幅に対する%なので、そのままhypotすると単位が揃わない(水槽コンテナは
// aspect-[4/3]=縦が横の75%しかないため、top側の%は同じ数値でもleft側より実際の
// 距離が小さい)。topに0.75を掛けて「横幅%相当」に正規化してから距離を測る。
function surfaceDistancePct(a: { left: number; top: number }, b: { left: number; top: number }): number {
  return Math.hypot(a.left - b.left, (a.top - b.top) * 0.75);
}

// スプライトはwidthPct(コンテナ横幅に対する%)の正方形で、アンカー(left/top)は
// その下端中央。見た目の半径はwidthPctの半分よりやや余裕を持たせた値とし、
// 2者の半径の和より中心間距離が小さければ「ぶつかっている」とみなす。
const SPRITE_RADIUS_FACTOR = 0.6;
function spriteRadius(widthPct: number): number {
  return widthPct * SPRITE_RADIUS_FACTOR;
}

const SPOT_PICK_ATTEMPTS = 20;

// セーフティゾーン内(u,v = 0.28〜0.72)をランダムに歩き回らせるためのフック。
// 一定間隔で次の目的地(u,v)を決め、CSSのtransition(left/top)でそこへゆっくり
// 移動させる。個体ごとにinitial delayをズラしているので、同じ水槽内の複数匹が
// 同時に動き出さず自然に見える。移動のたびに前回位置との差分(dx/dy)から
// facing(正面/背面)も決める: 縦横どちらの移動量が大きいかで軸を選び、
// 下 or 左に動くときは正面、上 or 右に動くときは背面。
// decorationSpots(水槽内の置物)とpositionsRef(同じ水槽内の他個体の現在地、
// 親コンポーネントが持つ共有ref)を避けるよう、候補地を複数回抽出して一番条件に
// 合うものを選ぶ(best-effortの反発抽選。何回試しても避けられない場合は最後の
// 候補をそのまま使う=固まって動けなくなることはない)。
function useWander(
  seedKey: string,
  initial: { u: number; v: number },
  widthPct: number,
  decorationSpots: { u: number; v: number; widthPct: number }[],
  positionsRef: { current: Record<string, { u: number; v: number; widthPct: number }> },
): { spot: { u: number; v: number }; facing: Facing } {
  const [state, setState] = useState<{ spot: { u: number; v: number }; facing: Facing }>({
    spot: initial,
    facing: "front",
  });

  useEffect(() => {
    const positions = positionsRef.current;
    positions[seedKey] = { ...initial, widthPct };
    return () => {
      delete positions[seedKey];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey, widthPct]);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const ownRadius = spriteRadius(widthPct);
    const decorationPts = decorationSpots.map((spot) => ({ pt: surfacePoint(spot.u, spot.v), radius: spriteRadius(spot.widthPct) }));

    const pickNextSpot = () => {
      let candidate = { u: 0.28 + Math.random() * 0.44, v: 0.28 + Math.random() * 0.44 };
      for (let attempt = 0; attempt < SPOT_PICK_ATTEMPTS; attempt++) {
        candidate = { u: 0.28 + Math.random() * 0.44, v: 0.28 + Math.random() * 0.44 };
        const pt = surfacePoint(candidate.u, candidate.v);
        const hitsDecoration = decorationPts.some((d) => surfaceDistancePct(pt, d.pt) < ownRadius + d.radius);
        const hitsOther = Object.entries(positionsRef.current).some(([id, other]) => {
          if (id === seedKey) return false;
          return surfaceDistancePct(pt, surfacePoint(other.u, other.v)) < ownRadius + spriteRadius(other.widthPct);
        });
        if (!hitsDecoration && !hitsOther) break;
      }
      return candidate;
    };

    const goToNextSpot = () => {
      if (cancelled) return;
      setState((prev) => {
        const nextSpot = pickNextSpot();
        positionsRef.current[seedKey] = { ...nextSpot, widthPct };
        const prevPt = surfacePoint(prev.spot.u, prev.spot.v);
        const nextPt = surfacePoint(nextSpot.u, nextSpot.v);
        const dx = nextPt.left - prevPt.left;
        const dy = nextPt.top - prevPt.top;
        const facing: Facing = Math.abs(dy) >= Math.abs(dx) ? (dy >= 0 ? "front" : "back") : dx <= 0 ? "front" : "back";
        return { spot: nextSpot, facing };
      });
      timer = setTimeout(goToNextSpot, 9000 + Math.random() * 6000);
    };

    // 個体ごとに最初の移動タイミングをズラす(同期して動くのを防ぐ)
    const firstDelay = 400 + (hashHue(seedKey) % 2200);
    timer = setTimeout(goToNextSpot, firstDelay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [seedKey, widthPct, decorationSpots, positionsRef]);

  return state;
}

// 実際に歩き回るクワたん1匹分。位置(u,v)・向き(facing)はuseWanderで時間とともに
// 変化し、見た目(脚・本体のアニメ)はKnownCreatureSprite/Bugアイコン側が担当する。
function WanderingCreature({
  seedKey,
  initialSpot,
  widthPct,
  hasArt,
  speciesCode,
  mandibleVariant,
  color,
  mirror,
  decorationSpots,
  positionsRef,
}: {
  seedKey: string;
  initialSpot: { u: number; v: number };
  widthPct: number;
  hasArt: boolean;
  speciesCode: string;
  mandibleVariant: number;
  color: string;
  mirror: boolean;
  decorationSpots: { u: number; v: number; widthPct: number }[];
  positionsRef: { current: Record<string, { u: number; v: number; widthPct: number }> };
}) {
  const { spot, facing } = useWander(seedKey, initialSpot, widthPct, decorationSpots, positionsRef);
  const pt = surfacePoint(spot.u, spot.v);

  return (
    <div
      className="absolute -translate-y-full"
      style={{
        left: `${pt.left}%`,
        top: `${pt.top}%`,
        width: `${widthPct}%`,
        aspectRatio: hasArt ? "1 / 1" : undefined,
        transition: "left 7s ease-in-out, top 7s ease-in-out",
        // 実アートは左右反転しない(反転すると脚の左右が逆になってしまうため)。
        // Bugアイコンのフォールバックのみ、個体ごとに左右反転して向きにバリエーションを出す。
        transform: mirror ? "translateX(-50%) translateY(-100%) scaleX(-1)" : "translateX(-50%) translateY(-100%)",
      }}
    >
      {hasArt ? (
        <KnownCreatureSprite code={speciesCode} facing={facing} mandibleVariant={mandibleVariant} />
      ) : (
        <Bug className="block w-full h-auto drop-shadow-sm" style={{ color }} strokeWidth={1.75} />
      )}
    </div>
  );
}

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
  // 水槽内の「現在、他の個体がどこにいるか」を各WanderingCreatureが共有で読み書き
  // するためのref(Reactのstateにはしない=位置が変わってもこの水槽全体が再レンダー
  // されない)。モーダルを閉じるとEnlargedTankVisual自体がアンマウントされるので、
  // 次に開いたときは自動的に空の状態から始まる。
  const positionsRef = useRef<Record<string, { u: number; v: number; widthPct: number }>>({});
  // デコレーションは水槽(speciesId)ごとに決定的なので、個体の衝突回避にも
  // そのまま使い回す(描画用の配置情報と衝突回避用の座標リストを二重管理しない)。
  // widthPctも一緒に持たせ、衝突判定側でアイテムごとの実際の大きさを加味できるようにする。
  const decorations = useMemo(() => (isAquarium ? [] : pickDecorations(tank)), [tank, isAquarium]);
  const decorationSpots = useMemo(
    () => decorations.map((d) => ({ u: d.spot.u, v: d.spot.v, widthPct: d.widthPct })),
    [decorations],
  );

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
        decorations.map((deco, index) => {
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
        const initialSpot = CREATURE_SPOTS[index % CREATURE_SPOTS.length];
        const widthPct = creatureWidthPct(individual.sizeScale);
        const hasArt = Boolean(KNOWN_CREATURE_ART[individual.speciesCode]);
        return (
          <WanderingCreature
            key={individual.id}
            seedKey={individual.id}
            initialSpot={initialSpot}
            widthPct={widthPct}
            hasArt={hasArt}
            speciesCode={individual.speciesCode}
            mandibleVariant={individual.mandibleVariant}
            color={color}
            mirror={!hasArt && index % 2 === 1}
            decorationSpots={decorationSpots}
            positionsRef={positionsRef}
          />
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
                mandibleVariant={individual.mandibleVariant}
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
              <TankOccupant
                color={color}
                sizeScale={representative.sizeScale}
                speciesCode={representative.speciesCode}
                mandibleVariant={representative.mandibleVariant}
              />
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
                    mandibleVariant={individual.mandibleVariant}
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
