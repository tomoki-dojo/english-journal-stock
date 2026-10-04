"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Bug, Check, ChevronLeft, ChevronRight, Pencil, X } from "lucide-react";
import type { KuwagataGrowthStage, KuwagataShelfTank } from "@/lib/supabase/kuwagata";

const GROWTH_STAGE_LABEL: Record<string, string> = {
  卵: "卵",
  幼虫: "幼虫",
  蛹: "蛹",
  成虫: "成虫",
};

// 名前の最大文字数。サーバー側(kuwagata.tsのKUWAGATA_NICKNAME_MAX_LENGTH・DBのCHECK制約)と揃える。
// kuwagata.tsはサーバー専用モジュールなのでクライアントからは値をimportできず、ここに別定義している。
const NICKNAME_MAX_LENGTH = 10;

const KNOWN_SPECIES_COLOR = "#92400e";

function hashHue(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 360;
  }
  return hash;
}

// 同じ種類が複数の水槽(1水槽6匹まで)に分かれているときも、棚の一覧では1種類につき1枚の
// カードにまとめる(水槽の切り替えは拡大表示の中のページャで行う)。並び順は元のまま。
function groupBySpecies(tanks: KuwagataShelfTank[]): KuwagataShelfTank[][] {
  const groups = new Map<string, KuwagataShelfTank[]>();
  for (const tank of tanks) {
    const group = groups.get(tank.speciesId);
    if (group) group.push(tank);
    else groups.set(tank.speciesId, [tank]);
  }
  return Array.from(groups.values());
}

function pickRepresentative(group: KuwagataShelfTank[]) {
  return group.flatMap((t) => t.individuals).reduce((a, b) => (b.sizeScale > a.sizeScale ? b : a));
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

// 実際に進んでいる左右方向。成虫はfacing(正面/背面)で絵を切り替えるが、左向き1方向の
// 絵しかない幼虫は、右へ進むときだけ左右反転して「後ろ向きに進む」不自然さを避ける。
type Heading = "left" | "right";

// 既知種の成虫アートは、全種で同じパーツ構成(前向き=本体・大顎3種・奥脚1本・手前脚3本、
// 後ろ向き=本体・大顎3種・脚3本)。ファイル名はkuwagata_{コード}_{パーツ}.svgで揃えてあるので、
// コードを渡して組み立てる(パーツの意味・描画順の注意は下のコメント参照)。
function buildKnownCreatureArt(code: string): Partial<Record<Facing, KnownCreatureArt>> {
  const file = (part: string) => `${KUWAGATA_ART_DIR}/kuwagata_${code}_${part}.svg`;
  return {
    front: {
      body: file("front_body"),
      mandibles: {
        1: file("front_mandible_01"),
        2: file("front_mandible_02"),
        3: file("front_mandible_03"),
      },
      // 奥脚(見えているのは1本のみ、他2本は本体の陰に隠れる想定で未作成)
      legsBehindBody: [{ src: file("front_leg_R1"), delay: "-0.55s" }],
      // 手前脚3本。配列の末尾(L1)が一番手前に重なる
      legsInFrontOfBody: [
        { src: file("front_leg_L3"), delay: "-0.3s" },
        { src: file("front_leg_L2"), delay: "-0.15s" },
        { src: file("front_leg_L1"), delay: "0s" },
      ],
    },
    back: {
      body: file("back_body"),
      mandibles: {
        1: file("back_mandible_01"),
        2: file("back_mandible_02"),
        3: file("back_mandible_03"),
      },
      // 背面は3本とも本体の奥(後ろ)に重なる。配列の並び順=DOM描画順(先に描いたものほど
      // 奥)なので、一番手前に見せたいR1を配列の最後に置く(R3→R2→R1の順で描画される)
      legsBehindBody: [
        { src: file("back_leg_R3"), delay: "-0.3s" },
        { src: file("back_leg_R2"), delay: "-0.15s" },
        { src: file("back_leg_R1"), delay: "0s" },
      ],
      legsInFrontOfBody: [],
    },
  };
}

const KNOWN_CREATURE_ART: Partial<Record<string, Partial<Record<Facing, KnownCreatureArt>>>> = {
  "KW-0001": buildKnownCreatureArt("KW-0001"),
  // ヒビクワたん(背中に波紋模様)
  "KW-0002": buildKnownCreatureArt("KW-0002"),
  // シャベクワたん
  "KW-0003": buildKnownCreatureArt("KW-0003"),
  // フルクワたん
  "KW-0008": buildKnownCreatureArt("KW-0008"),
  // テッペンクワたん
  "KW-0004": buildKnownCreatureArt("KW-0004"),
};

// 成長段階(卵・幼虫・蛹)のアート。成虫のKNOWN_CREATURE_ARTとは別に持ち、ここに無い
// 種・段階は成虫のアートにフォールバックする。卵と蛹は静止画1枚(動かない)、幼虫は
// 体節3パーツ(描画順=配列順、奥→手前)をそれぞれくねらせて、成虫と同じく水槽内を
// 歩き回る。originX/Y%は各体節の回転基準点(隣の体節との付け根)、wiggleDegは振れ幅、
// delayは位相ずれ(頭→胴体前半→胴体後半の順に少しずつ遅らせて「くねり」にする)。
// 幼虫の絵は左向き1方向のみ。右へ進むときはKnownCreatureSprite側で左右反転する。
type LarvaPartArt = { src: string; originXPct: number; originYPct: number; wiggleDeg: number; delay: string };

type KnownStageArt = {
  egg?: string;
  larva?: LarvaPartArt[];
  pupa?: string;
};

// 既知種共通の幼虫の体節構成。エークワたん・ヒビクワたんは体節の形・位置が同じなので
// 回転基準点・振れ幅も共通(頭の色など塗りだけが種ごとに違う)。形が違う種を足すときは
// この値を種ごとに持たせる。
function buildKnownStageArt(code: string): KnownStageArt {
  const file = (part: string) => `${KUWAGATA_ART_DIR}/kuwagata_${code}_${part}.svg`;
  return {
    egg: file("egg"),
    larva: [
      { src: file("larva_body_rear"), originXPct: 49, originYPct: 55, wiggleDeg: 4, delay: "-0.6s" },
      { src: file("larva_body_front"), originXPct: 31, originYPct: 54, wiggleDeg: 2.5, delay: "-0.3s" },
      { src: file("larva_head"), originXPct: 40, originYPct: 59, wiggleDeg: 3, delay: "0s" },
    ],
    pupa: file("pupa"),
  };
}

const KNOWN_STAGE_ART: Partial<Record<string, KnownStageArt>> = {
  "KW-0001": buildKnownStageArt("KW-0001"),
  "KW-0002": buildKnownStageArt("KW-0002"),
  "KW-0003": buildKnownStageArt("KW-0003"),
  "KW-0008": buildKnownStageArt("KW-0008"),
  "KW-0004": buildKnownStageArt("KW-0004"),
};

// 卵・蛹は動かない(その場に置いたまま)。幼虫・成虫(と、実アートが無い種のBugアイコン)は歩き回る。
function isStationaryStage(code: string, growthStage: KuwagataGrowthStage): boolean {
  const stageArt = KNOWN_STAGE_ART[code];
  if (growthStage === "卵") return Boolean(stageArt?.egg);
  if (growthStage === "蛹") return Boolean(stageArt?.pupa);
  return false;
}

// 実アートがある種だけ、パーツを重ねた正方形スプライトを描画する(無ければnullを返し、
// 呼び出し側がBugアイコンにフォールバックする)。描画順は奥から
// 「legsBehindBody→本体→legsInFrontOfBody→大顎(あれば)」。
// 一番外側のdivにもanimate-kuwagata-bodyを付け、脚の動きに合わせて本体全体も
// わずかに上下するようにして「その場で歩いている」感を出す。
// facingは歩く方向(下/左→正面、上/右→背面)から決まるが、backアートが無い種は
// 自動でfrontにフォールバックする。mandibleVariantは個体のmandible_variant列
// (1始まり)で、対応するバリエーションが無ければ1番にフォールバックする。
// growthStageが卵・幼虫・蛹で、その種にKNOWN_STAGE_ARTがあれば成虫のアートの代わりに
// 成長段階のアートを描画する(無ければ成虫のアートにフォールバック)。
// headingは幼虫専用(左向き1方向のみの絵なので、右へ進むときだけ左右反転する)。
function KnownCreatureSprite({
  code,
  facing,
  mandibleVariant,
  growthStage = "成虫",
  heading = "left",
  phaseSeed = "",
  fighting = false,
}: {
  code: string;
  facing: Facing;
  mandibleVariant: number;
  growthStage?: KuwagataGrowthStage;
  heading?: Heading;
  phaseSeed?: string;
  fighting?: boolean;
}) {
  const stageArt = KNOWN_STAGE_ART[code];

  // 卵・蛹は歩かないが、ときどきピクピク震える。個体ごとに位相をずらして同期させない。
  const twitchDelay = `-${((hashHue(phaseSeed) % 30) / 10).toFixed(1)}s`;
  if (growthStage === "卵" && stageArt?.egg) {
    return (
      <img
        src={stageArt.egg}
        alt=""
        className="absolute inset-0 h-full w-full animate-kuwagata-egg drop-shadow-sm"
        style={{ animationDelay: twitchDelay }}
      />
    );
  }
  if (growthStage === "蛹" && stageArt?.pupa) {
    return (
      <img
        src={stageArt.pupa}
        alt=""
        className="absolute inset-0 h-full w-full animate-kuwagata-pupa drop-shadow-sm"
        style={{ animationDelay: twitchDelay }}
      />
    );
  }
  if (growthStage === "幼虫" && stageArt?.larva) {
    return (
      <div className="relative h-full w-full" style={{ transform: heading === "right" ? "scaleX(-1)" : undefined }}>
        {stageArt.larva.map((part, i) => (
          <img
            key={i}
            src={part.src}
            alt=""
            className="absolute inset-0 h-full w-full animate-kuwagata-larva"
            style={
              {
                transformOrigin: `${part.originXPct}% ${part.originYPct}%`,
                animationDelay: part.delay,
                "--wiggle-deg": `${part.wiggleDeg}deg`,
              } as CSSProperties
            }
          />
        ))}
      </div>
    );
  }

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
      {mandible && (
        <img
          src={mandible}
          alt=""
          className={`absolute inset-0 h-full w-full ${fighting ? "animate-kuwagata-fight-jaw" : ""}`}
        />
      )}
    </div>
  );
}

function TankOccupant({
  color,
  sizeScale,
  speciesCode,
  mandibleVariant = 1,
  growthStage = "成虫",
}: {
  color: string;
  sizeScale: number;
  speciesCode?: string;
  mandibleVariant?: number;
  growthStage?: KuwagataGrowthStage;
}) {
  const basePx = 28;
  const px = basePx * sizeScale;
  if (speciesCode && KNOWN_CREATURE_ART[speciesCode]) {
    return (
      <div className="relative" style={{ width: px, height: px }}>
        <KnownCreatureSprite code={speciesCode} facing="front" mandibleVariant={mandibleVariant} growthStage={growthStage} />
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

const SPOT_PICK_ATTEMPTS = 30;

// セーフティゾーン内(u,v = 0.28〜0.72)をランダムに歩き回らせるためのフック。
// 一定間隔で次の目的地(u,v)を決め、CSSのtransition(left/top)でそこへゆっくり
// 移動させる。個体ごとにinitial delayをズラしているので、同じ水槽内の複数匹が
// 同時に動き出さず自然に見える。移動のたびに前回位置との差分(dx/dy)から
// facing(正面/背面)も決める: 縦横どちらの移動量が大きいかで軸を選び、
// 下 or 左に動くときは正面、上 or 右に動くときは背面。
// decorationSpots(水槽内の置物)とpositionsRef(同じ水槽内の他個体の現在地、
// 親コンポーネントが持つ共有ref)を避けるよう、候補地を複数回抽出する。
// 「衝突しない候補が見つかったら即採用」ではなく、毎回全候補のスコア(一番近い
// 相手との余裕=距離-必要距離の最小値)を計算し、その余裕が一番大きい=一番
// マシな候補を採用する方式(best-of-N)。セーフティゾーンが狭く理想的な間隔を
// 確保できない組み合わせでも、できる範囲で一番離れた場所を選ぶので「衝突しない
// 候補が1つも無いときだけ無条件のハズレ候補になる」という弱点が出ない。
// movesがfalse(卵・蛹)のときは歩き回らず、initialの位置に置いたまま(他の個体が避けられるよう
// 位置の登録だけは行う)。headingは直近の移動の左右方向で、左向き1方向の絵しかない幼虫の
// 左右反転に使う。
function useWander(
  seedKey: string,
  initial: { u: number; v: number },
  widthPct: number,
  moves: boolean,
  decorationSpots: { u: number; v: number; widthPct: number }[],
  positionsRef: { current: Record<string, { u: number; v: number; widthPct: number }> },
): { spot: { u: number; v: number }; facing: Facing; heading: Heading } {
  const [state, setState] = useState<{ spot: { u: number; v: number }; facing: Facing; heading: Heading }>({
    spot: initial,
    facing: "front",
    heading: "left",
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
    if (!moves) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const ownRadius = spriteRadius(widthPct);
    const decorationPts = decorationSpots.map((spot) => ({ pt: surfacePoint(spot.u, spot.v), radius: spriteRadius(spot.widthPct) }));

    const pickNextSpot = () => {
      const others = Object.entries(positionsRef.current).filter(([id]) => id !== seedKey);
      let best = { u: 0.28 + Math.random() * 0.44, v: 0.28 + Math.random() * 0.44 };
      let bestSlack = -Infinity;
      for (let attempt = 0; attempt < SPOT_PICK_ATTEMPTS; attempt++) {
        const candidate = { u: 0.28 + Math.random() * 0.44, v: 0.28 + Math.random() * 0.44 };
        const pt = surfacePoint(candidate.u, candidate.v);
        // スコア=一番近い障害物との余裕(距離-必要距離)の最小値。プラスなら衝突なし、
        // マイナスでも値が大きい(=0に近い)ほど「まだマシな重なり方」として優先される。
        let slack = Infinity;
        for (const d of decorationPts) {
          slack = Math.min(slack, surfaceDistancePct(pt, d.pt) - (ownRadius + d.radius));
        }
        for (const [, other] of others) {
          slack = Math.min(slack, surfaceDistancePct(pt, surfacePoint(other.u, other.v)) - (ownRadius + spriteRadius(other.widthPct)));
        }
        if (slack > bestSlack) {
          bestSlack = slack;
          best = candidate;
        }
        if (bestSlack >= 0) break; // 完全に衝突しない候補が見つかったので十分
      }
      return best;
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
        const heading: Heading = dx === 0 ? prev.heading : dx < 0 ? "left" : "right";
        return { spot: nextSpot, facing, heading };
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
  }, [seedKey, widthPct, moves, decorationSpots, positionsRef]);

  return state;
}

// 卵・蛹のように動かない個体の置き場所。固定のCREATURE_SPOTSだと置物とぶつかる位置に
// なることがあるため、useWanderと同じ「一番余裕のある候補を採用」(best-of-N)で1回だけ決める。
// 開くたびに位置が変わらないよう、乱数はseedKey(個体id)から作る決定的なもの。
// takenには既に置いた他の動かない個体も渡し、重ならないようにする。
function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickStationarySpot(
  seedKey: string,
  widthPct: number,
  decorationSpots: { u: number; v: number; widthPct: number }[],
  taken: { u: number; v: number; widthPct: number }[],
): { u: number; v: number } {
  const random = seededRandom(seedKey);
  const ownRadius = spriteRadius(widthPct);
  const obstacles = [...decorationSpots, ...taken].map((o) => ({ pt: surfacePoint(o.u, o.v), radius: spriteRadius(o.widthPct) }));
  let best = { u: 0.5, v: 0.5 };
  let bestSlack = -Infinity;
  for (let attempt = 0; attempt < SPOT_PICK_ATTEMPTS * 2; attempt++) {
    const candidate = { u: 0.28 + random() * 0.44, v: 0.28 + random() * 0.44 };
    const pt = surfacePoint(candidate.u, candidate.v);
    let slack = Infinity;
    for (const o of obstacles) {
      slack = Math.min(slack, surfaceDistancePct(pt, o.pt) - (ownRadius + o.radius));
    }
    if (slack > bestSlack) {
      bestSlack = slack;
      best = candidate;
    }
    if (bestSlack >= 0) break;
  }
  return best;
}

// 実際に歩き回るクワたん1匹分。位置(u,v)・向き(facing)はuseWanderで時間とともに
// 変化し、見た目(脚・本体のアニメ)はKnownCreatureSprite/Bugアイコン側が担当する。
// シャベクワたん(KW-0003)の「他の個体とよく喋る仕草」。水槽に他の個体がいるときだけ、15秒に1回、
// 3秒間だけ体を小さく揺らして頭上に「…」の吹き出しを出す。個体ごとに開始をずらして一斉に喋らない。
const CHATTER_CYCLE_MS = 15000;
const CHATTER_DURATION_MS = 3000;
const CHATTER_SPECIES_CODE = "KW-0003";

// 吹き出しの中身。「…」(点滅する3つの点)40%・「♪」「♡」「？」20%ずつの重み付きで、喋るたびに選び直す。
type ChatterBubble = "dots" | "♪" | "♡" | "？";
const CHATTER_BUBBLES: { bubble: ChatterBubble; weight: number }[] = [
  { bubble: "dots", weight: 40 },
  { bubble: "♪", weight: 20 },
  { bubble: "♡", weight: 20 },
  { bubble: "？", weight: 20 },
];
const CHATTER_SYMBOL_COLOR: Record<Exclude<ChatterBubble, "dots">, string> = {
  "♪": "#d97706",
  "♡": "#ec4899",
  "？": "#0284c7",
};

function pickChatterBubble(): ChatterBubble {
  const total = CHATTER_BUBBLES.reduce((sum, b) => sum + b.weight, 0);
  let roll = Math.random() * total;
  for (const { bubble, weight } of CHATTER_BUBBLES) {
    roll -= weight;
    if (roll < 0) return bubble;
  }
  return "dots";
}

// 喋っている間は吹き出しの種類を返し、それ以外はnull。
function useChatter(enabled: boolean, seedKey: string): ChatterBubble | null {
  const [bubble, setBubble] = useState<ChatterBubble | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;

    // 最初の1回までの待ち時間を個体ごとに変える(0〜12秒)
    const firstDelay = seededRandom(seedKey + ":chat")() * (CHATTER_CYCLE_MS - CHATTER_DURATION_MS);

    const startChat = () => {
      if (cancelled) return;
      setBubble(pickChatterBubble());
      timer = setTimeout(() => {
        if (cancelled) return;
        setBubble(null);
        timer = setTimeout(startChat, CHATTER_CYCLE_MS - CHATTER_DURATION_MS);
      }, CHATTER_DURATION_MS);
    };

    timer = setTimeout(startChat, firstDelay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setBubble(null);
    };
  }, [enabled, seedKey]);

  return bubble;
}

// フルクワたん(KW-0008)の「ファイティングポーズ」。本番に強い実践派らしく、12秒に1回・3秒間、
// 体を前にかがめて小刻みに構え、大顎をガチガチ開閉する。個体ごとに開始をずらして一斉には構えない。
const FIGHT_CYCLE_MS = 12000;
const FIGHT_DURATION_MS = 3000;
const FIGHT_SPECIES_CODE = "KW-0008";

function useFighting(enabled: boolean, seedKey: string): boolean {
  const [fighting, setFighting] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const firstDelay = seededRandom(seedKey + ":fight")() * (FIGHT_CYCLE_MS - FIGHT_DURATION_MS);

    const start = () => {
      if (cancelled) return;
      setFighting(true);
      timer = setTimeout(() => {
        if (cancelled) return;
        setFighting(false);
        timer = setTimeout(start, FIGHT_CYCLE_MS - FIGHT_DURATION_MS);
      }, FIGHT_DURATION_MS);
    };

    timer = setTimeout(start, firstDelay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setFighting(false);
    };
  }, [enabled, seedKey]);

  return fighting;
}

function WanderingCreature({
  seedKey,
  initialSpot,
  widthPct,
  hasArt,
  speciesCode,
  mandibleVariant,
  growthStage,
  nickname,
  color,
  mirror,
  decorationSpots,
  positionsRef,
  hasCompanions,
}: {
  seedKey: string;
  initialSpot: { u: number; v: number };
  widthPct: number;
  hasArt: boolean;
  speciesCode: string;
  mandibleVariant: number;
  growthStage: KuwagataGrowthStage;
  nickname: string | null;
  color: string;
  mirror: boolean;
  decorationSpots: { u: number; v: number; widthPct: number }[];
  positionsRef: { current: Record<string, { u: number; v: number; widthPct: number }> };
  // 同じ水槽に自分以外の個体がいるか(シャベクワたんの「喋る仕草」の条件)
  hasCompanions: boolean;
}) {
  const chatterBubble = useChatter(
    hasCompanions && speciesCode === CHATTER_SPECIES_CODE && growthStage === "成虫" && hasArt,
    seedKey
  );
  const chatting = chatterBubble !== null;
  const fighting = useFighting(speciesCode === FIGHT_SPECIES_CODE && growthStage === "成虫" && hasArt, seedKey);
  const moves = !isStationaryStage(speciesCode, growthStage);
  const { spot, facing, heading } = useWander(seedKey, initialSpot, widthPct, moves, decorationSpots, positionsRef);
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
        <div
          className={`h-full w-full ${chatting ? "animate-kuwagata-chat" : ""} ${fighting ? "animate-kuwagata-fight" : ""}`}
        >
          <KnownCreatureSprite
            fighting={fighting}
            code={speciesCode}
            facing={facing}
            mandibleVariant={mandibleVariant}
            growthStage={growthStage}
            heading={heading}
            phaseSeed={seedKey}
          />
        </div>
      ) : (
        <Bug className="block w-full h-auto drop-shadow-sm" style={{ color }} strokeWidth={1.75} />
      )}
      {chatterBubble && (
        // 喋っている間だけ出る丸い吹き出し。名前ラベルより手前(z-20)・さらに上に出して、ラベルに被らない。
        // 左下の三角の角が体のほうを指す。中身は「…」(順に点滅)・「♪」「♡」「？」のどれか。
        <span
          className="animate-question-card-enter pointer-events-none absolute z-20 flex h-6 w-6 items-center justify-center gap-0.5 rounded-full bg-white shadow-sm"
          style={{ left: "62%", top: "2%", transform: "translateY(-100%)" }}
        >
          <span
            className="absolute"
            style={{
              left: 3,
              bottom: -4,
              width: 0,
              height: 0,
              borderLeft: "4px solid transparent",
              borderRight: "4px solid transparent",
              borderTop: "6px solid #fff",
              transform: "rotate(20deg)",
            }}
          />
          {chatterBubble === "dots" ? (
            [0, 1, 2].map((dot) => (
              <span
                key={dot}
                className="animate-kuwagata-chat-dot relative h-1 w-1 rounded-full bg-zinc-500"
                style={{ animationDelay: `${dot * 0.2}s` }}
              />
            ))
          ) : (
            <span
              className="relative text-[13px] font-bold leading-none"
              style={{ color: CHATTER_SYMBOL_COLOR[chatterBubble] }}
            >
              {chatterBubble}
            </span>
          )}
        </span>
      )}
      {nickname && (
        // 名前ラベル。スプライトの頭上に出し、歩き回るのに合わせてラベルも一緒に動く。
        // 幅は名前の最大10文字(+左右の余白)が省略されずに入る広さ。最長の種類名は「テッペンクワたん」(8文字)。
        // 実アートの正方形キャンバスは上に透明な余白があるため、その分だけ下げて本体の
        // すぐ上に付ける(Bugアイコンは余白が無いので枠の上端)。
        // 左右反転するBugフォールバックでは、文字が鏡文字にならないよう反転を打ち消す。
        <span
          className="pointer-events-none absolute left-1/2 z-10 max-w-[11em] truncate whitespace-nowrap rounded-full bg-white/85 px-1.5 py-px text-[9px] font-semibold leading-tight text-zinc-700 shadow-sm"
          style={{
            top: hasArt ? "24%" : 0,
            transform: `translateX(-50%) translateY(-100%)${mirror ? " scaleX(-1)" : ""}`,
          }}
        >
          {nickname}
        </span>
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

// 水槽（tankId）ごとに固定された組み合わせになるよう、開くたびに変わらないシード付き
// 乱数で選ぶ（hashHueと同じ考え方）。クワたん本体より先にDOMへ描画することで、本体が
// 手前に重なって見えるようにしている（z-indexは使わず描画順だけで奥行きを表現）。
function pickDecorations(tank: KuwagataShelfTank): { file: string; widthPct: number; spot: { u: number; v: number } }[] {
  const seed = hashHue(tank.tankId);
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

function EnlargedTankVisual({
  tank,
  color,
  nicknameOf,
}: {
  tank: KuwagataShelfTank;
  color: string;
  nicknameOf: (individual: { id: string; nickname: string | null }) => string | null;
}) {
  const isAquarium = tank.speciesAreaCode === "aquarium";
  // 水槽内の「現在、他の個体がどこにいるか」を各WanderingCreatureが共有で読み書き
  // するためのref(Reactのstateにはしない=位置が変わってもこの水槽全体が再レンダー
  // されない)。モーダルを閉じるとEnlargedTankVisual自体がアンマウントされるので、
  // 次に開いたときは自動的に空の状態から始まる。
  const positionsRef = useRef<Record<string, { u: number; v: number; widthPct: number }>>({});
  // デコレーションは水槽(tankId)ごとに決定的なので、個体の衝突回避にも
  // そのまま使い回す(描画用の配置情報と衝突回避用の座標リストを二重管理しない)。
  // widthPctも一緒に持たせ、衝突判定側でアイテムごとの実際の大きさを加味できるようにする。
  const decorations = useMemo(() => (isAquarium ? [] : pickDecorations(tank)), [tank, isAquarium]);
  const decorationSpots = useMemo(
    () => decorations.map((d) => ({ u: d.spot.u, v: d.spot.v, widthPct: d.widthPct })),
    [decorations],
  );
  // 卵・蛹(動かない個体)の置き場所。置物や、先に置いた他の動かない個体を避けて1回だけ決める。
  const stationarySpots = useMemo(() => {
    const spots: Record<string, { u: number; v: number }> = {};
    const taken: { u: number; v: number; widthPct: number }[] = [];
    for (const individual of tank.individuals) {
      if (!isStationaryStage(individual.speciesCode, individual.growthStage)) continue;
      const widthPct = creatureWidthPct(individual.sizeScale);
      const spot = pickStationarySpot(individual.id, widthPct, decorationSpots, taken);
      spots[individual.id] = spot;
      taken.push({ ...spot, widthPct });
    }
    return spots;
  }, [tank, decorationSpots]);

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
        const initialSpot = stationarySpots[individual.id] ?? CREATURE_SPOTS[index % CREATURE_SPOTS.length];
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
            growthStage={individual.growthStage}
            nickname={nicknameOf(individual) ?? individual.speciesName}
            color={color}
            mirror={!hasArt && index % 2 === 1}
            decorationSpots={decorationSpots}
            positionsRef={positionsRef}
            hasCompanions={tank.individuals.length > 1}
          />
        );
      })}
    </div>
  );
}

export function KuwagataShelf({
  tanks,
  knownTanks,
}: {
  tanks: KuwagataShelfTank[];
  knownTanks: KuwagataShelfTank[];
}) {
  const [selectedTankId, setSelectedTankId] = useState<string | null>(null);
  // 名前の編集。保存に成功した分はサーバー(props)の再取得を待たず、ここで上書きして即反映する。
  const [nicknameOverrides, setNicknameOverrides] = useState<Record<string, string | null>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNickname, setDraftNickname] = useState("");
  const [savingNickname, setSavingNickname] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const nicknameOf = (individual: { id: string; nickname: string | null }): string | null =>
    individual.id in nicknameOverrides ? nicknameOverrides[individual.id] : individual.nickname;

  const startEditingNickname = (individual: { id: string; nickname: string | null }) => {
    setEditingId(individual.id);
    setDraftNickname(nicknameOf(individual) ?? "");
    setNicknameError(null);
  };

  const saveNickname = async (individualId: string) => {
    setSavingNickname(true);
    setNicknameError(null);
    try {
      const res = await fetch("/api/roadmap/kuwagata/nickname", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ individualId, nickname: draftNickname.trim() || null }),
      });
      const json = (await res.json()) as { ok?: boolean; nickname?: string | null; error?: string };
      if (!res.ok || !json.ok) {
        setNicknameError(json.error ?? "保存に失敗しました");
        return;
      }
      setNicknameOverrides((prev) => ({ ...prev, [individualId]: json.nickname ?? null }));
      setEditingId(null);
    } catch {
      setNicknameError("保存に失敗しました");
    } finally {
      setSavingNickname(false);
    }
  };

  const lookupTanks = [...knownTanks, ...tanks];
  const selectedTank = lookupTanks.find((t) => t.tankId === selectedTankId) ?? null;
  const knownGroups = groupBySpecies(knownTanks);
  const newGroups = groupBySpecies(tanks);
  // 選択中の水槽と同じ種類の水槽(ページャ用)と、その中での位置
  const siblingTanks = selectedTank ? lookupTanks.filter((t) => t.speciesId === selectedTank.speciesId) : [];
  const siblingIndex = selectedTank ? siblingTanks.findIndex((t) => t.tankId === selectedTank.tankId) : 0;

  if (tanks.length === 0 && knownTanks.length === 0) {
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
      {knownTanks.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {knownGroups.map((group) => {
            const tank = group[0];
            const representative = pickRepresentative(group);
            const count = group.reduce((sum, t) => sum + t.individuals.length, 0);
            return (
              <button
                key={tank.speciesId}
                type="button"
                onClick={() => setSelectedTankId(tank.tankId)}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-amber-300 bg-gradient-to-b from-amber-50 to-white px-2 py-4 shadow-sm transition-transform hover:scale-[1.03] hover:shadow-md active:scale-95"
              >
                <TankOccupant
                  color={KNOWN_SPECIES_COLOR}
                  sizeScale={representative.sizeScale}
                  speciesCode={representative.speciesCode}
                  mandibleVariant={representative.mandibleVariant}
                  growthStage={representative.growthStage}
                />
                <span className="text-xs font-semibold text-amber-800">{tank.speciesName}</span>
                <span className="text-[10px] text-amber-600">
                  {count > 1 ? `${count}匹` : GROWTH_STAGE_LABEL[representative.growthStage]}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {newGroups.map((group) => {
          const tank = group[0];
          const color = tankColor(tank);
          const representative = pickRepresentative(group);
          const count = group.reduce((sum, t) => sum + t.individuals.length, 0);

          return (
            <button
              key={tank.speciesId}
              type="button"
              onClick={() => setSelectedTankId(tank.tankId)}
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
                growthStage={representative.growthStage}
              />
              <span className="text-xs font-semibold text-zinc-700">{tank.speciesName}</span>
              <span className="text-[10px] text-zinc-400">
                {count > 1 ? `${count}匹` : GROWTH_STAGE_LABEL[representative.growthStage]}
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

            {siblingTanks.length > 1 && (
              <div className="mb-2 flex items-center justify-center gap-3">
                <button
                  type="button"
                  disabled={siblingIndex === 0}
                  onClick={() => setSelectedTankId(siblingTanks[siblingIndex - 1].tankId)}
                  className="rounded-full p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent"
                  aria-label="前の水槽"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs font-semibold tabular-nums text-zinc-600">
                  {siblingIndex + 1} / {siblingTanks.length}
                </span>
                <button
                  type="button"
                  disabled={siblingIndex === siblingTanks.length - 1}
                  onClick={() => setSelectedTankId(siblingTanks[siblingIndex + 1].tankId)}
                  className="rounded-full p-1 text-zinc-500 hover:bg-zinc-100 disabled:opacity-30 disabled:hover:bg-transparent"
                  aria-label="次の水槽"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}

            <EnlargedTankVisual key={selectedTank.tankId} tank={selectedTank} color={tankColor(selectedTank)} nicknameOf={nicknameOf} />

            <ul className="flex flex-col gap-2">
              {selectedTank.individuals.map((individual) => (
                <li
                  key={individual.id}
                  className="flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2"
                >
                  <TankOccupant
                    color={tankColor(selectedTank)}
                    sizeScale={individual.sizeScale}
                    speciesCode={individual.speciesCode}
                    mandibleVariant={individual.mandibleVariant}
                    growthStage={individual.growthStage}
                  />
                  <div className="flex min-w-0 flex-1 flex-col text-xs text-zinc-600">
                    {editingId === individual.id ? (
                      <form
                        className="flex items-center gap-1"
                        onSubmit={(e) => {
                          e.preventDefault();
                          void saveNickname(individual.id);
                        }}
                      >
                        <input
                          autoFocus
                          value={draftNickname}
                          maxLength={NICKNAME_MAX_LENGTH}
                          onChange={(e) => setDraftNickname(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          placeholder={individual.speciesName}
                          className="min-w-0 flex-1 rounded border border-zinc-300 bg-white px-1.5 py-0.5 text-xs text-zinc-800 outline-none focus:border-amber-400"
                        />
                        <button
                          type="submit"
                          disabled={savingNickname}
                          className="rounded-full p-1 text-amber-700 hover:bg-amber-100 disabled:opacity-40"
                          aria-label="保存"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </form>
                    ) : (
                      <span className="flex items-center gap-1 font-semibold text-zinc-800">
                        {nicknameOf(individual) ?? individual.speciesName}・
                        {GROWTH_STAGE_LABEL[individual.growthStage]}
                        <button
                          type="button"
                          onClick={() => startEditingNickname(individual)}
                          className="rounded-full p-1 text-zinc-400 hover:bg-zinc-200 hover:text-zinc-600"
                          aria-label="名前を変更"
                        >
                          <Pencil className="h-3 w-3" />
                        </button>
                      </span>
                    )}
                    <span className="text-zinc-400">{formatDate(individual.obtainedAt)}</span>
                    {editingId === individual.id && nicknameError && <span className="text-red-500">{nicknameError}</span>}
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
