"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  Backpack,
  Bug,
  Check,
  ChevronLeft,
  ChevronRight,
  Crown,
  Lock,
  Paintbrush,
  Pencil,
  X,
} from "lucide-react";
import type {
  KuwagataGrowthStage,
  KuwagataShelfTank,
} from "@/lib/supabase/kuwagata";
import {
  ITEM_TYPE_SHIZUKU,
  shizukuSwatchColor,
  tintFilter,
  individualFilter,
  ITEM_TYPE_RIM,
  rimFilter,
  isRimKey,
  type RimKey,
  type KuwagataItem,
} from "@/lib/kuwagata-tint";
import { useSoundMuted } from "@/components/roadmap/roadmap-sound";
import { pickMurmur, type Murmur } from "@/lib/kuwagata-murmur";
import { DECOS, DECO_BY_KEY, ITEM_TYPE_DECO, MAX_DECOS_PER_TANK, baseDecoKey, isBaseDecoKey } from "@/lib/kuwagata-decos";
import { ACTIONS, NO_ACTION_FLAGS, availableActions, type ActionFlags, type ActionId } from "@/lib/kuwagata-actions";
import {
  DEFAULT_BODY_SHAPE,
  bodyCircle,
  bodyCircles,
  FOOT_RADIUS_FACTOR,
  FOOT_RISE_FACTOR,
  circlesSlack,
  distPct,
  slackToStatic,
  type Obstacle,
  ellipseShape,
  progress,
  scanPath,
  type BodyShape,
  type Ease,
  type WorldEntry,
} from "@/lib/tank-collision";

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
// 正面(front)は「奥脚(1本)→本体→手前脚3本→大顎」、背面(back)は「本体→脚3本(R3→R2→R1)→大顎」
// という向きごとに違う重なり方になるため、2つの配列に分けて向きごとに自由に組めるように
// している(体より奥に描く脚=legsBehindBody、体より手前に描く脚=legsInFrontOfBody)。
const KUWAGATA_ART_DIR = "/roadmap/kuwagata";

// kind: "wing"なら脚ではなく羽根として羽ばたかせる(originは羽根の付け根=回転・つぶれの軸、例: "52% 50%")。
// baseRotateDeg: 羽根の基準姿勢の回転(付け根を軸、時計回りが正)。斜めに描かれた羽根を水平寄りに直すのに使う。
// 擬態ポーズ(ナナたん)用: 2関節の脚。seg1=体側の脚(肩を軸にa1度回す)、seg2=その先の脚(肩のa1回転に加え、ひじを軸にa2度回す)。
// origin=肩、ex/ey=肩→ひじの差(キャンバスに対する%)。
type MimicPose = { seg: 1 | 2; origin: string; a1: number; a2?: number; ex?: number; ey?: number };
type CreaturePartArt = {
  pose?: MimicPose;
  // 獲物を捕まえる(grab)動き用の3関節チェーン。各パーツは肩(origin)を軸に、
  // rotate(a1) translate(p1) rotate(a2) translate(p2) rotate(a3) translate(p3) の順で変形する(角度は度、pはキャンバスに対する%)。
  grab?: { a: [number, number, number]; p1: [number, number]; p2: [number, number]; p3: [number, number] }; src: string; delay: string; kind?: "wing" | "scythe" | "claw" | "arm" | "segment" | "wave" | "tail" | "tail-ghost" | "grab" | "paddle" | "hind-thigh" | "hind-shin"; hind?: { knee: [number, number]; dir: 1 | -1 }; origin?: string; baseRotateDeg?: number; shiftYPct?: number; squashAt?: { x: number; y: number }; clawDir?: 1 | -1; ghostOpacity?: number; paddleDir?: 1 | -1; flapDir?: 1 | -1 };

type KnownCreatureArt = {
  body: string;
  // 背面からは構造上ほぼ見えないはずのパーツだが、素材があれば使う(無ければ省略可)。
  // 個体ごとのmandible_variant(DBのsmallint列、1始まり)をキーにした差分バリエーション。
  mandibles: Partial<Record<number, string>>;
  // 大顎(ツノ)の付け根。動かすときの回転の軸(CSSのtransform-origin、例: "29% 43%")。
  // 省略時は中央。カブたんのツノのように、付け根を軸に首振りさせたい種だけ指定する。
  mandibleOrigin?: string;
  // trueなら大顎(ツノ)を本体より奥(最背面)に描く。後ろ向きのカブたんのように、ツノが体の向こう側に
  // 隠れて見えるべき向き用。省略時は従来どおり一番手前。
  mandibleBehindBody?: boolean;
  // trueなら体全体がふわふわ上下に漂う(飛ぶ種。歩く種のbobの代わり)
  flying?: boolean;
  // 飛んでいる間だけ体(body)の代わりに出す1枚絵(羽根を広げた姿。脚は歩行用パーツをそのまま重ねる)。
  airborneBody?: string;
  // 水の中を泳ぐ種(動きの種類F)。後ろ足(kind:"paddle")が付け根を軸に水を掻く。
  swimming?: boolean;
  // お腹(体の一部)がぼんやり光る種(ホタたん)。中心位置と直径は絵のキャンバスに対する%。
  glow?: { left: number; top: number; size: number };
  // trueなら体の形の中だけを光の帯が走る演出(ルリたん)に対応する種。
  shine?: boolean;
  // 裏返しの姿(コメたん)。ぶつかって裏返っている間は、体・脚のパーツの代わりにこの1枚を出す。
  flippedSrc?: string;
  // 2本の大顎(ヘルたん)。それぞれ付け根(origin)を軸に、ガチガチの間は「上回転」(dir=+1は時計回り、-1は反時計回り=先端が上へ上がる向き)で
  // 開閉しながら大きくなり、大顎の形でくり抜いた光がキラッと走る。behindBodyなら体の奥に描く(背面の左大顎)。
  jaws?: { src: string; origin: string; dir: 1 | -1 | 0; behindBody?: boolean }[];
  // 求愛ダンスの姿(クジャクたん)。正面向き専用。body1=ダンス中の体(脚つき)、body2=持ち上げた模様のお腹(付け根fanOriginを軸に左右に振る)、
  // legL・legR=縦長に描いた振り上げる脚(下の付け根を軸に、水平から少し斜め上を基準にして振る)。
  courtship?: {
    body1: string;
    body2: string;
    fanOrigin: string;
    legL: { src: string; origin: string; baseDeg: number };
    legR: { src: string; origin: string; baseDeg: number };
  };
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
      // 背面は3本とも本体の手前(前)に重なる。配列の並び順=DOM描画順(先に描いたものほど
      // 奥)なので、一番手前に見せたいR1を配列の最後に置く(R3→R2→R1の順で描画される)。
      // 体の奥に回すと、体の中に重なる絵(バッたんなど)で脚が隠れてしまうため、全種を手前にそろえている。
      legsBehindBody: [],
      legsInFrontOfBody: [
        { src: file("back_leg_R3"), delay: "-0.3s" },
        { src: file("back_leg_R2"), delay: "-0.15s" },
        { src: file("back_leg_R1"), delay: "0s" },
      ],
    },
  };
}

// 新種(動きの種類A=歩く6脚)の成虫アート。既知種と同じ脚の構成だが、大顎が無い(mandibles空)・
// 卵/幼虫/蛹も無い(成虫のみ)。ファイルは kuwagata_{code}_{front|back}_*.svg の9枚。
// horn: ツノ(大顎パーツ_mandible_01の1枚)がある種は、付け根の位置(正面/背面)を渡す。
function buildNewSpeciesWalkerArt(
  code: string,
  horn?: { frontOrigin: string; backOrigin: string; backBehindBody?: boolean }
): Partial<Record<Facing, KnownCreatureArt>> {
  const base = buildKnownCreatureArt(code);
  const withHorn = (art: KnownCreatureArt | undefined, origin: string | undefined, behindBody: boolean) =>
    art && {
      ...art,
      mandibles: horn && art.mandibles[1] ? { 1: art.mandibles[1] } : {},
      mandibleOrigin: horn ? origin : undefined,
      mandibleBehindBody: horn ? behindBody : undefined,
    };
  return {
    front: withHorn(base.front, horn?.frontOrigin, false),
    back: withHorn(base.back, horn?.backOrigin, horn?.backBehindBody ?? false),
  };
}

// ハンたん(ハンミョウ): 歩行用のパーツに加えて、飛ぶ間だけ使う羽根を広げた体の1枚絵(front/back_body_flying)を持たせる。
function buildTigerBeetleArt(code: string, horn: { frontOrigin: string; backOrigin: string }): Partial<Record<Facing, KnownCreatureArt>> {
  const art = buildNewSpeciesWalkerArt(code, horn);
  const flying = (facing: Facing) => `${KUWAGATA_ART_DIR}/kuwagata_${code}_${facing}_body_flying.svg`;
  return {
    front: art.front && { ...art.front, airborneBody: flying("front") },
    back: art.back && { ...art.back, airborneBody: flying("back") },
  };
}

// カミたん(カミキリムシ): 大顎(mandible_01の1枚)がある6脚の歩行種。手前脚は正面L1・L3の2本のみ(L2なし)。
// 大顎は付け根を軸に、ときどきガチガチ噛み合わせる(CHOMP_*)。
function buildLongicornArt(code: string, origin: { front: string; back: string }): Partial<Record<Facing, KnownCreatureArt>> {
  const art = buildNewSpeciesWalkerArt(code, { frontOrigin: origin.front, backOrigin: origin.back });
  return {
    front: art.front && {
      ...art.front,
      legsInFrontOfBody: art.front.legsInFrontOfBody.filter((leg) => !leg.src.endsWith("_front_leg_L2.svg")),
    },
    back: art.back,
  };
}

// ゲンたん(ゲンゴロウ): 水の中を泳ぐ種(動きの種類F)。後ろ足は大きなオール状で、付け根(origin)を軸に水を掻く。
// 平泳ぎのように左右対称に動かす: 2本の後ろ足は、同時に「開く→ぐっと閉じる(掻く)」を逆向きの回転で行う
// (paddleDir=+1/-1。+1は時計回りに閉じ、-1は反時計回りに閉じる。向き合う2本の足先が近づく側が「閉じる」)。
// 描画順(奥→手前): 正面はRが奥・Lが手前。背面は脚がすべて体の奥。
// 付け根の位置は、脚パーツ画像の体側の端点から計算した値(キャンバスに対する%)。
// 小さな脚は正面L1・L2、背面R2・R3(泳いでいる間だけ小さく動く)。
function buildSwimmerArt(code: string): Partial<Record<Facing, KnownCreatureArt>> {
  const file = (part: string) => `${KUWAGATA_ART_DIR}/kuwagata_${code}_${part}.svg`;
  return {
    front: {
      body: file("front_body"),
      mandibles: {},
      swimming: true,
      legsBehindBody: [
        { src: file("front_leg_R1"), delay: "-0.1s" },
        { src: file("front_leg_R2"), delay: "0s", kind: "paddle", origin: "37.4% 60.3%", paddleDir: 1 },
      ],
      legsInFrontOfBody: [
        { src: file("front_leg_L3"), delay: "0s", kind: "paddle", origin: "73% 68.9%", paddleDir: -1 },
        { src: file("front_leg_L2"), delay: "-0.2s" },
        { src: file("front_leg_L1"), delay: "0s" },
      ],
    },
    back: {
      body: file("back_body"),
      mandibles: {},
      swimming: true,
      // 背面は、後ろ足も小さな脚もすべて体の奥(体より先に描く)
      legsBehindBody: [
        { src: file("back_leg_L1"), delay: "0s", kind: "paddle", origin: "31.5% 53.3%", paddleDir: -1 },
        { src: file("back_leg_R3"), delay: "-0.2s" },
        { src: file("back_leg_R2"), delay: "-0.1s" },
        { src: file("back_leg_R1"), delay: "0s", kind: "paddle", origin: "57.5% 62.8%", paddleDir: 1 },
      ],
      legsInFrontOfBody: [],
    },
  };
}

// ウマたん(カマドウマ): ジャンプする6脚の歩行種。一番うしろの脚(正面L3・R2、背面L1・R3)は2パーツ(-1と-2)に分かれ、
// ふだんは歩くときに付け根を軸に前後に小さく揺れ(kuwagata-hind-walk-*)、ジャンプ(HOP_*)のときは2関節の脚として大きく動く。
//   -1(thigh)=もも: 下端が体との接続(付け根=hip)、上端がひざ。
//   -2(shin)=すね: 上端が-1の上端(ひざ)との接続、下端が足先。
// thighは付け根を軸に回し、shinは「付け根を軸にthighと同じだけ回す→ひざを軸にさらに回す」(CSSのkuwagata-hind-*)。
// hip=付け根(origin)、knee=付け根→ひざの差(キャンバスに対する%)、dir=外側へ開く向き(+1=時計回りで外側/下へ、-1=反時計回り)。
// 値はパーツ画像の端点から計算(正面は右へ、背面は左へ傾いて描かれている)。
function buildJumperArt(code: string): Partial<Record<Facing, KnownCreatureArt>> {
  const file = (part: string) => `${KUWAGATA_ART_DIR}/kuwagata_${code}_${part}.svg`;
  const hindLeg = (name: string, hip: string, knee: [number, number], dir: 1 | -1, delay: string): CreaturePartArt[] => [
    { src: file(`${name}-1`), delay, kind: "hind-thigh", origin: hip, hind: { knee, dir } },
    { src: file(`${name}-2`), delay, kind: "hind-shin", origin: hip, hind: { knee, dir } },
  ];
  return {
    front: {
      body: file("front_body"),
      mandibles: {},
      // 奥側(R)は体の奥、手前側(L)は体の手前。一番手前に重ねたいL1を配列の末尾に置く。
      legsBehindBody: [{ src: file("front_leg_R1"), delay: "-0.55s" }, ...hindLeg("front_leg_R2", "48.21% 77.23%", [6.52, -35.71], 1, "-0.55s")],
      legsInFrontOfBody: [
        ...hindLeg("front_leg_L3", "69.55% 79.91%", [9.02, -37.05], 1, "0s"),
        { src: file("front_leg_L2"), delay: "-0.15s" },
        { src: file("front_leg_L1"), delay: "0s" },
      ],
    },
    back: {
      body: file("back_body"),
      mandibles: {},
      // 背面は、左のうしろ脚(L1)だけ体の奥。ほかは体の手前。
      legsBehindBody: hindLeg("back_leg_L1", "28.57% 82.59%", [-8.48, -37.95], -1, "-0.55s"),
      legsInFrontOfBody: [
        ...hindLeg("back_leg_R3", "43.75% 83.48%", [-8.13, -37.77], -1, "0s"),
        { src: file("back_leg_R2"), delay: "-0.15s" },
        { src: file("back_leg_R1"), delay: "0s" },
      ],
    },
  };
}

// 新種(動きの種類D=擬態・待機)の成虫アート。カマキリ。ファイルは
//   正面: front_body / front_scythe_L・front_scythe_R(左右のカマ) / front_leg_R1・R2(奥脚) / front_leg_L1・L2(手前脚)
//   背面: back_body / back_scythe_L・back_scythe_R / back_leg_L1・L2(奥脚) / back_leg_R1・R2(手前脚)
// の計12枚。左右のカマはそれぞれの付け根(origin)を軸に、ときどき時間をずらして交互にブンッと振る。体はゆらゆら揺れ、ゆっくりしか動かない。
function buildMantisArt(
  code: string,
  origin: { front: { L: string; R: string }; back: { L: string; R: string } }
): Partial<Record<Facing, KnownCreatureArt>> {
  const file = (part: string) => `${KUWAGATA_ART_DIR}/kuwagata_${code}_${part}.svg`;
  return {
    front: {
      body: file("front_body"),
      mandibles: {},
      legsBehindBody: [
        { src: file("front_leg_R2"), delay: "-0.45s" },
        { src: file("front_leg_R1"), delay: "-0.15s" },
      ],
      legsInFrontOfBody: [
        { src: file("front_leg_L2"), delay: "-0.3s" },
        { src: file("front_leg_L1"), delay: "0s" },
        { src: file("front_scythe_L"), delay: "0s", kind: "scythe", origin: origin.front.L },
        { src: file("front_scythe_R"), delay: "0.3s", kind: "scythe", origin: origin.front.R },
      ],
    },
    back: {
      body: file("back_body"),
      mandibles: {},
      legsBehindBody: [
        { src: file("back_leg_L2"), delay: "-0.45s" },
        { src: file("back_leg_L1"), delay: "-0.15s" },
        // 背面のカマは体の奥(後ろ)に描く
        { src: file("back_scythe_L"), delay: "0s", kind: "scythe", origin: origin.back.L },
        { src: file("back_scythe_R"), delay: "0.3s", kind: "scythe", origin: origin.back.R },
      ],
      legsInFrontOfBody: [
        { src: file("back_leg_R2"), delay: "-0.3s" },
        { src: file("back_leg_R1"), delay: "0s" },
      ],
    },
  };
}

// ハナたん(ハナカマキリ): カマは左右それぞれ3パーツ(L1〜L3/R1〜R3)で、普段は折りたたんだまま(Z字)。
// 関節: L1の上端=体との接続(肩)、L1の下端=L2の下端との接続(ひじ1)、L2の上端=L3の上端との接続(ひじ2)。
// grab: L1は肩を軸に、L2はひじ1を軸に(L1の回転に連動)、L3はひじ2を軸に(L1・L2の回転に連動)回して腕を開く。
// 肩・関節の位置と回転角は、パーツ画像の主軸の端点から計算した値(折りたたみ時の向きと、開いたときの目標の向きの差)。
const ORCHID_GRAB = {
  front_L: { origin: "49.11% 45.3%", a: [-7.4, 42.2, -66.8], p1: [1.43, 31.34], p2: [9.05, -33.26], p3: [-10.48, 1.92] },
  front_R: { origin: "35.31% 46.86%", a: [7.7, -38.8, 63.4], p1: [-1.24, 31.17], p2: [-11.36, -33.12], p3: [12.6, 1.95] },
  back_L: { origin: "52.18% 41.78%", a: [7.9, -39.0, 63.4], p1: [-1.12, 31.34], p2: [-11.39, -33.14], p3: [12.51, 1.79] },
  back_R: { origin: "62.48% 43.13%", a: [-7.5, 42.2, -66.7], p1: [1.37, 31.43], p2: [9.08, -33.26], p3: [-10.45, 1.83] },
} as const;

function buildOrchidMantisArt(code: string): Partial<Record<Facing, KnownCreatureArt>> {
  const file = (part: string) => `${KUWAGATA_ART_DIR}/kuwagata_${code}_${part}.svg`;
  const scythes = (facing: "front" | "back"): CreaturePartArt[] =>
    (["L", "R"] as const).flatMap((side) => {
      const j = ORCHID_GRAB[`${facing}_${side}` as const];
      const zero: [number, number] = [0, 0];
      const neg = (p: readonly number[]): [number, number] => [-p[0], -p[1]];
      const p1 = j.p1 as unknown as [number, number];
      const p2 = j.p2 as unknown as [number, number];
      const p3 = j.p3 as unknown as [number, number];
      const a = j.a as unknown as [number, number, number];
      return [
        { src: file(`${facing}_scythe_${side}1`), delay: "0s", kind: "grab" as const, origin: j.origin, grab: { a: [a[0], 0, 0] as [number, number, number], p1: zero, p2: zero, p3: zero } },
        { src: file(`${facing}_scythe_${side}2`), delay: "0s", kind: "grab" as const, origin: j.origin, grab: { a: [a[0], a[1], 0] as [number, number, number], p1, p2: neg(p1), p3: zero } },
        { src: file(`${facing}_scythe_${side}3`), delay: "0s", kind: "grab" as const, origin: j.origin, grab: { a, p1, p2, p3 } },
      ];
    });
  return {
    front: {
      body: file("front_body"),
      mandibles: {},
      legsBehindBody: [{ src: file("front_leg_R1"), delay: "-0.3s" }],
      legsInFrontOfBody: [{ src: file("front_leg_L2"), delay: "-0.15s" }, { src: file("front_leg_L1"), delay: "0s" }, ...scythes("front")],
    },
    back: {
      body: file("back_body"),
      mandibles: {},
      // 背面のカマは体の後ろ(背面側)に描く
      legsBehindBody: [...scythes("back"), { src: file("back_leg_L1"), delay: "-0.3s" }],
      legsInFrontOfBody: [{ src: file("back_leg_R2"), delay: "-0.15s" }, { src: file("back_leg_R1"), delay: "0s" }],
    },
  };
}

// ホタたん(ホタル): 標準の歩く6脚(A)のアートに、お腹がぼんやり光る演出(glow)を足す。
function buildFireflyArt(
  code: string,
  glow: { front: { left: number; top: number; size: number }; back: { left: number; top: number; size: number } }
): Partial<Record<Facing, KnownCreatureArt>> {
  const art = buildNewSpeciesWalkerArt(code);
  return {
    front: art.front && { ...art.front, glow: glow.front },
    back: art.back && { ...art.back, glow: glow.back },
  };
}

// 脚がすべて体の下(奥)に隠れる構造の種(カメムシ)。標準の9枚はそのまま、正面・背面とも脚をすべて体の後ろに描く。
function buildWalkerLegsBehindBodyArt(code: string): Partial<Record<Facing, KnownCreatureArt>> {
  const art = buildNewSpeciesWalkerArt(code);
  const toBehind = (a: KnownCreatureArt | undefined) =>
    a && { ...a, legsBehindBody: [...a.legsBehindBody, ...a.legsInFrontOfBody], legsInFrontOfBody: [] };
  return { front: toBehind(art.front), back: toBehind(art.back) };
}

// 背面でL1(左脚)が見えてしまう種のA(歩く6脚)。標準の9枚に加えて back_leg_L1 を体の奥(後ろ)に描いて動かす(計10枚)。
function buildWalkerWithBackLeftLegArt(
  code: string,
  horn?: { frontOrigin: string; backOrigin: string; backBehindBody?: boolean }
): Partial<Record<Facing, KnownCreatureArt>> {
  const art = buildNewSpeciesWalkerArt(code, horn);
  return {
    front: art.front,
    back: art.back && {
      ...art.back,
      legsBehindBody: [{ src: `${KUWAGATA_ART_DIR}/kuwagata_${code}_back_leg_L1.svg`, delay: "-0.7s" }],
    },
  };
}

// カメムシ系で背面L1もある種(ニシキたん): 脚は正面・背面ともすべて体の後ろ。背面は back_leg_L1 を最奥に。
function buildNigikiBugArt(code: string): Partial<Record<Facing, KnownCreatureArt>> {
  const behind = buildWalkerLegsBehindBodyArt(code);
  const withL1 = buildWalkerWithBackLeftLegArt(code);
  const l1 = withL1.back?.legsBehindBody ?? [];
  return {
    front: behind.front,
    back: behind.back && { ...behind.back, legsBehindBody: [...l1, ...behind.back.legsBehindBody] },
  };
}

// ルリたん: 大顎がある6脚の歩行種に、体に光が走る演出(shine)を足す。
function buildShineBeetleArt(code: string, origin: { front: string; back: string }): Partial<Record<Facing, KnownCreatureArt>> {
  const art = buildNewSpeciesWalkerArt(code, { frontOrigin: origin.front, backOrigin: origin.back });
  return {
    front: art.front && { ...art.front, shine: true },
    back: art.back && { ...art.back, shine: true },
  };
}

// キメたん(キメラ): 8脚歩行(正面 L1〜L4+R1、背面 R1〜R4)に、サソたんと同じ尻尾のシュシュッ(mandible_01=尻尾。付け根を軸に打ち下ろす)を足す。
// 尻尾は正面・背面とも体の手前。残像用の半透明コピーを時間差で重ねる。
function buildChimeraArt(
  code: string,
  origin: { front: string; back: string }
): Partial<Record<Facing, KnownCreatureArt>> {
  const base = buildEightLegWalkerArt(code);
  const tail = (facing: "front" | "back", o: string, dir: 1 | -1): CreaturePartArt[] => {
    const src = `${KUWAGATA_ART_DIR}/kuwagata_${code}_${facing}_mandible_01.svg`;
    return [
      { src, delay: "0.09s", kind: "tail-ghost", origin: o, clawDir: dir, ghostOpacity: 0.22 },
      { src, delay: "0.045s", kind: "tail-ghost", origin: o, clawDir: dir, ghostOpacity: 0.4 },
      { src, delay: "0s", kind: "tail", origin: o, clawDir: dir },
    ];
  };
  return {
    front: base.front && { ...base.front, legsInFrontOfBody: [...tail("front", origin.front, -1), ...base.front.legsInFrontOfBody] },
    back: base.back && { ...base.back, legsInFrontOfBody: [...tail("back", origin.back, 1), ...base.back.legsInFrontOfBody] },
  };
}

// トゲたん(ヤスデ): 体節 body1〜6 を1枚ずつ、それぞれの中心を軸に左右へ少し振ってウネウネさせる(時間差つき)。
// 正面は head+body1〜6、背面は head+body2〜6+body1(ファイル名は back_leg_R2)。前(頭に近い)ほど手前。大顎(mandible)は左右ペアの1枚で、ガチガチ時は大きくなって光が走る(回転なし)。
function buildMilliArt(code: string): Partial<Record<Facing, KnownCreatureArt>> {
  const file = (part: string) => `${KUWAGATA_ART_DIR}/kuwagata_${code}_${part}.svg`;
  const centers = {
    front: { 1: "38% 59%", 2: "47% 52%", 3: "55% 46%", 4: "63% 40%", 5: "72% 37%", 6: "80% 31%" },
    back: { 2: "30% 60%", 3: "38% 54%", 4: "47% 48%", 5: "55% 43%", 6: "63% 37%" },
  } as const;
  const segments = (facing: "front" | "back"): CreaturePartArt[] =>
    (Object.entries(centers[facing]) as [string, string][])
      .sort((a, b) => Number(b[0]) - Number(a[0]))
      .map(([n, origin]) => ({ src: file(`${facing}_body${n}`), delay: `-${((6 - Number(n)) * 0.3).toFixed(2)}s`, kind: "segment" as const, origin }));
  return {
    front: {
      body: file("front_head"),
      mandibles: {},
      legsBehindBody: segments("front"),
      legsInFrontOfBody: [],
      jaws: [{ src: file("front_mandible"), origin: "27% 83%", dir: 0 }],
    },
    back: {
      body: file("back_head"),
      mandibles: {},
      legsBehindBody: [],
      // 背面は頭が最背面、体節は番号が小さいほど手前。body1にあたる体節のファイル名が back_leg_R2 のため、それを最前面の体節として振る。
      legsInFrontOfBody: [...segments("back"), { src: file("back_leg_R2"), delay: "-1.5s", kind: "segment" as const, origin: "19% 68%" }],
      jaws: [{ src: file("back_mandible"), origin: "84% 44%", dir: 0, behindBody: true }],
    },
  };
}

// パレオたん(ハネカクシ系の古代昆虫): 歩きながら、左右3枚ずつの羽根(wing_L1〜3・R1〜3)をゆっくり波打つように羽ばたかせる。
// 羽根は正面・背面とも体の最前面。3枚の位相を120度(周期の1/3)ずつずらす。羽根ごとの付け根(origin)は絵から目測。
// clawDirは羽ばたきの向き(羽根が右へ伸びる側が-1、左へ伸びる側が+1。左右で同時に上下する)。
function buildPaleoWingArt(code: string): Partial<Record<Facing, KnownCreatureArt>> {
  const file = (part: string) => `${KUWAGATA_ART_DIR}/kuwagata_${code}_${part}.svg`;
  const PERIOD = 2.1;
  const wing = (facing: "front" | "back", name: string, i: number, origin: string, dir: 1 | -1): CreaturePartArt => ({
    src: file(`${facing}_wing_${name}`),
    delay: `-${((i * PERIOD) / 3).toFixed(2)}s`,
    kind: "wave",
    origin,
    clawDir: dir,
  });
  return {
    front: {
      body: file("front_body"),
      mandibles: {},
      // 奥から手前へ 3→2→1(すべて体の手前)
      legsInFrontOfBody: [
        wing("front", "L3", 2, "54% 45%", -1),
        wing("front", "R3", 2, "38% 57%", 1),
        wing("front", "L2", 1, "54% 58%", -1),
        wing("front", "R2", 1, "36% 60%", 1),
        wing("front", "L1", 0, "51% 74%", -1),
        wing("front", "R1", 0, "24% 69%", 1),
      ],
      legsBehindBody: [],
    },
    back: {
      body: file("back_body"),
      mandibles: {},
      legsInFrontOfBody: [
        wing("back", "L3", 2, "56% 45%", 1),
        wing("back", "R3", 2, "83% 60%", -1),
        wing("back", "L2", 1, "55% 42%", 1),
        wing("back", "R2", 1, "62% 47%", -1),
        wing("back", "L1", 0, "54% 45%", 1),
        wing("back", "R1", 0, "61% 51%", -1),
      ],
      legsBehindBody: [],
    },
  };
}

// 新種(動きの種類B=歩く8脚)の成虫アート。クモなど。ファイルは
//   正面: front_body / front_leg_L1〜L4(手前脚4本) / front_leg_R1(奥脚1本)
//   背面: back_body / back_leg_R1〜R4(脚4本) / back_leg_L1(左側にちらっと見える脚1本。種によっては無い)
// の計12枚(L1が無い種は11枚)。背面は右脚R1〜R4を体の手前に描き(手前からR1→…→R4)、
// back_leg_L1がある種(backLeftLeg: true)は、その左脚を体の奥に描いて動かす(バランス用)。
function buildEightLegWalkerArt(
  code: string,
  options: { backLeftLeg?: boolean } = {}
): Partial<Record<Facing, KnownCreatureArt>> {
  const file = (part: string) => `${KUWAGATA_ART_DIR}/kuwagata_${code}_${part}.svg`;
  return {
    front: {
      body: file("front_body"),
      mandibles: {},
      legsBehindBody: [{ src: file("front_leg_R1"), delay: "-0.55s" }],
      legsInFrontOfBody: [
        { src: file("front_leg_L4"), delay: "-0.45s" },
        { src: file("front_leg_L3"), delay: "-0.3s" },
        { src: file("front_leg_L2"), delay: "-0.15s" },
        { src: file("front_leg_L1"), delay: "0s" },
      ],
    },
    back: {
      body: file("back_body"),
      mandibles: {},
      // 左脚L1は体の奥(後ろ)に描く。右脚R1〜R4は体の手前。
      legsBehindBody: options.backLeftLeg ? [{ src: file("back_leg_L1"), delay: "-0.7s" }] : [],
      legsInFrontOfBody: [
        { src: file("back_leg_R4"), delay: "-0.45s" },
        { src: file("back_leg_R3"), delay: "-0.3s" },
        { src: file("back_leg_R2"), delay: "-0.15s" },
        { src: file("back_leg_R1"), delay: "0s" },
      ],
    },
  };
}

// ユーたん(ホウネンエビ): 脚は体の後ろ。横の腕(mandible_L/R。左右はファイル名の左右)も体の後ろに置き、付け根を軸にゆらゆら揺らす。
// 脚は正面 L1〜L3・R1、背面 R1〜R3。
function buildFairyShrimpArt(
  code: string,
  origin: { front: { L: string; R: string }; back: { L: string; R: string } }
): Partial<Record<Facing, KnownCreatureArt>> {
  const file = (part: string) => `${KUWAGATA_ART_DIR}/kuwagata_${code}_${part}.svg`;
  const arms = (facing: "front" | "back"): CreaturePartArt[] => [
    { src: file(`${facing}_mandible_L`), delay: "0s", kind: "arm", origin: origin[facing].L, clawDir: 1 },
    { src: file(`${facing}_mandible_R`), delay: "-0.8s", kind: "arm", origin: origin[facing].R, clawDir: -1 },
  ];
  const legs = (facing: "front" | "back", names: string[]): CreaturePartArt[] =>
    names.map((n, i) => ({ src: file(`${facing}_leg_${n}`), delay: `-${(i * 0.3).toFixed(2)}s` }));
  return {
    front: { body: file("front_body"), mandibles: {}, legsBehindBody: [...arms("front"), ...legs("front", ["R1", "L1", "L2", "L3"])], legsInFrontOfBody: [] },
    back: { body: file("back_body"), mandibles: {}, legsBehindBody: [...arms("back"), ...legs("back", ["R3", "R2", "R1"])], legsInFrontOfBody: [] },
  };
}

// サワたん(サワガニ): 脚は正面・背面とも L1〜L4・R1〜R4 の8本をすべて体の後ろに描く。
// ハサミ(mandible_L・mandible_R。左右別ファイル)は、正面は体の手前・背面は体の奥に置き、付け根を軸にときどき交互にガチガチ(CHOMP_*)。
function buildCrabArt(
  code: string,
  origin: { front: { L: string; R: string }; back: { L: string; R: string } }
): Partial<Record<Facing, KnownCreatureArt>> {
  const file = (part: string) => `${KUWAGATA_ART_DIR}/kuwagata_${code}_${part}.svg`;
  const legs = (facing: "front" | "back"): CreaturePartArt[] =>
    ["R4", "R3", "R2", "R1", "L4", "L3", "L2", "L1"].map((n, i) => ({
      src: file(`${facing}_leg_${n}`),
      delay: `-${((i % 4) * 0.15).toFixed(2)}s`,
    }));
  // ハサミは左右別ファイル(mandible_L/R。見た目の左右ではなくファイル名の左右)。付け根を軸に交互にパクパク。
  // 見た目で右側にあるハサミ(L)は時計回り、左側(R)は反時計回りに閉じる。
  const claws = (facing: "front" | "back"): CreaturePartArt[] => [
    { src: file(`${facing}_mandible_L`), delay: "0s", kind: "claw", origin: origin[facing].L, clawDir: 1 },
    { src: file(`${facing}_mandible_R`), delay: "0.12s", kind: "claw", origin: origin[facing].R, clawDir: -1 },
  ];
  return {
    front: {
      body: file("front_body"),
      mandibles: {},
      legsBehindBody: legs("front"),
      legsInFrontOfBody: claws("front"),
    },
    back: {
      body: file("back_body"),
      mandibles: {},
      legsBehindBody: [...claws("back"), ...legs("back")],
      legsInFrontOfBody: [],
    },
  };
}

// ナナたん(ナナフシ): 正面・背面とも6脚がすべて見える(体の後ろに描く)。L1・R1は2関節(-1=体側/-2=先)。
// 擬態ポーズ: L1・R1をまっすぐ頭方向へ突き出す(pose。肩・ひじ・回転角は絵から測った値)。
function buildStickInsectArt(code: string): Partial<Record<Facing, KnownCreatureArt>> {
  const file = (part: string) => `${KUWAGATA_ART_DIR}/kuwagata_${code}_${part}.svg`;
  type Joint = { s: [number, number]; e: [number, number]; a1: number; a2: number };
  const two = (facing: "front" | "back", side: "L" | "R", j: Joint, delay: string): CreaturePartArt[] => {
    const origin = `${((j.s[0] / 448) * 100).toFixed(1)}% ${((j.s[1] / 448) * 100).toFixed(1)}%`;
    const ex = ((j.e[0] - j.s[0]) / 448) * 100;
    const ey = ((j.e[1] - j.s[1]) / 448) * 100;
    return [
      { src: file(`${facing}_leg_${side}1-1`), delay, pose: { seg: 1, origin, a1: j.a1 } },
      { src: file(`${facing}_leg_${side}1-2`), delay, pose: { seg: 2, origin, a1: j.a1, a2: j.a2, ex, ey } },
    ];
  };
  const one = (facing: "front" | "back", n: string, delay: string): CreaturePartArt => ({ src: file(`${facing}_leg_${n}`), delay });
  return {
    front: {
      body: file("front_body"),
      mandibles: {},
      legsBehindBody: [
        one("front", "R3", "-0.3s"),
        one("front", "L3", "0s"),
        one("front", "R2", "0s"),
        one("front", "L2", "-0.3s"),
        ...two("front", "R", { s: [122, 302], e: [23, 306], a1: -43, a2: 87 }, "-0.3s"),
        ...two("front", "L", { s: [145, 335], e: [176, 406], a1: 71, a2: -87 }, "0s"),
      ],
      legsInFrontOfBody: [],
    },
    back: {
      body: file("back_body"),
      mandibles: {},
      legsBehindBody: [
        one("back", "R3", "-0.3s"),
        one("back", "L3", "0s"),
        one("back", "R2", "0s"),
        one("back", "L2", "-0.3s"),
        ...two("back", "R", { s: [302, 140], e: [395, 165], a1: -62, a2: 80 }, "-0.3s"),
        ...two("back", "L", { s: [275, 125], e: [215, 71], a1: 97, a2: -91 }, "0s"),
      ],
      legsInFrontOfBody: [],
    },
  };
}

// ヘラたん: 標準の歩く6脚(A)＋頭と一体のツノ(mandible_01)。体全体のキラッ(shine)に対応。
function buildHerculesArt(code: string, origin: { frontOrigin: string; backOrigin: string; backBehindBody?: boolean }): Partial<Record<Facing, KnownCreatureArt>> {
  const art = buildNewSpeciesWalkerArt(code, origin);
  return {
    front: art.front && { ...art.front, shine: true },
    back: art.back && { ...art.back, shine: true },
  };
}

// サソたん(サソリ): 脚は正面 L1〜L3+R1(奥)、背面 R1〜R3+L1(奥)。ハサミ(claw)は正面が左右、背面は右(R)のみ。
// 尻尾(tale)は体の奥から、ときどきシュシュッと素早く打ち下ろす。残像用にぼかした半透明のコピーを時間差で重ねる。
function buildScorpionArt(
  code: string,
  origin: { frontClaw: { L: string; R: string }; backClawR: string; frontTale: string; backTale: string }
): Partial<Record<Facing, KnownCreatureArt>> {
  const file = (part: string) => `${KUWAGATA_ART_DIR}/kuwagata_${code}_${part}.svg`;
  const tail = (facing: "front" | "back", o: string, dir: 1 | -1): CreaturePartArt[] => [
    { src: file(`${facing}_tale`), delay: "0.09s", kind: "tail-ghost", origin: o, clawDir: dir, ghostOpacity: 0.22 },
    { src: file(`${facing}_tale`), delay: "0.045s", kind: "tail-ghost", origin: o, clawDir: dir, ghostOpacity: 0.4 },
    { src: file(`${facing}_tale`), delay: "0s", kind: "tail", origin: o, clawDir: dir },
  ];
  return {
    front: {
      body: file("front_body"),
      mandibles: {},
      legsBehindBody: [{ src: file("front_leg_R1"), delay: "-0.55s" }],
      // 正面の尻尾は体の手前
      legsInFrontOfBody: [
        ...tail("front", origin.frontTale, -1),
        { src: file("front_leg_L3"), delay: "-0.3s" },
        { src: file("front_leg_L2"), delay: "-0.15s" },
        { src: file("front_leg_L1"), delay: "0s" },
        { src: file("front_claw_L"), delay: "0s", kind: "claw", origin: origin.frontClaw.L, clawDir: 1 },
        { src: file("front_claw_R"), delay: "0.12s", kind: "claw", origin: origin.frontClaw.R, clawDir: -1 },
      ],
    },
    back: {
      body: file("back_body"),
      mandibles: {},
      legsBehindBody: [
        ...tail("back", origin.backTale, 1),
        { src: file("back_leg_L1"), delay: "-0.7s" },
        { src: file("back_claw_R"), delay: "0s", kind: "claw", origin: origin.backClawR, clawDir: 1 },
      ],
      legsInFrontOfBody: [
        { src: file("back_leg_R3"), delay: "-0.3s" },
        { src: file("back_leg_R2"), delay: "-0.15s" },
        { src: file("back_leg_R1"), delay: "0s" },
      ],
    },
  };
}

// 新種(動きの種類C=飛ぶ)の成虫アート。チョウなど。ファイルは
//   正面: front_body / front_wing_L / front_wing_R、背面: back_body / back_wing_L / back_wing_R(計6枚)
// 脚は本体に含める。羽根は付け根(hinge)を軸に、ヒラヒラと閉じたり開いたりする(横につぶれる)。
// 正面は羽根が体の奥、背面は羽根が体の手前(後ろから見ると羽根に体が隠れる)。
// 体全体もふわふわ上下に漂う(flying)。大顎・卵/幼虫/蛹は無い。
function buildWingedFlyerArt(
  code: string,
  hinge: { front: string; back: string },
  options: {
    frontWingsInFront?: boolean;
    mandibleOrigin?: { front: string; back: string };
    // 羽根の基準回転(度)。L/Rは羽根ファイル名の左右。
    wingTilt?: { front: { L: number; R: number }; back: { L: number; R: number } };
    // 羽根の位置の微調整(キャンバス高さに対する%、負が上)。
    // 羽ばたきのつぶれ(横に縮む)の中心を、羽根ごとの付け根へずらす量(付け根−hingeの差、キャンバスに対する%)。
    wingSquashAt?: { front?: { L?: { x: number; y: number }; R?: { x: number; y: number } }; back?: { L?: { x: number; y: number }; R?: { x: number; y: number } } };
    wingShiftY?: { front?: { L?: number; R?: number }; back?: { L?: number; R?: number } };
  } = {}
): Partial<Record<Facing, KnownCreatureArt>> {
  const file = (part: string) => `${KUWAGATA_ART_DIR}/kuwagata_${code}_${part}.svg`;
  const wings = (facing: "front" | "back", origin: string): CreaturePartArt[] => [
    { src: file(`${facing}_wing_L`), delay: "0s", kind: "wing", origin, baseRotateDeg: options.wingTilt?.[facing].L, shiftYPct: options.wingShiftY?.[facing]?.L, squashAt: options.wingSquashAt?.[facing]?.L },
    { src: file(`${facing}_wing_R`), delay: "0s", kind: "wing", origin, baseRotateDeg: options.wingTilt?.[facing].R, shiftYPct: options.wingShiftY?.[facing]?.R, squashAt: options.wingSquashAt?.[facing]?.R },
  ];
  return {
    front: {
      body: file("front_body"),
      mandibles: options.mandibleOrigin ? { 1: file("front_mandible_01") } : {},
      mandibleOrigin: options.mandibleOrigin?.front,
      flying: true,
      // 既定は正面の羽根が体の奥。frontWingsInFrontの種は体の手前に描く(トンたん)。
      legsBehindBody: options.frontWingsInFront ? [] : wings("front", hinge.front),
      legsInFrontOfBody: options.frontWingsInFront ? wings("front", hinge.front) : [],
    },
    back: {
      body: file("back_body"),
      mandibles: options.mandibleOrigin ? { 1: file("back_mandible_01") } : {},
      mandibleOrigin: options.mandibleOrigin?.back,
      flying: true,
      legsBehindBody: [],
      legsInFrontOfBody: wings("back", hinge.back),
    },
  };
}

// ヒマたん(ヒマラヤジャンピングスパイダー): 歩く8脚(L1〜L4・R1〜R4が正面・背面とも揃う)。
// 正面はRが体の奥・Lが手前、背面はLが体の奥・Rが手前。
// skip: 素材が無い脚(例: "front_leg_R4")。
function buildJumpingSpiderArt(code: string, skip: string[] = []): Partial<Record<Facing, KnownCreatureArt>> {
  const file = (part: string) => `${KUWAGATA_ART_DIR}/kuwagata_${code}_${part}.svg`;
  const set = (facing: string, side: "L" | "R", base: number) =>
    [4, 3, 2, 1]
      .map((n, i) => ({ part: `${facing}_leg_${side}${n}`, delay: `${(base - 0.15 * (3 - i)).toFixed(2)}s` }))
      .filter((leg) => !skip.includes(leg.part))
      .map((leg) => ({ src: file(leg.part), delay: leg.delay }));
  return {
    front: {
      body: file("front_body"),
      mandibles: {},
      legsBehindBody: set("front", "R", -0.55),
      legsInFrontOfBody: set("front", "L", 0),
    },
    back: {
      body: file("back_body"),
      mandibles: {},
      legsBehindBody: set("back", "L", -0.7),
      legsInFrontOfBody: set("back", "R", 0),
    },
  };
}

// クジャクたん(クジャクスパイダー): 8脚で歩く(ヒマたんと同じ構成、正面R4なし)+求愛ダンス。
// 求愛ダンスは、動きと動きの間に一定確率で、その場で正面を向いて(COURT_MS)お腹の模様を振り、脚を振り上げる。
function buildPeacockSpiderArt(code: string): Partial<Record<Facing, KnownCreatureArt>> {
  const art = buildJumpingSpiderArt(code, ["front_leg_R4"]);
  const file = (part: string) => `${KUWAGATA_ART_DIR}/kuwagata_${code}_${part}.svg`;
  return {
    front: art.front && {
      ...art.front,
      courtship: {
        body1: file("courtship_body1"),
        body2: file("courtship_body2"),
        fanOrigin: "42% 52%",
        // 縦長の脚を、付け根(下端)を軸に回して「水平から少し斜め上」にする。左脚は反時計回り、右脚は時計回り。
        legL: { src: file("courtship_leg_L"), origin: "31% 67%", baseDeg: -44 },
        legR: { src: file("courtship_leg_R"), origin: "65% 72%", baseDeg: 40 },
      },
    },
    back: art.back,
  };
}

// ヘルたん(ヘルアント): 歩く6脚(正面はL1〜L3・R1、背面はR1〜R3)+2本の大顎。正面・背面とも大顎は mandible_01・02 の2枚で、
// 体の手前に重ねて描く。正面は大顎の先が左を向く(時計回りで上へ)、背面は右を向く(反時計回りで上へ)。
function buildHellAntArt(code: string): Partial<Record<Facing, KnownCreatureArt>> {
  const art = buildNewSpeciesWalkerArt(code);
  const file = (part: string) => `${KUWAGATA_ART_DIR}/kuwagata_${code}_${part}.svg`;
  return {
    front: art.front && {
      ...art.front,
      jaws: [
        { src: file("front_mandible_02"), origin: "24% 70%", dir: 1 },
        { src: file("front_mandible_01"), origin: "47% 70%", dir: 1 },
      ],
    },
    back: art.back && {
      ...art.back,
      jaws: [
        { src: file("back_mandible_02"), origin: "45% 60%", dir: -1, behindBody: true },
        { src: file("back_mandible_01"), origin: "68% 62%", dir: -1 },
      ],
    },
  };
}

// コメたん(コメツキムシ): 歩く6脚+裏返し(flipped1=正面向き・flipped2=背面向き)。
// 置物や他の個体にぶつかると裏返ってじたばたし、パチンと跳ねて元に戻る(useWanderのflipTrap)。
function buildClickBeetleArt(code: string): Partial<Record<Facing, KnownCreatureArt>> {
  const art = buildNewSpeciesWalkerArt(code);
  const file = (part: string) => `${KUWAGATA_ART_DIR}/kuwagata_${code}_${part}.svg`;
  return {
    front: art.front && { ...art.front, flippedSrc: file("flipped1") },
    back: art.back && { ...art.back, flippedSrc: file("flipped2") },
  };
}

// ヘビたん(ヘビトンボ): 歩く6脚+大顎(mandible_01、ガチガチ+キラッ)+羽根。羽根は付け根を軸に、飛んでいる間だけ素早く羽ばたく。
// 正面の脚は L1・L3・R1(R1は体の奥)、背面は R1〜R3(手前)と L1-2(体の奥)。
function buildSnakeflyArt(): Partial<Record<Facing, KnownCreatureArt>> {
  const code = "KW-0047";
  const file = (part: string) => `${KUWAGATA_ART_DIR}/kuwagata_${code}_${part}.svg`;
  return {
    front: {
      body: file("front_body"),
      mandibles: { 1: file("front_mandible_01") },
      mandibleOrigin: "25% 85%",
      legsBehindBody: [{ src: file("front_leg_R1"), delay: "-0.55s" }],
      // 羽根は正面・背面とも体の手前
      legsInFrontOfBody: [
        { src: file("front_leg_L3"), delay: "-0.3s" },
        { src: file("front_leg_L1"), delay: "0s" },
        { src: file("front_wing_L"), delay: "0s", kind: "wing", origin: "50% 55%", flapDir: 1 },
        { src: file("front_wing_R"), delay: "0s", kind: "wing", origin: "40% 50%", flapDir: -1 },
      ],
    },
    back: {
      body: file("back_body"),
      mandibles: { 1: file("back_mandible_01") },
      mandibleOrigin: "89% 40%",
      legsBehindBody: [],
      legsInFrontOfBody: [
        { src: file("back_leg_R3"), delay: "-0.3s" },
        { src: file("back_leg_R2"), delay: "-0.15s" },
        { src: file("back_leg_R1"), delay: "0s" },
        // back_leg_L1-2.svg は中身が左の羽根(脚ではない)。右羽根と同じく体の手前に出して羽ばたかせる。
        { src: file("back_leg_L1-2"), delay: "0s", kind: "wing", origin: "50% 47%", flapDir: -1 },
        { src: file("back_wing_R"), delay: "0s", kind: "wing", origin: "58% 58%", flapDir: 1 },
      ],
    },
  };
}

// ハチたん: 上下に漂わず、曲線を描いてなめらかに飛ぶ(チョウたんはふわふわ上下)。
const CURVE_FLIGHT_SPECIES_CODE = "KW-0012";
// スズたん: ミツたんと同じ曲線飛行だが、移動も羽ばたきも速い。大顎ガチガチ。
const HORNET_SPECIES_CODE = "KW-0020";
const HORNET_TRAVEL_SCALE = 0.5;
const isCurveFlight = (code: string) => code === CURVE_FLIGHT_SPECIES_CODE || code === HORNET_SPECIES_CODE;
// トンたん: 羽ばたきは常に素早く小さめ、移動は直線的でかなり速め。他の飛ぶ種には適用しない。
const DRAGONFLY_SPECIES_CODE = "KW-0016";
// オニたん(オニヤンマ): 動きはトンたんと同じ(速い直線移動・常に小さく素早く羽ばたく)。
const DRAGONFLY_SPECIES_CODE_2 = "KW-0028";
// ユキたん: 羽ばたきはトンたん風(素早く小さく)。移動は直線にせず、ふわっと漂う。
const SNOW_FLYER_SPECIES_CODE = "KW-0045";
const isDragonfly = (code: string) => code === DRAGONFLY_SPECIES_CODE || code === DRAGONFLY_SPECIES_CODE_2;
const isFastFlap = (code: string) => isDragonfly(code) || code === HORNET_SPECIES_CODE || code === SNOW_FLYER_SPECIES_CODE;
const DRAGONFLY_TRAVEL_SCALE = 0.1125;

const KNOWN_CREATURE_ART: Partial<Record<string, Partial<Record<Facing, KnownCreatureArt>>>> = {
  // カナたん(カナブン)
  "KW-0005": buildNewSpeciesWalkerArt("KW-0005"),
  // テントたん(ナナホシテントウ)
  "KW-0006": buildNewSpeciesWalkerArt("KW-0006"),
  // ダンたん(ダンゴムシ)
  "KW-0007": buildNewSpeciesWalkerArt("KW-0007"),
  // バッたん(トノサマバッタ。ときどき跳ねる＝WanderingCreatureのHOP_*)
  "KW-0009": buildNewSpeciesWalkerArt("KW-0009"),
  // ウマたん(カマドウマ。うしろ脚が2パーツで、ジャンプ=HOP_*のときに2関節で蹴り出す=buildJumperArt)
  "KW-0046": buildJumperArt("KW-0046"),
  // クモたん(ジョロウグモ。8本脚＝buildEightLegWalkerArt。背面は左の脚1本も動く)
  "KW-0010": buildEightLegWalkerArt("KW-0010", { backLeftLeg: true }),
  // チョウたん(アゲハチョウ。飛ぶ＝buildWingedFlyerArt。羽根の付け根を軸にヒラヒラ)
  // アポたん(アポロチョウ。チョウたんと同じ飛ぶ動き。ヒラヒラ＋ふわふわ上下)
  "KW-0049": buildWingedFlyerArt("KW-0049", { front: "53% 55%", back: "46% 54%" }),
  // カリたん(カリゴ。チョウたんと同じ飛ぶ動き。ヒラヒラ＋ふわふわ上下)
  "KW-0053": buildWingedFlyerArt("KW-0053", { front: "48% 52%", back: "52% 45%" }),
  // イザたん(イザベラミズアオ。チョウたんと同じ飛ぶ動き。ヒラヒラ＋ふわふわ上下)
  "KW-0051": buildWingedFlyerArt("KW-0051", { front: "52% 55%", back: "45% 52%" }),
  "KW-0011": buildWingedFlyerArt("KW-0011", { front: "52% 50%", back: "54% 52%" }),
  // オニたん(オニヤンマ。動きはトンたんと同じ。斜めに描かれた羽根は基準姿勢を回して水平寄りにする=wingTilt)
  "KW-0028": buildWingedFlyerArt("KW-0028", { front: "45% 50%", back: "45% 47%" }, { frontWingsInFront: true, wingTilt: { front: { L: 30, R: -35 }, back: { L: -30, R: 30 } }, wingShiftY: { front: { R: -10 } }, wingSquashAt: { front: { R: { x: -12, y: 7 } } } }),
  // サワたん(サワガニ。8本脚はすべて体の後ろ。ハサミをときどきガチガチ=CHOMP_*。正面L2は素材待ち)
  "KW-0024": buildCrabArt("KW-0024", { front: { L: "76% 66%", R: "22% 65%" }, back: { L: "44% 40%", R: "67% 40%" } }),
  // グンたん(グンタイアリ。歩く6脚＋背面のL1。大顎mandible_01をガチガチ=CHOMP_*。背面の大顎は体の奥)
  "KW-0033": buildWalkerWithBackLeftLegArt("KW-0033", { frontOrigin: "42% 60%", backOrigin: "50% 40%", backBehindBody: true }),
  // サソたん(サソリ。ハサミ=claw、尻尾=taleをシュシュッと残像つきで打ち下ろす)
  "KW-0031": buildScorpionArt("KW-0031", { frontClaw: { L: "72% 74%", R: "17% 68%" }, backClawR: "87% 78%", frontTale: "67% 30%", backTale: "28% 33%" }),
  // ヘラたん(ヘラクレスオオカブト。ツノ+頭=mandible_01。付け根を軸に上下にガチガチ=nod、体全体にキラッ)
  "KW-0032": buildHerculesArt("KW-0032", { frontOrigin: "50% 80%", backOrigin: "62% 60%", backBehindBody: true }),
  // ツノたん(ツノゼミ。ツノ=mandible_01を付け根を軸に軽く振る=HORN_*。ときどき赤くキラッと溜めてから跳ねる=CHARGE_HOP_*)
  "KW-0034": buildNewSpeciesWalkerArt("KW-0034", { frontOrigin: "42% 52%", backOrigin: "54% 32%" }),
  // ナナたん(ナナフシ。6脚すべて見える。L1・R1は2パーツで、ときどき頭方向へまっすぐ突き出す擬態ポーズ)
  "KW-0035": buildStickInsectArt("KW-0035"),
  // コーたん(コーカサスオオカブト。演出はヘラたんと同じ=nod+shine+大きくなる)
  "KW-0037": buildHerculesArt("KW-0037", { frontOrigin: "50% 70%", backOrigin: "68% 62%", backBehindBody: true }),
  // タランたん(タランチュラ。8本脚＝クモたんと同じ構成。ときどきピタッと止まってパッと飛びつく=POUNCE_*)
  "KW-0036": buildEightLegWalkerArt("KW-0036", { backLeftLeg: true }),
  // ハナたん(ハナカマキリ。ゆらゆら揺れて動き回らず、ときどきカマを0.12秒で伸ばして獲物を捕まえる=GRAB_*)
  "KW-0038": buildOrchidMantisArt("KW-0038"),
  // ゲンたん(ゲンゴロウ。動きの種類F=泳ぐ。後ろ足(正面L3・R2、背面R1・L1)が付け根を軸に水を掻く。
  // 水槽の中を3次元(底〜水面)に泳ぎ回り、ときどき息継ぎに水面まで上がる=useSwim)
  "KW-0039": buildSwimmerArt("KW-0039"),
  // ミノたん(ミノムシ。1枚絵。糸でぶら下がって動かず、糸の付け根を軸にぶらぶら揺れる=DANGLE)
  "KW-0013": {
    front: {
      body: `${KUWAGATA_ART_DIR}/kuwagata_KW-0013_front_body.svg`,
      mandibles: {},
      legsBehindBody: [],
      legsInFrontOfBody: [],
    },
  },
  // アオたん(アオスジアゲハ。飛び方はチョウたんと同じ)
  "KW-0026": buildWingedFlyerArt("KW-0026", { front: "49% 58%", back: "40% 57%" }),
  // ハグロたん(ハグロトンボ。羽根は正面・背面とも体の手前。羽ばたきはチョウたんと同じヒラヒラ)
  "KW-0025": buildWingedFlyerArt("KW-0025", { front: "43% 64%", back: "44% 55%" }, { frontWingsInFront: true }),
  // トンたん(シオカラトンボ。飛ぶが、羽ばたきは常に素早く小さめ。直線的に速く移動=DRAGONFLY_*)
  // ユキたん(綿毛の虫)。羽根は正面・背面とも体の手前、羽ばたきはトンたん風
  "KW-0045": buildWingedFlyerArt("KW-0045", { front: "50% 50%", back: "52% 46%" }, { frontWingsInFront: true }),
  "KW-0016": buildWingedFlyerArt("KW-0016", { front: "47% 45%", back: "56% 46%" }, { frontWingsInFront: true }),
  "KW-0012": buildWingedFlyerArt("KW-0012", { front: "46% 31%", back: "54% 28%" }),
  // スズたん(スズメバチ。ミツたんと同じ曲線飛行を速く。大顎mandible_01をガチガチ=CHOMP_*)
  "KW-0020": buildWingedFlyerArt("KW-0020", { front: "46% 31%", back: "50% 36%" }, { frontWingsInFront: true, mandibleOrigin: { front: "32% 75%", back: "87% 68%" } }),
  // セミたん(飛ぶ。ヒラヒラ＋ふわふわ上下はチョウたんと同じ)
  "KW-0015": buildWingedFlyerArt("KW-0015", { front: "47% 35%", back: "50% 38%" }),
  // カマたん(カマキリ。擬態・待機=D。体がゆらゆら揺れ、ときどきカマを構えて振る=SCYTHE_*。移動はゆっくり)
  "KW-0018": buildMantisArt("KW-0018", {
    front: { L: "36% 48%", R: "40% 47%" },
    back: { L: "53% 46%", R: "60% 49%" },
  }),
  // ホタたん(ホタル。歩く6脚+お腹がゆっくり明滅して光る)
  "KW-0023": buildFireflyArt("KW-0023", {
    front: { left: 90, top: 62, size: 34 },
    back: { left: 12, top: 82, size: 38 },
  }),
  // ニシキたん(歩く6脚+背面でL1が見える。タマたんと同じ「大きくなってカラフルにキラキラ」)
  "KW-0029": buildNigikiBugArt("KW-0029"),
  // ルリたん(ルリボシカミキリ。大顎mandible_01をガチガチ=CHOMP_*。ときどき体の上を光がスッと走る=SHINE_*)
  "KW-0030": buildShineBeetleArt("KW-0030", { front: "31% 80%", back: "90% 66%" }),
  // タマたん(タマムシ。歩く6脚・大顎なし。テッペンクワたん同様に大きくなってカラフルにキラキラ)
  "KW-0019": buildNewSpeciesWalkerArt("KW-0019"),
  // ゾウたん(ゾウムシ。鼻=mandible_01を付け根を軸にフンフン大きく振る=SNIFF_*)
  "KW-0021": buildNewSpeciesWalkerArt("KW-0021", { frontOrigin: "23% 70%", backOrigin: "80% 60%", backBehindBody: true }),
  // モンたん(エサキモンキツノカメムシ。歩く6脚・大顎なし・脚は正面/背面ともすべて体の後ろ。ときどき体をぷるぷる震わせて臭いガスをぷしゅっと出す=STINK_*)
  "KW-0022": buildWalkerLegsBehindBodyArt("KW-0022"),
  // ヒマたん(ヒマラヤジャンピングスパイダー。8脚。ときどきピタッと止まってパッと飛びつく=POUNCE_*、タランたんの使い回しで距離は長め)
  "KW-0050": buildJumpingSpiderArt("KW-0050"),
  // クジャクたん(クジャクスパイダー。8脚＝ヒマたんと同じ構成で、正面のR4は素材なし。普通に歩く)
  "KW-0052": buildPeacockSpiderArt("KW-0052"),
  // ヘルたん(ヘルアント。大顎2本が上回転でガチガチ＋大きくなる＋キラッ＋星=CHOMP_*。古代の森の種は大きく表示)
  "KW-0055": buildHellAntArt("KW-0055"),
  // コメたん(コメツキムシ。置物・他の個体にぶつかると裏返ってじたばた→パチンと跳ねる=CLICK_*)
  "KW-0048": buildClickBeetleArt("KW-0048"),
  // ヘビたん(ヘビトンボ。大顎をガチガチ+大顎がキラッ=CHOMP_*。たまに羽ばたいて短い距離を飛ぶ=SNAKEFLY_*)
  "KW-0047": buildSnakeflyArt(),
  // ハンたん(ハンミョウ。大顎をガチガチ=CHOMP_*。たまに弧を描いて素早く飛んで移動=LEAP_*)
  "KW-0027": buildTigerBeetleArt("KW-0027", { frontOrigin: "30% 88%", backOrigin: "90% 60%" }),
  // カミたん(カミキリムシ。大顎mandible_01をときどきガチガチ=CHOMP_*)
  // オサたん(オサムシ。標準の歩く6脚＋大顎。大顎mandible_01をガチガチ=CHOMP_*)
  // ユーたん(ホウネンエビ。歩く。横の腕=mandibleをゆらゆら揺らす)
  "KW-0056": buildFairyShrimpArt("KW-0056", { front: { L: "61% 77%", R: "21% 62%" }, back: { L: "50% 37%", R: "78% 64%" } }),
  // キメたん(キメラ。8脚歩行＋尻尾のシュシュッ)
  "KW-0058": buildChimeraArt("KW-0058", { front: "86% 37%", back: "16% 74%" }),
  // トゲたん(ヤスデ。体節をウネウネ＋大顎ガチガチ・キラリ)
  "KW-0054": buildMilliArt("KW-0054"),
  // パレオたん(羽根3枚ずつをゆっくり波打たせる)
  "KW-0057": buildPaleoWingArt("KW-0057"),
  "KW-0044": buildNewSpeciesWalkerArt("KW-0044", { frontOrigin: "38% 82%", backOrigin: "90% 66%" }),
  "KW-0017": buildLongicornArt("KW-0017", { front: "31% 85%", back: "90% 58%" }),
  // カブたん(カブトムシ。ツノはmandible_01、付け根を軸にときどき首振り＝HORN_*)
  "KW-0014": buildNewSpeciesWalkerArt("KW-0014", {
    frontOrigin: "29% 43%",
    backOrigin: "76% 38%",
    backBehindBody: true,
  }),
  // 限定種(仮の絵。Stage5のシーンを習得するともらえる。絵を差し替えたらここも直す)
  // ジュウクワたん(家の形。住まい・手続きのシーン。ツノ=mandible_01は固定のまま)
  "KW-0059": buildNewSpeciesWalkerArt("KW-0059", { frontOrigin: "50% 70%", backOrigin: "70% 60%" }),
  // ケイクワたん(銀行・契約のシーン。ツノ=mandible_01は固定のまま)
  "KW-0060": buildNewSpeciesWalkerArt("KW-0060", { frontOrigin: "50% 70%", backOrigin: "70% 60%" }),
  // ジョウクワたん(生活サービスのシーン)。背面のときだけ、大顎を体の奥(後ろ)に描く
  "KW-0061": (() => {
    const art = buildNewSpeciesWalkerArt("KW-0061", { frontOrigin: "50% 70%", backOrigin: "70% 60%" });
    return { front: art.front, back: art.back && { ...art.back, mandibleBehindBody: true } };
  })(),
  // タスクワたん(トラブル対応のシーン)。背面だけ、奥側の脚 back_leg_L1 が体の奥に加わる
  "KW-0062": (() => {
    const art = buildNewSpeciesWalkerArt("KW-0062", { frontOrigin: "50% 70%", backOrigin: "70% 60%" });
    return {
      // 大顎は正面・背面とも体より奥に描く
      front: art.front && { ...art.front, mandibleBehindBody: true },
      back: art.back && {
        ...art.back,
        mandibleBehindBody: true,
        legsBehindBody: [{ src: `${KUWAGATA_ART_DIR}/kuwagata_KW-0062_back_leg_L1.svg`, delay: "-0.45s" }, ...art.back.legsBehindBody],
      },
    };
  })(),
  // プレクワたん(プレゼン・面接のシーン)。タスクワたんと同じ描き方: 大顎は体より奥、背面は奥側の脚 back_leg_L1 つき
  "KW-0063": (() => {
    const art = buildNewSpeciesWalkerArt("KW-0063", { frontOrigin: "50% 70%", backOrigin: "70% 60%" });
    return {
      front: art.front && { ...art.front, mandibleBehindBody: true },
      back: art.back && {
        ...art.back,
        mandibleBehindBody: true,
        legsBehindBody: [{ src: `${KUWAGATA_ART_DIR}/kuwagata_KW-0063_back_leg_L1.svg`, delay: "-0.45s" }, ...art.back.legsBehindBody],
      },
    };
  })(),
  // ネゴクワたん(交渉・依頼のシーン)。タスクワたんと同じ描き方: 大顎は体より奥、背面は奥側の脚 back_leg_L1 つき
  "KW-0064": (() => {
    const art = buildNewSpeciesWalkerArt("KW-0064", { frontOrigin: "50% 70%", backOrigin: "70% 60%" });
    return {
      front: art.front && { ...art.front, mandibleBehindBody: true },
      back: art.back && {
        ...art.back,
        mandibleBehindBody: true,
        legsBehindBody: [{ src: `${KUWAGATA_ART_DIR}/kuwagata_KW-0064_back_leg_L1.svg`, delay: "-0.45s" }, ...art.back.legsBehindBody],
      },
    };
  })(),
  // モウクワたん(会議・報告のシーン)。大顎は正面・背面とも体より奥に描く
  "KW-0065": (() => {
    const art = buildNewSpeciesWalkerArt("KW-0065", { frontOrigin: "50% 70%", backOrigin: "70% 60%" });
    return {
      front: art.front && { ...art.front, mandibleBehindBody: true },
      back: art.back && { ...art.back, mandibleBehindBody: true },
    };
  })(),
  // テレクワたん(電話・メールのシーン)。大顎は正面・背面とも体より奥に描く
  "KW-0066": (() => {
    const art = buildNewSpeciesWalkerArt("KW-0066", { frontOrigin: "50% 70%", backOrigin: "70% 60%" });
    return {
      front: art.front && { ...art.front, mandibleBehindBody: true },
      back: art.back && { ...art.back, mandibleBehindBody: true },
    };
  })(),
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
  "KW-0059": buildKnownStageArt("KW-0059"),
  "KW-0060": buildKnownStageArt("KW-0060"),
  "KW-0061": buildKnownStageArt("KW-0061"),
  "KW-0062": buildKnownStageArt("KW-0062"),
  "KW-0063": buildKnownStageArt("KW-0063"),
  "KW-0064": buildKnownStageArt("KW-0064"),
  "KW-0065": buildKnownStageArt("KW-0065"),
  "KW-0066": buildKnownStageArt("KW-0066"),
};

// シーン選択画面などで使う、止まった姿の小さなアイコン(大顎・脚つき)。実アートが無い種は何も出さない。
export function KnownCreatureIcon({ code, owned = true, className = "h-10 w-10" }: { code: string; owned?: boolean; className?: string }) {
  if (!KNOWN_CREATURE_ART[code]) return null;
  return (
    <div className={`relative shrink-0 ${className}`} style={owned ? undefined : { filter: "brightness(0)", opacity: 0.22 }}>
      <KnownCreatureSprite code={code} facing="front" mandibleVariant={1} still />
    </div>
  );
}

// 卵・蛹は動かない(その場に置いたまま)。幼虫・成虫(と、実アートが無い種のBugアイコン)は歩き回る。
function isStationaryStage(code: string, growthStage: KuwagataGrowthStage): boolean {
  const stageArt = KNOWN_STAGE_ART[code];
  if (growthStage === "卵") return Boolean(stageArt?.egg);
  if (growthStage === "蛹") return Boolean(stageArt?.pupa);
  // ミノたん(成虫)は糸でぶら下がって動かない(ぶらぶら揺れるだけ)。
  if (code === DANGLE_SPECIES_CODE) return true;
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
export function KnownCreatureSprite({
  code,
  facing,
  mandibleVariant,
  growthStage = "成虫",
  heading = "left",
  phaseSeed = "",
  fighting = false,
  hornSwing = false,
  charge = false,
  mimic = false,
  still = false,
  chomp = false,
  sniff = false,
  scythe = false,
  shine = false,
  strike = false,
  grab = false,
  swim = false,
  hop = false,
  airborne = false,
  flipped = false,
  courting = false,
}: {
  code: string;
  facing: Facing;
  mandibleVariant: number;
  growthStage?: KuwagataGrowthStage;
  heading?: Heading;
  phaseSeed?: string;
  fighting?: boolean;
  // ツノを付け根を軸に首振りさせる(カブたんの仕草)。mandibleOriginが設定された種だけ効く。
  hornSwing?: boolean;
  // 溜め中に体が赤くキラッ、キラッと光る(ツノたん)。
  charge?: boolean;
  // 擬態ポーズ中(ナナたん)。pose付きの脚が、前脚を頭方向へまっすぐ突き出す。
  mimic?: boolean;
  // ピタッと完全に静止(タランたんの待ち伏せ)。脚も体の揺れも止める。
  still?: boolean;
  chomp?: boolean;
  sniff?: boolean;
  scythe?: boolean;
  shine?: boolean;
  strike?: boolean;
  // 獲物を捕まえる(ハナたん)。grab種別のカマが一気に伸びる。
  grab?: boolean;
  // 泳いで移動している最中(ゲンたん)。後ろ足で水を掻き、体も泳ぎに合わせて動く。
  swim?: boolean;
  // ジャンプ中(バッたん・ウマたん)。ウマたんのうしろ脚(hind-thigh/hind-shin)が蹴り出す。
  hop?: boolean;
  // 飛んで移動している最中(ヘビたん)。羽根が羽ばたく。
  airborne?: boolean;
  // ぶつかって裏返っている最中(コメたん)。flippedSrcの1枚をじたばたさせて出す。
  flipped?: boolean;
  // 求愛ダンス中(クジャクたん)。courtshipの絵に切り替え、お腹と脚を振る。
  courting?: boolean;
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

  if (courting && art.courtship) {
    const c = art.courtship;
    const legStyle = (leg: { origin: string; baseDeg: number }, delay: string): CSSProperties =>
      ({ transformOrigin: leg.origin, "--cb": `${leg.baseDeg}deg`, animationDelay: delay }) as CSSProperties;
    return (
      <div className="relative h-full w-full animate-kuwagata-court-bounce">
        <img src={c.body2} alt="" className="animate-kuwagata-court-fan absolute inset-0 h-full w-full" style={{ transformOrigin: c.fanOrigin }} />
        <img src={c.legL.src} alt="" className="animate-kuwagata-court-leg absolute inset-0 h-full w-full" style={legStyle(c.legL, "0s")} />
        <img src={c.legR.src} alt="" className="animate-kuwagata-court-leg absolute inset-0 h-full w-full" style={legStyle(c.legR, "-0.11s")} />
        <img src={c.body1} alt="" className="absolute inset-0 h-full w-full drop-shadow-sm" />
      </div>
    );
  }

  if (flipped && art.flippedSrc) {
    return (
      <div className="relative h-full w-full animate-kuwagata-flip-hit">
        <div className="relative h-full w-full animate-kuwagata-flip-wiggle">
          <img src={art.flippedSrc} alt="" className="absolute inset-0 h-full w-full drop-shadow-sm" />
        </div>
      </div>
    );
  }

  // 飛んでいる間は、羽根を広げた体の1枚絵に差し替える(あれば)。
  const useAirborneBody = airborne && !!art.airborneBody;

  // 大顎(ツノ)。既定は一番手前、mandibleBehindBodyの向きは最背面(本体より奥)に描く。
  const heraShow = isHera(code) && shine;
  const jawClassName = `absolute inset-0 h-full w-full ${heraShow ? "animate-kuwagata-nod" : ""} ${fighting ? "animate-kuwagata-fight-jaw" : ""} ${hornSwing && art.mandibleOrigin ? "animate-kuwagata-horn" : ""} ${chomp && art.mandibleOrigin ? (code === SNAKEFLY_SPECIES_CODE ? "animate-kuwagata-chomp-big" : "animate-kuwagata-chomp") : ""} ${sniff && art.mandibleOrigin ? "animate-kuwagata-sniff" : ""}`;
  // グンたん: ガチガチの間、大顎の形でくり抜いた光がキラッと走る(大顎と一緒に動く)。
  const jawShine = (((code === JAW_SHINE_SPECIES_CODE || code === SNAKEFLY_SPECIES_CODE) && chomp) || heraShow) && mandible;
  // ヘルたんの大顎(jaws)。ガチガチの間は上回転で開閉し、大きくなり、大顎の形にそって光が走る。
  const renderJaw = (jaw: NonNullable<KnownCreatureArt["jaws"]>[number], i: number) => (
    <div
      key={`jaw${i}`}
      className={`absolute inset-0 h-full w-full ${chomp ? "animate-kuwagata-chomp-jaw" : ""}`}
      style={{ transformOrigin: jaw.origin, "--jd": jaw.dir } as CSSProperties}
    >
      <img src={jaw.src} alt="" className="absolute inset-0 h-full w-full" />
      {chomp &&
        [0.1, 0.85].map((delay) => (
          <span
            key={delay}
            className="animate-kuwagata-shine-jaw pointer-events-none absolute inset-0"
            style={{
              animationDelay: `${delay}s`,
              WebkitMaskImage: `url(${jaw.src})`,
              maskImage: `url(${jaw.src})`,
              WebkitMaskSize: "100% 100%",
              maskSize: "100% 100%",
            }}
          />
        ))}
    </div>
  );
  const mandibleEl = mandible ? (
    jawShine ? (
      <div
        className={jawClassName}
        style={{ ...(art.mandibleOrigin ? { transformOrigin: art.mandibleOrigin } : {}), ...(heraShow ? ({ "--nod-dir": facing === "front" ? 1 : -1 } as CSSProperties) : {}) }}
      >
        <img src={mandible} alt="" className="absolute inset-0 h-full w-full" />
        <span
          className="animate-kuwagata-shine-jaw pointer-events-none absolute inset-0"
          style={{
            ...(heraShow ? { animationDelay: "0.9s", animationDuration: "1.1s" } : {}),
            WebkitMaskImage: `url(${mandible})`,
            maskImage: `url(${mandible})`,
            WebkitMaskSize: "100% 100%",
            maskSize: "100% 100%",
          }}
        />
      </div>
    ) : (
      <img
        src={mandible}
        alt=""
        className={jawClassName}
        style={art.mandibleOrigin ? { transformOrigin: art.mandibleOrigin } : undefined}
      />
    )
  ) : null;

  return (
    <div className={`relative h-full w-full ${art.swimming ? (swim ? "animate-kuwagata-swim-go" : "animate-kuwagata-swim-idle") : art.flying ? (isCurveFlight(code) || isDragonfly(code) ? "animate-kuwagata-glide" : "animate-kuwagata-flutter") : code === DANGLE_SPECIES_CODE ? "animate-kuwagata-dangle" : code === ORCHID_SPECIES_CODE ? "animate-kuwagata-sway-wobble" : isMantis(code) ? "animate-kuwagata-sway" : mimic || still ? "" : "animate-kuwagata-body"}`}>
      {art.glow && (
        // お腹の光。体の後ろ(奥)に置き、おしり側からはみ出して見える。ゆっくり明るくなって消えるのを繰り返す。
        <span
          className="animate-kuwagata-glow pointer-events-none absolute rounded-full"
          style={{
            left: `${art.glow.left}%`,
            top: `${art.glow.top}%`,
            width: `${art.glow.size}%`,
            height: `${art.glow.size}%`,
            transform: "translate(-50%, -50%)",
            background:
              "radial-gradient(circle, rgba(254,249,130,0.95) 0%, rgba(190,235,60,0.7) 40%, rgba(150,220,60,0) 72%)",
          }}
        />
      )}
      {art.mandibleBehindBody && mandibleEl}
      {art.jaws?.filter((jaw) => jaw.behindBody).map(renderJaw)}
      {art.legsBehindBody.map((leg, i) => leg.kind === "tail-ghost" && !strike ? null : (
        <img
          key={`behind${i}`}
          src={leg.src}
          alt=""
          className={`absolute inset-0 h-full w-full ${legClassName(leg.kind, code, scythe, chomp, strike, mimic ? leg.pose?.seg : undefined, mimic || still, grab, swim, hop, airborne)}`}
          style={{ animationDelay: hop && leg.hind ? "0s" : leg.delay, transformOrigin: leg.origin, ...(leg.baseRotateDeg ? ({ "--base-rot": `${leg.baseRotateDeg}deg` } as CSSProperties) : {}), ...(leg.shiftYPct ? { translate: `0 ${leg.shiftYPct}%` } : {}), ...(leg.pose ? ({ transformOrigin: mimic ? leg.pose.origin : undefined, "--a1": `${leg.pose.a1}deg`, "--a2": `${leg.pose.a2 ?? 0}deg`, "--ex": `${leg.pose.ex ?? 0}%`, "--ey": `${leg.pose.ey ?? 0}%` } as CSSProperties) : {}), ...(leg.grab
          ? ({
              "--ga1": `${leg.grab.a[0]}deg`,
              "--ga2": `${leg.grab.a[1]}deg`,
              "--ga3": `${leg.grab.a[2]}deg`,
              "--gp1x": `${leg.grab.p1[0]}%`,
              "--gp1y": `${leg.grab.p1[1]}%`,
              "--gp2x": `${leg.grab.p2[0]}%`,
              "--gp2y": `${leg.grab.p2[1]}%`,
              "--gp3x": `${leg.grab.p3[0]}%`,
              "--gp3y": `${leg.grab.p3[1]}%`,
            } as CSSProperties)
          : {}), ...(leg.ghostOpacity ? ({ opacity: leg.ghostOpacity } as CSSProperties) : {}), ...(leg.clawDir ? ({ "--claw-dir": leg.clawDir } as CSSProperties) : {}), ...(leg.paddleDir ? ({ "--paddle-dir": leg.paddleDir } as CSSProperties) : {}), ...(leg.hind ? ({ "--hd": leg.hind.dir, "--kx": `${leg.hind.knee[0]}%`, "--ky": `${leg.hind.knee[1]}%` } as CSSProperties) : {}), ...(leg.flapDir ? ({ "--fd": leg.flapDir } as CSSProperties) : {}), ...(leg.squashAt ? ({ "--sq-x": `${leg.squashAt.x}%`, "--sq-y": `${leg.squashAt.y}%` } as CSSProperties) : {}) }}
        />
      ))}
      <img src={useAirborneBody ? art.airborneBody : art.body} alt="" className="absolute inset-0 h-full w-full drop-shadow-sm" />
      {art.legsInFrontOfBody.map((leg, i) => leg.kind === "tail-ghost" && !strike ? null : (
        <img
          key={`front${i}`}
          src={leg.src}
          alt=""
          className={`absolute inset-0 h-full w-full ${legClassName(leg.kind, code, scythe, chomp, strike, mimic ? leg.pose?.seg : undefined, mimic || still, grab, swim, hop, airborne)}`}
          style={{ animationDelay: hop && leg.hind ? "0s" : leg.delay, transformOrigin: leg.origin, ...(leg.baseRotateDeg ? ({ "--base-rot": `${leg.baseRotateDeg}deg` } as CSSProperties) : {}), ...(leg.shiftYPct ? { translate: `0 ${leg.shiftYPct}%` } : {}), ...(leg.pose ? ({ transformOrigin: mimic ? leg.pose.origin : undefined, "--a1": `${leg.pose.a1}deg`, "--a2": `${leg.pose.a2 ?? 0}deg`, "--ex": `${leg.pose.ex ?? 0}%`, "--ey": `${leg.pose.ey ?? 0}%` } as CSSProperties) : {}), ...(leg.grab
          ? ({
              "--ga1": `${leg.grab.a[0]}deg`,
              "--ga2": `${leg.grab.a[1]}deg`,
              "--ga3": `${leg.grab.a[2]}deg`,
              "--gp1x": `${leg.grab.p1[0]}%`,
              "--gp1y": `${leg.grab.p1[1]}%`,
              "--gp2x": `${leg.grab.p2[0]}%`,
              "--gp2y": `${leg.grab.p2[1]}%`,
              "--gp3x": `${leg.grab.p3[0]}%`,
              "--gp3y": `${leg.grab.p3[1]}%`,
            } as CSSProperties)
          : {}), ...(leg.ghostOpacity ? ({ opacity: leg.ghostOpacity } as CSSProperties) : {}), ...(leg.clawDir ? ({ "--claw-dir": leg.clawDir } as CSSProperties) : {}), ...(leg.paddleDir ? ({ "--paddle-dir": leg.paddleDir } as CSSProperties) : {}), ...(leg.hind ? ({ "--hd": leg.hind.dir, "--kx": `${leg.hind.knee[0]}%`, "--ky": `${leg.hind.knee[1]}%` } as CSSProperties) : {}), ...(leg.flapDir ? ({ "--fd": leg.flapDir } as CSSProperties) : {}), ...(leg.squashAt ? ({ "--sq-x": `${leg.squashAt.x}%`, "--sq-y": `${leg.squashAt.y}%` } as CSSProperties) : {}) }}
        />
      ))}
      {art.shine && shine && (
        // 体の形でくり抜いた光の帯が、体の上をスッと走る。
        <span
          className={`${isHera(code) ? "animate-kuwagata-shine-jaw" : "animate-kuwagata-shine"} pointer-events-none absolute inset-0`}
          style={{
            ...(isHera(code) ? { animationDelay: "0.9s", animationDuration: "1.1s" } : {}),
            WebkitMaskImage: `url(${art.body})`,
            maskImage: `url(${art.body})`,
            WebkitMaskSize: "100% 100%",
            maskSize: "100% 100%",
          }}
        />
      )}
      {!art.mandibleBehindBody && mandibleEl}
      {art.jaws?.filter((jaw) => !jaw.behindBody).map(renderJaw)}
      {charge && code === CHARGE_HOP_SPECIES_CODE && (
        // 溜めの赤いキラッ。体とツノの形でくり抜いた赤い光を、2回ぴかっと光らせる。
        <>
          {[art.body, mandible].map((src, i) =>
            src ? (
              <span
                key={i}
                className="animate-kuwagata-red-flash pointer-events-none absolute inset-0"
                style={{
                  WebkitMaskImage: `url(${src})`,
                  maskImage: `url(${src})`,
                  WebkitMaskSize: "100% 100%",
                  maskSize: "100% 100%",
                }}
              />
            ) : null
          )}
        </>
      )}
    </div>
  );
}

// 脚・羽根・カマのCSSクラス。カマは構えて振るとき(scythe)だけ動かす。
function legClassName(kind: CreaturePartArt["kind"], code: string, scythe: boolean, chomp = false, strike = false, mimicSeg?: 1 | 2, still = false, grab = false, swim = false, hop = false, airborne = false): string {
  // ウマたんのうしろ脚(2パーツ)。ジャンプ中だけ動き、ふだんは畳んだまま。
  if (kind === "hind-thigh") return hop ? "animate-kuwagata-hind-thigh" : still ? "" : "animate-kuwagata-hind-walk-thigh";
  if (kind === "hind-shin") return hop ? "animate-kuwagata-hind-shin" : still ? "" : "animate-kuwagata-hind-walk-shin";
  // 泳ぐ種: 後ろ足は、移動中は強く水を掻き、止まっている間はゆっくり揺らす。ほかの小さな脚は移動中だけ動く。
  if (kind === "paddle") return swim ? "animate-kuwagata-paddle" : "animate-kuwagata-paddle-idle";
  if (isSwimmer(code) && !kind) return swim ? "animate-kuwagata-leg" : "";
  if (kind === "grab") return grab ? "animate-kuwagata-grab" : "";
  if (mimicSeg) return mimicSeg === 1 ? "animate-kuwagata-mimic-1" : "animate-kuwagata-mimic-2";
  // 擬態ポーズ中は、ほかの脚も歩かず完全に止まる。
  if (still) return "";
  if (kind === "tail") return strike ? "animate-kuwagata-tail" : "";
  if (kind === "tail-ghost") return "animate-kuwagata-tail animate-kuwagata-tail-ghost";
  if (kind === "claw") return chomp ? "animate-kuwagata-claw" : "";
  // ユーたんの横の腕(大顎)。歩いている間、付け根を軸にずっとゆらゆら揺らす。
  if (kind === "arm") return "animate-kuwagata-arm";
  // トゲたんの体節。それぞれの中心を軸に左右へ少し振り続ける(時間差でウネウネ)。
  if (kind === "segment") return "animate-kuwagata-segment";
  // パレオたんの羽根(左右3枚ずつ)。ゆっくり、3枚の位相を120度ずつずらして波打つように羽ばたく。
  if (kind === "wave") return "animate-kuwagata-wing-wave";
  // ヘビたんの羽根は、飛んでいる間だけ羽ばたく。
  if (kind === "wing" && code === SNAKEFLY_SPECIES_CODE) return airborne ? "animate-kuwagata-wing-snakefly" : "";
  if (kind === "wing") return isFastFlap(code) ?"animate-kuwagata-wing-dragonfly" : "animate-kuwagata-wing";
  if (kind === "scythe") return scythe ? "animate-kuwagata-scythe" : "";
  return "animate-kuwagata-leg";
}


type TintCeremonyInfo = {
  speciesCode: string;
  mandibleVariant: number;
  growthStage: KuwagataGrowthStage;
  sizeScale: number;
  fromKey: string | null;
  toKey: string;
};

// 色の実をあげたときの演出。画面が静かに暗くなり、個体の前に実が降りてくる。
// 個体が実を3口でかじって食べきると、体の色がゆっくり移る。獲得演出のような華やかさはなく、
// 短く終わる（タップで早送り）。
type RimCeremonyInfo = {
  speciesCode: string;
  mandibleVariant: number;
  growthStage: KuwagataGrowthStage;
  sizeScale: number;
  tintKey: string | null;
  rim: RimKey;
};

// 星のカケラをふりかけたときの演出。画面が静かに暗くなり、星のカケラが降りてきて、
// 個体の上でキラキラと砕け、輪郭が金（銀）に光る。色の実と同じく短く終わる（タップで早送り）。
function RimCeremony({ info, onDone }: { info: RimCeremonyInfo; onDone: () => void }) {
  // 0: 暗転 / 1: カケラが降りる / 2: 砕けて粒が舞う / 3: 輪郭が光る / 4: 暗転が明ける
  const [stage, setStage] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const timers = [
      setTimeout(() => setStage(1), 450),
      setTimeout(() => setStage(2), 1700),
      setTimeout(() => setStage(3), 2500),
      setTimeout(() => setStage(4), 4400),
      setTimeout(() => doneRef.current(), 5000),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const visualScale = Math.min(Math.max(info.sizeScale, 0.6), 1.6) * 5.5;
  const dark = stage >= 4 ? 0 : 0.78;
  const glow = info.rim === "gold" ? "#ffd24a" : "#eaf3ff";
  const sparks = [
    { x: -90, y: -70, d: 0 }, { x: 80, y: -90, d: 0.08 }, { x: -110, y: 10, d: 0.16 }, { x: 105, y: 20, d: 0.04 },
    { x: -60, y: 85, d: 0.12 }, { x: 70, y: 80, d: 0.2 }, { x: 0, y: -110, d: 0.1 }, { x: 0, y: 100, d: 0.18 },
  ];
  return (
    <div
      className="fixed inset-0 z-[70] flex cursor-pointer items-center justify-center"
      style={{ backgroundColor: `rgba(8,10,14,${dark})`, transition: "background-color 600ms ease" }}
      onClick={() => doneRef.current()}
      role="presentation"
    >
      <style>{`
        @keyframes rim-shard-fall { 0% { transform: translateY(-160px) rotate(-20deg); opacity: 0; } 30% { opacity: 1; } 100% { transform: translateY(-40px) rotate(10deg); opacity: 1; } }
        @keyframes rim-shard-burst { 0% { transform: translate(0,0) scale(.4); opacity: 1; } 100% { transform: translate(var(--bx), var(--by)) scale(1.1); opacity: 0; } }
      `}</style>
      <div className="relative flex items-center justify-center" style={{ width: 240, height: 240 }}>
        <div
          style={{
            filter: individualFilter(info.tintKey, info.speciesCode, stage >= 3 && stage < 4 ? info.rim : null),
            transition: "filter 900ms ease-in-out, opacity 600ms ease",
            opacity: stage >= 4 ? 0 : 1,
          }}
        >
          <TankOccupant
            color="#52525b"
            sizeScale={visualScale}
            speciesCode={info.speciesCode}
            mandibleVariant={info.mandibleVariant}
            growthStage={info.growthStage}
          />
        </div>
        {stage === 1 && (
          // eslint-disable-next-line @next/next/no-img-element -- 自前SVGアート
          <img
            src={`/roadmap/items/rim-${info.rim}.svg`}
            alt=""
            className="pointer-events-none absolute h-16 w-16 object-contain"
            style={{ top: 10, animation: "rim-shard-fall 1100ms ease-in both" }}
          />
        )}
        {stage === 2 &&
          sparks.map((sp, i) => (
            <span
              key={i}
              className="pointer-events-none absolute text-lg"
              style={
                {
                  color: glow,
                  textShadow: `0 0 6px ${glow}`,
                  animation: `rim-shard-burst 800ms ease-out ${sp.d}s both`,
                  "--bx": `${sp.x}px`,
                  "--by": `${sp.y}px`,
                } as CSSProperties
              }
            >
              ✦
            </span>
          ))}
      </div>
    </div>
  );
}

function TintCeremony({ info, onDone }: { info: TintCeremonyInfo; onDone: () => void }) {
  // 0: 暗転 / 1: 実が降りる / 2〜4: 1口目〜3口目 / 5: 食べ終わって色が移る / 6: 暗転が明ける
  const [stage, setStage] = useState(0);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  useEffect(() => {
    const timers = [
      setTimeout(() => setStage(1), 450),
      setTimeout(() => setStage(2), 1500),
      setTimeout(() => setStage(3), 1950),
      setTimeout(() => setStage(4), 2400),
      setTimeout(() => setStage(5), 2850),
      setTimeout(() => setStage(6), 4700),
      setTimeout(() => doneRef.current(), 5300),
    ];
    return () => timers.forEach(clearTimeout);
  }, []);

  const visualScale = Math.min(Math.max(info.sizeScale, 0.6), 1.6) * 5.5;
  const dark = stage >= 6 ? 0 : 0.78;
  const biting = stage >= 2 && stage <= 4;
  const fruitScale = stage <= 1 ? 1 : stage === 2 ? 0.72 : stage === 3 ? 0.45 : stage === 4 ? 0.2 : 0;
  return (
    <div
      className="fixed inset-0 z-[70] flex cursor-pointer items-center justify-center"
      style={{ backgroundColor: `rgba(8,10,14,${dark})`, transition: "background-color 600ms ease" }}
      onClick={() => doneRef.current()}
      role="presentation"
    >
      <style>{`@keyframes tint-chomp { 0% { transform: scale(1, 1); } 40% { transform: scale(1.07, 0.93); } 100% { transform: scale(1, 1); } }`}</style>
      <div className="relative flex items-center justify-center" style={{ width: 240, height: 240 }}>
        {/* 食べ終わったあと、色が移るあいだ足もとにやわらかい光の輪が広がる */}
        <div
          className="absolute rounded-full"
          style={{
            width: 220,
            height: 220,
            background: `radial-gradient(circle, ${shizukuSwatchColor(info.toKey)}55 0%, transparent 70%)`,
            opacity: stage === 5 ? 1 : 0,
            transform: stage === 5 ? "scale(1.15)" : "scale(0.6)",
            transition: "opacity 900ms ease, transform 1400ms ease-out",
          }}
        />
        <div
          key={biting ? stage : "idle"}
          style={{
            filter: tintFilter(stage >= 5 ? info.toKey : info.fromKey, info.speciesCode),
            transition: "filter 1700ms ease-in-out, opacity 600ms ease",
            opacity: stage >= 6 ? 0 : 1,
            animation: biting ? "tint-chomp 260ms ease-out" : undefined,
          }}
        >
          <TankOccupant
            color="#52525b"
            sizeScale={visualScale}
            speciesCode={info.speciesCode}
            mandibleVariant={info.mandibleVariant}
            growthStage={info.growthStage}
          />
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element -- 自前SVGアート */}
        <img
          src="/roadmap/items/shizuku.svg"
          alt=""
          className="absolute left-1/2 h-14 w-14 object-contain"
          style={{
            top: 0,
            filter: tintFilter(info.toKey),
            transform:
              stage === 0
                ? "translate(calc(-50% - 60px), -140px) scale(1)"
                : `translate(calc(-50% - 60px), 135px) scale(${fruitScale})`,
            opacity: stage === 0 || stage >= 5 ? 0 : 1,
            transition:
              stage === 1
                ? "transform 1000ms cubic-bezier(0.3, 0, 0.5, 1), opacity 500ms ease"
                : "transform 180ms ease-out, opacity 300ms ease",
          }}
        />
      </div>
    </div>
  );
}

export function TankOccupant({
  color,
  sizeScale,
  speciesCode,
  mandibleVariant = 1,
  growthStage = "成虫",
  tintKey = null,
  rimKey = null,
}: {
  color: string;
  sizeScale: number;
  speciesCode?: string;
  mandibleVariant?: number;
  growthStage?: KuwagataGrowthStage;
  // 色の実で色づけしたシーンのキー（色づけなしはnull）。
  tintKey?: string | null;
  rimKey?: RimKey | null;
}) {
  const basePx = 28;
  const px = basePx * sizeScale;
  if (speciesCode && KNOWN_CREATURE_ART[speciesCode]) {
    return (
      <div
        className="relative"
        style={{ width: px, height: px, filter: individualFilter(tintKey, speciesCode, rimKey) }}
      >
        <KnownCreatureSprite
          code={speciesCode}
          facing="front"
          mandibleVariant={mandibleVariant}
          growthStage={growthStage}
        />
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

// 成虫のサイズレベル。緑系のゲージ(現在のレベル内の進み具合)とレベル表示。
// 成長日数のゲージ(アンバー・オレンジ・青)とは別の色にしてある。animateを付けると空から伸びる。
export function SizeGauge({
  level,
  ratio,
  animate = false,
  className = "w-9",
}: {
  level: number;
  ratio: number;
  animate?: boolean;
  className?: string;
}) {
  const [revealed, setRevealed] = useState(!animate);
  useEffect(() => {
    if (!animate) return;
    const timer = setTimeout(() => setRevealed(true), 250);
    return () => clearTimeout(timer);
  }, [animate]);

  const pct = Math.round(ratio * 100);
  return (
    <div className="flex flex-col items-center gap-0.5">
      <div
        role="progressbar"
        aria-label={`サイズLv${level}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className={`flex h-2 overflow-hidden rounded-full border border-zinc-400 bg-white ${className}`}
      >
        <div
          className="h-full bg-emerald-500 transition-[width] duration-700 ease-out"
          style={{ width: revealed ? `${pct}%` : 0 }}
        />
      </div>
      <span className="text-[9px] font-bold leading-none text-emerald-700">Lv{level}</span>
    </div>
  );
}

// 次の段階へ進むゲージ(卵・幼虫・蛹のとき)。1本のゲージを、経過日数で進んだ分(アンバー)・
// ログインのご褒美で進んだ分(オレンジ)・練習のご褒美で進んだ分(青)の3色で積み上げる。角丸で縁取り付き。
// animateBoostを付けると、ブースト分(青)が空の状態から伸びていく(練習のご褒美で成長した演出)。
export function GrowthGauge({
  gauge,
  animateBoost = false,
  className = "w-9",
}: {
  gauge: { elapsedRatio: number; loginBoostRatio: number; boostRatio: number };
  animateBoost?: boolean;
  className?: string;
}) {
  const [revealed, setRevealed] = useState(!animateBoost);
  useEffect(() => {
    if (!animateBoost) return;
    const timer = setTimeout(() => setRevealed(true), 250);
    return () => clearTimeout(timer);
  }, [animateBoost]);

  const elapsedPct = Math.round(gauge.elapsedRatio * 100);
  const loginPct = Math.round(gauge.loginBoostRatio * 100);
  const boostPct = Math.round(gauge.boostRatio * 100);
  return (
    <div
      role="progressbar"
      aria-label="次の段階までの成長"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={elapsedPct + loginPct + boostPct}
      className={`flex h-2 overflow-hidden rounded-full border border-zinc-400 bg-white ${className}`}
    >
      <div className="h-full bg-amber-400" style={{ width: `${elapsedPct}%` }} />
      <div className="h-full bg-orange-500" style={{ width: `${loginPct}%` }} />
      <div
        className="h-full bg-sky-600 transition-[width] duration-700 ease-out"
        style={{ width: revealed ? `${boostPct}%` : 0 }}
      />
    </div>
  );
}

// 拡大水槽表示の中だけは、他の表示箇所(棚のグリッド・リストなど)と違って固定pxではなく
// コンテナ幅に対する%でサイズを決める(デコレーションと同じ考え方)。ポップアップの大きさが
// 変わっても常に水槽とバランスが取れた大きさになる。individual.sizeScaleは、サイズレベル反映後の倍率。
// 倍率に比例させる（1.0倍＝水槽の幅の10%）ので、種類ごとのsize_scaleの差もレベルの差も、そのまま見た目に出る。
const CREATURE_WIDTH_PCT_PER_SCALE = 10;

function creatureWidthPct(sizeScale: number): number {
  return sizeScale * CREATURE_WIDTH_PCT_PER_SCALE;
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

// 水槽の「立体」の実測。底の面(back/right/left=平行四辺形の3頂点)に加えて、その面を真上に
// heightPct(コンテナの縦幅に対する%)だけ持ち上げたところが水面。テラリウムは水がないので0。
// 水の中を泳ぐ種は、底の面の点(u,v)に高さw(0=底〜1=水面)を足して3次元の位置を表す。
type TankGeometry = {
  back: { left: number; top: number };
  right: { left: number; top: number };
  left: { left: number; top: number };
  heightPct: number;
};

const TERRARIUM_GEOMETRY: TankGeometry = { ...TANK_SURFACE, heightPct: 0 };

// 水を張った水槽(tank_bg_aquarium.png＋tank_fg_aquarium.png)の実測座標。
// 底の砂利の天面は、奥の画像の砂利(明るい色の面)の連結領域から4頂点を抽出した平行四辺形
// (奥=back・右=right・左=left。手前の頂点はright+left-back)。水面は、手前の画像の水面(半透明の菱形)の
// 4頂点を抽出し、底の面を真上に持ち上げたものと一致するので、持ち上げ量(底と水面の縦の差)
// 27.3%(約141px/516px)をheightPctとしている。
const AQUARIUM_GEOMETRY: TankGeometry = {
  back: { left: 26.7, top: 31.0 },
  right: { left: 97.7, top: 60.1 },
  left: { left: 1.7, top: 62.4 },
  heightPct: 27.3,
};

// 古代の森(tank_bg_ancient.png)。水は張らず(heightPct=0)、地面の天面の実測は、水を張った水槽の底と同じ座標で描いてある。
const ANCIENT_GEOMETRY: TankGeometry = { ...AQUARIUM_GEOMETRY, heightPct: 0 };

// 置物・背景の障害物。u,v,widthPctは立体の置物(胴体の円にする)。screenがあれば、画面の%でそのまま指定した地面の障害物(足元の円と照合)。
type DecoSpot = { u: number; v: number; widthPct: number; screen?: { left: number; top: number; radius: number; water?: boolean } };
const staticCircle = (spot: DecoSpot, geo: TankGeometry): Obstacle =>
  spot.screen ? { pt: { left: spot.screen.left, top: spot.screen.top }, radius: spot.screen.radius, ground: true } : bodyCircle(surfacePoint(spot.u, spot.v, geo), spot.widthPct);

// 置物・背景のうち、通り抜けられる水場(川)と、ぶつかる障害物に分ける。
const solidSpotsOf = (spots: DecoSpot[]) => spots.filter((spot) => !spot.screen?.water);
const waterZonesOf = (spots: DecoSpot[]): Obstacle[] =>
  spots.filter((spot) => spot.screen?.water).map((spot) => ({ pt: { left: spot.screen!.left, top: spot.screen!.top }, radius: spot.screen!.radius }));
// 足元(pt)が水場の中か。円の縁ぎりぎりでは出さないよう、半径の0.92倍で判定する。
const isInWater = (pt: { left: number; top: number }, zones: Obstacle[]) => zones.some((z) => distPct(pt, z.pt) < z.radius * 0.92);
// 羽のある種(置物・背景は無視して通り抜ける。虫同士は今まで通りぶつかる)。
const NO_DECORATIONS: DecoSpot[] = [];
const WINGED_SPECIES_CODES = ["KW-0011", "KW-0012", "KW-0015", "KW-0016", "KW-0020", "KW-0025", "KW-0026", "KW-0027", "KW-0028", "KW-0045", "KW-0047", "KW-0049", "KW-0051", "KW-0053", "KW-0057"];

// 古代の森の背景絵の中の障害物(川・倒木・岩・シダ・植物)。生き物が川や倒木の上に立たないよう、置物と同じ扱いで避ける。
// 背景絵(688×516px)で見た位置と大きさを、そのまま画面の%(left=x/688, top=y/516, radius=半径px/688)で持つ。
// 地面にある平たい物なので、相手の足元の円と照合する(ground)。川(water)は通り抜けられる水場で、ぶつからず、足元に水しぶきが出る(円をつないで細長く表す)。
const ANCIENT_OBSTACLES: DecoSpot[] = [
  { u: 0, v: 0, widthPct: 0, screen: { left: 46.8, top: 78.5, radius: 3.5, water: true } }, // 川
  { u: 0, v: 0, widthPct: 0, screen: { left: 56.0, top: 79.5, radius: 4.7, water: true } }, // 川
  { u: 0, v: 0, widthPct: 0, screen: { left: 64.7, top: 78.5, radius: 6.1, water: true } }, // 川
  { u: 0, v: 0, widthPct: 0, screen: { left: 73.4, top: 75.2, radius: 6.7, water: true } }, // 川
  { u: 0, v: 0, widthPct: 0, screen: { left: 81.7, top: 68.6, radius: 6.7, water: true } }, // 川
  { u: 0, v: 0, widthPct: 0, screen: { left: 89.8, top: 63.2, radius: 4.9, water: true } }, // 川
  { u: 0, v: 0, widthPct: 0, screen: { left: 95.2, top: 61.6, radius: 3.2, water: true } }, // 川
  { u: 0, v: 0, widthPct: 0, screen: { left: 21.8, top: 61.0, radius: 2.9 } }, // 倒木
  { u: 0, v: 0, widthPct: 0, screen: { left: 26.9, top: 58.5, radius: 2.9 } }, // 倒木
  { u: 0, v: 0, widthPct: 0, screen: { left: 32.0, top: 56.2, radius: 2.6 } }, // 倒木
  { u: 0, v: 0, widthPct: 0, screen: { left: 63.5, top: 61.0, radius: 3.2 } }, // 岩
  { u: 0, v: 0, widthPct: 0, screen: { left: 71.2, top: 84.7, radius: 2.0 } }, // 手前の小さな岩
  { u: 0, v: 0, widthPct: 0, screen: { left: 34.2, top: 67.4, radius: 3.5 } }, // 丸まったシダ
  { u: 0, v: 0, widthPct: 0, screen: { left: 48.0, top: 50.8, radius: 4.9 } }, // 大きな葉の植物
  { u: 0, v: 0, widthPct: 0, screen: { left: 65.0, top: 49.4, radius: 1.5 } }, // 右の木の根もと
  { u: 0, v: 0, widthPct: 0, screen: { left: 78.5, top: 54.3, radius: 1.5 } }, // 右の木の根もと
];

// 平行四辺形なので back + u*(right-back) + v*(left-back) で底の面内の任意の点が求まる。
// u, vは0〜1だが、スプライトの見た目の大きさ分の余白を持たせるため呼び出し側では
// 0.12〜0.88程度の範囲に収めて「安全地帯」を作る。wは水中の高さ(0=底〜1=水面)。
function surfacePoint(u: number, v: number, geo: TankGeometry = TERRARIUM_GEOMETRY, w = 0): { left: number; top: number } {
  const left = geo.back.left + u * (geo.right.left - geo.back.left) + v * (geo.left.left - geo.back.left);
  const top = geo.back.top + u * (geo.right.top - geo.back.top) + v * (geo.left.top - geo.back.top) - w * geo.heightPct;
  return { left, top };
}

// 画面の位置(水槽に対する%)から、天面の(u,v)を求める(surfacePointの逆)。置物を置く位置の指定に使う。
function uvFromScreen(left: number, top: number, geo: TankGeometry = TERRARIUM_GEOMETRY): { u: number; v: number } | null {
  const a = geo.right.left - geo.back.left;
  const b = geo.left.left - geo.back.left;
  const c = geo.right.top - geo.back.top;
  const d = geo.left.top - geo.back.top;
  const det = a * d - b * c;
  if (Math.abs(det) < 1e-6) return null;
  const dl = left - geo.back.left;
  const dt = top - geo.back.top;
  const u = (dl * d - b * dt) / det;
  const v = (a * dt - c * dl) / det;
  const clamp = (n: number) => Math.min(0.92, Math.max(0.08, n));
  return { u: clamp(u), v: clamp(v) };
}

// 歩き回る・置かれる位置(u,v)の候補を、天面のほぼ全体(縁から0.08だけ内側)から選ぶ。
// ただし虫は幅の半分ほどが左右にはみ出すので、アンカーの横位置は水槽の端から
// 「虫の幅の約35%」以上内側に制限する(大きい虫ほど左右の端に寄れない)。
// 奥・手前の縁は、虫が縁の上に立って見えるだけなので制限しない。
const SPOT_EDGE_MARGIN = 0.08;
// 大きい個体ほど、足元が天面の縁に寄りすぎないよう縁から離す(足元の円の半径=幅の0.3倍ぶん)。
// 天面の平行四辺形は、(u,v)を1動かすと縁までの画面上の距離がそれぞれ約64・約29(横幅%相当)動く。
const SURFACE_EDGE_DEPTH_U = 64;
const SURFACE_EDGE_DEPTH_V = 29;
function pickRandomSpot(widthPct: number, random: () => number, geo: TankGeometry = TERRARIUM_GEOMETRY): { u: number; v: number } {
  const halfWidth = widthPct * 0.35;
  const foot = widthPct * 0.3;
  const marginU = Math.min(0.3, Math.max(SPOT_EDGE_MARGIN, foot / SURFACE_EDGE_DEPTH_U));
  const marginV = Math.min(0.3, Math.max(SPOT_EDGE_MARGIN, foot / SURFACE_EDGE_DEPTH_V));
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = {
      u: marginU + random() * (1 - 2 * marginU),
      v: marginV + random() * (1 - 2 * marginV),
    };
    const { left } = surfacePoint(candidate.u, candidate.v, geo);
    if (left >= halfWidth + 1 && left <= 99 - halfWidth) return candidate;
  }
  return { u: 0.5, v: 0.5 };
}

// クワたん・デコレーションの最初の置き場所(u,v)。
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
// 経路まで調べて行き先を選ぶときの候補数。経路チェックは距離計算が増えるので、行き先だけを見ていた頃より多めに試す。
const PATH_PICK_ATTEMPTS = 40;
// 到着後にその場で休んでいる間(ms)、動いている他個体の経路とぶつからないかも見る。
const PATH_REST_CHECK_MS = 3000;
// 歩く途中で何かに触れるとき、すぐ手前(経路の15%未満)で当たってしまう行き先は選びなおす回数と、その基準。
// それでも当たる向きしか無いときは、その場で(ほとんど動かずに)怒る。
const PLAN_RETRIES = 6;
const PLAN_MIN_HIT_FRAC = 0.15;
// ぶつかって止まったときの反応(怒る)の長さ、弾き返される長さ、最低限歩く時間。
const BUMP_MS = 1100;
// 触れたとみなして止まる距離(円の半径の和に対する割合)。1だと円どうしが触れた時点で止まるが、円は余裕をもたせて
// 大きめにしてあるので、絵が実際に触れていないのに止まって見える。小さくするほど近づけるが、絵が重なって見えやすくなる。
const BUMP_CONTACT_FACTOR = 0.85;
// ぶつかったときの反応。いまは当たり判定の確認用に、全ての個体が「！」を出して震える。
// 製品版では"none"(止まるだけ)を基本にして、フリー水槽で「仲の悪い種類どうしがぶつかったら怒って小競り合い」のように
// 相手(scanPathのhitWith)や種類によって反応を変える使い方を想定している。
// ぶつかったときの反応。none=何もしない / alert=「！」を出して震える(当たり判定の確認用) /
// angry=「💢」を出して全身を赤く光らせ、プンプン怒る(怒りっぽい種) / chat=おしゃべり(シャベクワたん)。
// 種類によって変えられる。将来「仲の悪い種類は小競り合い」なども、ここに足す。
type BumpReaction = "none" | "alert" | "angry" | "chat";
// 怒りっぽい種。ここに種類コードを足すと、ぶつかったときに「💢」で怒る。
// フルクワたん・トンたん(縄張り)・カブたん(押し相撲)・スズたん・オニたん・ヘルたん・サソたん・カマたん・グンたん
const ANGRY_SPECIES_CODES = ["KW-0008", "KW-0016", "KW-0014", "KW-0020", "KW-0028", "KW-0055", "KW-0031", "KW-0018", "KW-0033"];
const bumpReactionFor = (speciesCode: string): BumpReaction =>
  speciesCode === CHATTER_SPECIES_CODE ? "chat" : ANGRY_SPECIES_CODES.includes(speciesCode) ? "angry" : "alert";
// 怒っている間、全身にかける赤い光(影の赤い発光+赤みがかった色味)。
const ANGRY_FILTER = "drop-shadow(0 0 7px rgba(239,68,68,0.95)) drop-shadow(0 0 2px rgba(220,38,38,1)) sepia(0.45) saturate(3.5) hue-rotate(-50deg) brightness(1.08)";
const BUMP_RECOIL_MS = 260;
// ぶつかったときに弾き返される距離(予定していた道のりに対する割合の上限)。小さいほど反動が小さい(2026-10: 0.12→0.04)。
const BUMP_RECOIL_FRAC = 0.04;
const BUMP_MIN_WALK_MS = 500;

// 歩く速さ。移動時間(travelMs)=距離(横幅%相当)×TRAVEL_MS_PER_PCT を、MIN〜MAXの範囲に収める。
// 大きいほどゆっくり歩く(2026-10: 移動範囲を全面に広げて速く見えたため、固定7秒から距離比例に変更)。
const TRAVEL_MS_PER_PCT = 700;
// ハンたん: たまに弧を描いて素早く飛んで移動する。頻度は低め(移動のたびにLEAP_CHANCEの確率)、飛行時間はLEAP_MS。
const LEAP_SPECIES_CODE = "KW-0027";
// 飛ぶ間は羽根を広げた姿(airborneBody。脚は歩行用パーツをそのまま重ねる)に切り替わる。
const LEAP_CHANCE = 0.6;
const LEAP_MS = 1100;
// ハンたん: 羽根を広げてから実際に飛び立つまでの間(広げた姿で少し構える)。
const LEAP_WINDUP_MS = 450;
// ヘビたん: たまに羽ばたいて短い距離を飛ぶ(移動のたびにSNAKEFLY_CHANCEの確率)。距離はSNAKEFLY_MAX_DIST_PCT以下、飛行時間はSNAKEFLY_MS。
const SNAKEFLY_SPECIES_CODE = "KW-0047";
const SNAKEFLY_CHANCE = 0.4;
const SNAKEFLY_MS = 1800;
const SNAKEFLY_MAX_DIST_PCT = 30;
// コメたん: 歩いている途中で置物や他の個体にぶつかったら、その場で裏返ってじたばた(CLICK_FLIP_MS)し、
// パチンと跳ねて(CLICK_HOP_MS)近くに着地する。ぶつからない移動のときは普通に歩くだけ。
const CLICK_BEETLE_SPECIES_CODE = "KW-0048";
// コメたんの当たり判定: 絵から測った胴体の形(長軸が画面で「／」に約30度傾いた楕円。足元から幅の0.35倍上が中心)を、3つの円で近似。
const CLICK_BEETLE_SHAPE = ellipseShape(0, 0.35, 0.47, 0.26, 30);
// 成虫の胴体(脚・ツノを除く本体の絵。体が複数パーツの種類は全パーツ+頭)の外接枠から自動で測った値 [中心の右への位置, 中心の足元からの高さ, 半幅, 半高](どれも絵の幅に対する割合)。
// public/roadmap/kuwagata の *_front_body.svg の不透明部分から計算(絵を差し替えたら測り直す)。
const BODY_FIT: Record<string, [number, number, number, number]> = {
  "KW-0001": [0.00, 0.56, 0.42, 0.31],
  "KW-0002": [0.00, 0.58, 0.42, 0.33],
  "KW-0003": [0.05, 0.51, 0.40, 0.28],
  "KW-0004": [0.05, 0.60, 0.44, 0.40],
  "KW-0005": [0.00, 0.54, 0.42, 0.33],
  "KW-0006": [-0.02, 0.52, 0.37, 0.27],
  "KW-0007": [0.01, 0.53, 0.40, 0.27],
  "KW-0008": [0.06, 0.51, 0.43, 0.29],
  "KW-0009": [0.00, 0.51, 0.44, 0.32],
  "KW-0010": [0.00, 0.55, 0.44, 0.35],
  "KW-0011": [-0.15, 0.48, 0.33, 0.46],
  "KW-0012": [0.00, 0.40, 0.46, 0.34],
  "KW-0013": [-0.00, 0.52, 0.33, 0.48],
  "KW-0014": [-0.00, 0.54, 0.43, 0.33],
  "KW-0015": [-0.07, 0.42, 0.35, 0.37],
  "KW-0016": [0.03, 0.45, 0.45, 0.23],
  "KW-0017": [-0.00, 0.51, 0.49, 0.36],
  "KW-0018": [0.00, 0.57, 0.47, 0.40],
  "KW-0019": [0.03, 0.45, 0.45, 0.31],
  "KW-0020": [-0.01, 0.41, 0.48, 0.34],
  "KW-0021": [0.05, 0.53, 0.41, 0.34],
  "KW-0022": [-0.07, 0.44, 0.41, 0.29],
  "KW-0023": [0.03, 0.40, 0.44, 0.26],
  "KW-0024": [0.02, 0.52, 0.34, 0.26],
  "KW-0025": [0.10, 0.31, 0.39, 0.27],
  "KW-0026": [-0.15, 0.50, 0.33, 0.45],
  "KW-0027": [0.04, 0.44, 0.45, 0.30],
  "KW-0028": [0.02, 0.37, 0.43, 0.36],
  "KW-0029": [-0.01, 0.48, 0.40, 0.31],
  "KW-0030": [-0.00, 0.51, 0.49, 0.36],
  "KW-0031": [-0.02, 0.46, 0.35, 0.28],
  "KW-0032": [0.00, 0.38, 0.49, 0.30],
  "KW-0033": [-0.00, 0.59, 0.50, 0.31],
  "KW-0034": [0.07, 0.34, 0.40, 0.27],
  "KW-0035": [0.02, 0.51, 0.46, 0.40],
  "KW-0036": [-0.01, 0.49, 0.35, 0.26],
  "KW-0037": [-0.01, 0.50, 0.48, 0.24],
  "KW-0038": [0.01, 0.54, 0.34, 0.42],
  "KW-0039": [-0.03, 0.36, 0.38, 0.27],
  "KW-0044": [0.03, 0.45, 0.39, 0.29],
  "KW-0045": [-0.02, 0.36, 0.44, 0.30],
  "KW-0046": [-0.04, 0.39, 0.44, 0.22],
  "KW-0047": [-0.08, 0.42, 0.41, 0.29],
  "KW-0048": [-0.03, 0.33, 0.46, 0.27],
  "KW-0049": [-0.13, 0.47, 0.29, 0.32],
  "KW-0050": [0.00, 0.42, 0.32, 0.24],
  "KW-0051": [-0.09, 0.43, 0.23, 0.27],
  "KW-0052": [0.07, 0.44, 0.41, 0.42],
  "KW-0053": [-0.13, 0.45, 0.32, 0.31],
  "KW-0054": [-0.01, 0.51, 0.48, 0.36],
  "KW-0055": [0.01, 0.50, 0.49, 0.32],
  "KW-0056": [0.08, 0.52, 0.41, 0.36],
  "KW-0057": [0.02, 0.39, 0.37, 0.33],
  "KW-0058": [0.05, 0.38, 0.40, 0.32],
  "KW-0059": [0.05, 0.56, 0.42, 0.35],
  "KW-0060": [0.03, 0.49, 0.41, 0.32],
  "KW-0061": [0.01, 0.53, 0.40, 0.27],
  "KW-0062": [0.00, 0.51, 0.44, 0.32],
  "KW-0063": [0.03, 0.45, 0.45, 0.31],
  "KW-0064": [0.05, 0.53, 0.41, 0.34],
  "KW-0065": [0.07, 0.34, 0.40, 0.27],
  "KW-0066": [0.03, 0.45, 0.39, 0.29],
};
const BODY_FIT_MARGIN = 0.95;
// 種類ごとの当たり判定の形。成虫は胴体に合わせた楕円(横長は横に、縦長は縦に並べた3つの円)。
// コメたんとKW-0054は斜めに傾けた楕円を手で指定。測定値がない種類・成虫以外は丸(DEFAULT_BODY_SHAPE)。
// KW-0054(ヤスデ系)は、頭が左下・しっぽが右上へ「／」に伸びる体なので、コメたんと同様に斜めの楕円にする。
const MILLIPEDE_SHAPE = ellipseShape(0, 0.52, 0.46, 0.22, 30);
// 形は毎回同じ配列を返す(useWanderの依存に入るため、描画のたびに新しい配列を作ると、動きの計画が毎回やり直しになって動かなくなる)。
const bodyShapeCache = new Map<string, BodyShape>();
function bodyShapeFor(speciesCode: string, growthStage: KuwagataGrowthStage): BodyShape {
  const key = `${speciesCode}|${growthStage}`;
  let shape = bodyShapeCache.get(key);
  if (!shape) {
    shape = computeBodyShape(speciesCode, growthStage);
    bodyShapeCache.set(key, shape);
  }
  return shape;
}
function computeBodyShape(speciesCode: string, growthStage: KuwagataGrowthStage): BodyShape {
  if (growthStage !== "成虫") return DEFAULT_BODY_SHAPE;
  if (speciesCode === CLICK_BEETLE_SPECIES_CODE) return CLICK_BEETLE_SHAPE;
  if (speciesCode === "KW-0054") return MILLIPEDE_SHAPE;
  const fit = BODY_FIT[speciesCode];
  if (!fit) return DEFAULT_BODY_SHAPE;
  const [cx, cy, hw, hh] = fit;
  const w = hw * BODY_FIT_MARGIN;
  const h = hh * BODY_FIT_MARGIN;
  return w >= h ? ellipseShape(cx, cy, w, h, 0) : ellipseShape(cx, cy, h, w, 90);
}
const CLICK_FLIP_MS = 1800;
const CLICK_HOP_MS = 1000;
const CLICK_HOP_MAX_DIST_PCT = 20;
const CLICK_MIN_WALK_MS = 1200;
// ぶつかる地点へは、ふだんより速く突っ込む(距離1%あたりのms)。当たった勢いで少し弾き返される(CLICK_RECOIL_MS)。
const CLICK_DASH_MS_PER_PCT = 400;
const CLICK_RECOIL_MS = 260;
// 円の半径の和に対する「ぶつかった」とみなす距離の比。小さいほど、絵が実際に触れるくらいまで近づく。
const CLICK_CONTACT_FACTOR = 0.85;
// クジャクたん: 移動と移動の間に一定確率で、その場で正面を向いて求愛ダンス(COURT_MS)をする。
const COURT_SPECIES_CODE = "KW-0052";
const COURT_CHANCE = 0.4;
const COURT_MS = 4500;
const MIN_TRAVEL_MS = 7000;
const MAX_TRAVEL_MS = 30000;

// 天面(pickRandomSpotの範囲)をランダムに歩き回らせるためのフック。
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
  decorationSpots: DecoSpot[],
  positionsRef: { current: Record<string, WorldEntry> },
  travelScale = 1,
  leapChance = 0,
  chargeHopChance = 0,
  poseChance = 0,
  chargeMs = CHARGE_MS,
  hopMs = HOP_MOVE_MS,
  hopMaxDistPct = 30,
  restScale = 1,
  geo: TankGeometry = TERRARIUM_GEOMETRY,
  leapMs = LEAP_MS,
  leapMaxDistPct = Infinity,
  flipTrap = false,
  courtChance = 0,
  leapWindupMs = 0,
  shape: BodyShape = DEFAULT_BODY_SHAPE,
  bumpReaction: BumpReaction = "alert",
  chatTriggerRef?: { current: (() => void) | null },
  waterZones: Obstacle[] = []
): { wading: boolean; spot: { u: number; v: number }; facing: Facing; heading: Heading; travelMs: number; leaping: boolean; charging: boolean; posing: boolean; flipped?: boolean; hitting?: boolean; courting?: boolean; bumped?: boolean } {
  const [state, setState] = useState<{
    spot: { u: number; v: number };
    facing: Facing;
    heading: Heading;
    travelMs: number;
    // 弧を描いて飛んで移動している最中(着地したらfalseに戻る)
    leaping: boolean;
    // その場で力を溜めている最中(ツノたん。溜め終わると跳ねて移動する)
    charging: boolean;
    // 擬態ポーズ中(その場で止まって前脚を突き出す。ナナたん)
    posing: boolean;
    // ぶつかる地点へ向かって歩いている最中(コメたん。一定の速さで進む)
    hitting?: boolean;
    // ぶつかって裏返っている最中(コメたん)
    flipped?: boolean;
    // 求愛ダンス中(クジャクたん。その場で正面を向く)
    courting?: boolean;
    // 何かにぶつかって怒っている最中(その場で震えて「！」を出す)
    bumped?: boolean;
  }>({
    spot: initial,
    facing: "front",
    heading: "left",
    travelMs: MIN_TRAVEL_MS,
    leaping: false,
    charging: false,
    posing: false,
  });
  const stateRef = useRef(state);
  // 足元が水場(川)の中にいる間はtrue(水しぶきを出す)。
  const [wading, setWading] = useState(false);
  const wadingRef = useRef(false);

  useEffect(() => {
    const positions = positionsRef.current;
    positions[seedKey] = { ...initial, widthPct, shape };
    return () => {
      delete positions[seedKey];
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey, widthPct, shape]);

  useEffect(() => {
    if (!moves) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let leapTimer: ReturnType<typeof setTimeout> | undefined;
    let chargeTimer: ReturnType<typeof setTimeout> | undefined;
    let poseTimer: ReturnType<typeof setTimeout> | undefined;
    let flipTimer: ReturnType<typeof setTimeout> | undefined;
    let bumpTimer: ReturnType<typeof setTimeout> | undefined;
    // いまいる場所が水場なら、最初から水しぶきを出す。
    if (waterZones.length > 0) {
      const nowInWater = isInWater(surfacePoint(stateRef.current.spot.u, stateRef.current.spot.v, geo), waterZones);
      wadingRef.current = nowInWater;
      setWading(nowInWater);
    }
    // 他の個体にぶつかられたとき、こちらも「！」を出す(反応の種類はbumpReactionFor)。
    if (positionsRef.current[seedKey]) {
      positionsRef.current[seedKey].onBump = () => {
        if (cancelled) return;
        if (bumpReaction === "chat") {
          chatTriggerRef?.current?.();
          return;
        }
        if (bumpReaction !== "alert" && bumpReaction !== "angry") return;
        const alerted = { ...stateRef.current, bumped: true };
        stateRef.current = alerted;
        setState(alerted);
        if (bumpTimer) clearTimeout(bumpTimer);
        bumpTimer = setTimeout(() => {
          if (cancelled) return;
          const calm = { ...stateRef.current, bumped: false };
          stateRef.current = calm;
          setState(calm);
        }, BUMP_MS);
      };
    }
    // 置物は胴体の円にして判定する(個体も同じ式。tank-collision.tsのbodyCircle)。
    const decorationPts = decorationSpots.map((spot) => staticCircle(spot, geo));
    const othersList = () =>
      Object.entries(positionsRef.current)
        .filter(([id]) => id !== seedKey)
        .map(([id, entry]) => ({ entry, id }));

    // 次の行き先を決める。置物・他個体のどれとも、経路上(動いている相手の予定位置を含む)で触れない場所を優先して選ぶ。
    // opts: 出発までの待ち(delayMs)・距離から所要時間を出す関数(durOf)・イージング(ease)。
    // 触れずに行ける候補が無ければ、一番マシな候補を返す(lastSlack<0で呼び出し側が判断する)。
    type PickOpts = { delayMs?: number; durOf?: (distPct: number) => number; ease?: Ease };
    const walkDurOf = (d: number) =>
      Math.min(MAX_TRAVEL_MS * travelScale, Math.max(MIN_TRAVEL_MS * travelScale, d * TRAVEL_MS_PER_PCT * travelScale));
    let lastSlack = 0;
    const pickNextSpot = (opts: PickOpts = {}) => {
      const others = othersList();
      const from = surfacePoint(stateRef.current.spot.u, stateRef.current.spot.v, geo);
      const durOf = opts.durOf ?? walkDurOf;
      const ease = opts.ease ?? "inout";
      const startMs = Date.now() + (opts.delayMs ?? 0);
      let best = pickRandomSpot(widthPct, Math.random, geo);
      let bestSlack = -Infinity;
      for (let attempt = 0; attempt < PATH_PICK_ATTEMPTS; attempt++) {
        const candidate = pickRandomSpot(widthPct, Math.random, geo);
        const to = surfacePoint(candidate.u, candidate.v, geo);
        const { minSlack } = scanPath({
          proj: (u, v) => surfacePoint(u, v, geo),
          from,
          to,
          startMs,
          durMs: durOf(surfaceDistancePct(from, to)),
          ease,
          ownWidthPct: widthPct,
          ownShape: shape,
          statics: decorationPts,
          others,
          restMs: PATH_REST_CHECK_MS,
        });
        if (minSlack > bestSlack) {
          bestSlack = minSlack;
          best = candidate;
        }
        if (bestSlack >= 0) break; // 経路のどこでも触れない候補が見つかったので十分
      }
      lastSlack = bestSlack;
      return best;
    };
    // 出発から到着までを他個体に知らせる(動いている間の予定位置を、他個体が先回りして避けられるように)。
    // 移動の予定(出発点・終点・所要時間・イージング)から、足元が水場に入る・出る時刻を先に調べ、その時刻に水しぶきを出し入れする。
    const wadeTimers: ReturnType<typeof setTimeout>[] = [];
    const clearWadeTimers = () => {
      while (wadeTimers.length) clearTimeout(wadeTimers.pop());
    };
    const scheduleWading = (fromSpot: { u: number; v: number }, toSpot: { u: number; v: number }, delayMs: number, durMs: number, ease: Ease) => {
      if (waterZones.length === 0) return;
      clearWadeTimers();
      const a = surfacePoint(fromSpot.u, fromSpot.v, geo);
      const b = surfacePoint(toSpot.u, toSpot.v, geo);
      const steps = Math.max(4, Math.ceil(durMs / 120));
      let cur = wadingRef.current;
      for (let k = 0; k <= steps; k++) {
        const x = k / steps;
        const pr = progress(ease, x);
        const inside = isInWater({ left: a.left + (b.left - a.left) * pr, top: a.top + (b.top - a.top) * pr }, waterZones);
        if (inside === cur) continue;
        cur = inside;
        wadeTimers.push(
          setTimeout(() => {
            if (cancelled) return;
            wadingRef.current = inside;
            setWading(inside);
          }, delayMs + x * durMs),
        );
      }
    };
    const reserve = (fromSpot: { u: number; v: number }, toSpot: { u: number; v: number }, delayMs: number, durMs: number, ease: Ease) => {
      scheduleWading(fromSpot, toSpot, delayMs, durMs, ease);
      positionsRef.current[seedKey] = {
        onBump: positionsRef.current[seedKey]?.onBump,
        shape,
        u: toSpot.u,
        v: toSpot.v,
        widthPct,
        track: { fromU: fromSpot.u, fromV: fromSpot.v, t0: Date.now() + delayMs, durMs, ease },
      };
    };
    // 近めの着地点を選ぶ(跳ねる・飛ぶ距離の上限maxDist以内を優先)。触れずに行ける候補を優先し、その中で一番近いものを採る。
    const pickNear = (fromPt: { left: number; top: number }, maxDist: number, opts: PickOpts) => {
      let best = pickNextSpot(opts);
      let bestSlack = lastSlack;
      let bestDist = surfaceDistancePct(fromPt, surfacePoint(best.u, best.v, geo));
      for (let i = 0; i < 14 && (bestDist > maxDist || bestSlack < 0); i++) {
        const cand = pickNextSpot(opts);
        const slack = lastSlack;
        const d = surfaceDistancePct(fromPt, surfacePoint(cand.u, cand.v, geo));
        const better =
          bestSlack < 0 ? slack > bestSlack : slack >= 0 && d < bestDist;
        if (better) {
          best = cand;
          bestSlack = slack;
          bestDist = d;
        }
      }
      lastSlack = bestSlack;
      return best;
    };
    // 経路は見ず、行き先だけが置物・他個体と重ならない場所を選ぶ(コメたん用。わざとぶつかる経路を許すため)。
    const pickDestinationOnly = () => {
      const others = othersList();
      let best = pickRandomSpot(widthPct, Math.random, geo);
      let bestSlack = -Infinity;
      for (let attempt = 0; attempt < SPOT_PICK_ATTEMPTS; attempt++) {
        const candidate = pickRandomSpot(widthPct, Math.random, geo);
        const own = bodyCircles(surfacePoint(candidate.u, candidate.v, geo), widthPct, shape);
        let slack = Infinity;
        for (const d of decorationPts) slack = Math.min(slack, slackToStatic(surfacePoint(candidate.u, candidate.v, geo), widthPct, shape, d));
        for (const o of others) {
          // 相手の行き先(到着後の位置)から離れた場所を選ぶ。
          slack = Math.min(slack, circlesSlack(own, bodyCircles(surfacePoint(o.entry.u, o.entry.v, geo), o.entry.widthPct, o.entry.shape)));
        }
        if (slack > bestSlack) {
          bestSlack = slack;
          best = candidate;
        }
        if (bestSlack >= 0) break;
      }
      return best;
    };

    const goToNextSpot = () => {
      if (cancelled) return;
      // 更新関数の外で次の状態を決める(移動時間を、次のタイマーの待ち時間にも使うため)
      const prev = stateRef.current;
      if (poseChance > 0 && Math.random() < poseChance) {
        // その場で止まって擬態ポーズ(POSE_MS)。終わったら普通に歩き出す。
        const posing = { ...prev, leaping: false, charging: false, posing: true };
        stateRef.current = posing;
        setState(posing);
        poseTimer = setTimeout(() => {
          if (cancelled) return;
          const done = { ...stateRef.current, posing: false };
          stateRef.current = done;
          setState(done);
        }, POSE_MS);
        timer = setTimeout(goToNextSpot, POSE_MS + 1500 + Math.random() * 3000);
        return;
      }
      if (courtChance > 0 && Math.random() < courtChance) {
        // 求愛ダンス: その場で正面を向いて止まり(COURT_MS)、終わったら普通に歩き出す。
        const courting = { ...prev, facing: "front" as Facing, leaping: false, charging: false, posing: false, hitting: false, flipped: false, courting: true };
        stateRef.current = courting;
        setState(courting);
        flipTimer = setTimeout(() => {
          if (cancelled) return;
          const done = { ...stateRef.current, courting: false };
          stateRef.current = done;
          setState(done);
        }, COURT_MS);
        timer = setTimeout(goToNextSpot, COURT_MS + 1500 + Math.random() * 3000);
        return;
      }
      if (chargeHopChance > 0 && Math.random() < chargeHopChance) {
        // 近めの着地点を選ぶ(少し弧を描いて跳ねる距離)。その場で溜めてから跳ねる。
        const prevPt0 = surfacePoint(prev.spot.u, prev.spot.v, geo);
        const hopSpot = pickNear(prevPt0, hopMaxDistPct, { delayMs: chargeMs, durOf: () => hopMs, ease: "linear" });
        const charging = { ...prev, leaping: false, charging: true };
        stateRef.current = charging;
        setState(charging);
        chargeTimer = setTimeout(() => {
          if (cancelled) return;
          reserve(prev.spot, hopSpot, 0, hopMs, "linear");
          const toPt = surfacePoint(hopSpot.u, hopSpot.v, geo);
          const hx = toPt.left - prevPt0.left;
          const hy = toPt.top - prevPt0.top;
          const hopFacing: Facing = Math.abs(hy) >= Math.abs(hx) ? (hy >= 0 ? "front" : "back") : hx <= 0 ? "front" : "back";
          const hopHeading: Heading = hx === 0 ? prev.heading : hx < 0 ? "left" : "right";
          const hop = { spot: hopSpot, facing: hopFacing, heading: hopHeading, travelMs: hopMs, leaping: true, charging: false, posing: false };
          stateRef.current = hop;
          setState(hop);
          leapTimer = setTimeout(() => {
            if (cancelled) return;
            const landed = { ...stateRef.current, leaping: false };
            stateRef.current = landed;
            setState(landed);
          }, hopMs);
        }, chargeMs);
        timer = setTimeout(goToNextSpot, chargeMs + hopMs + 2000 + Math.random() * 5000);
        return;
      }
      const leaping = leapChance > 0 && Math.random() < leapChance;
      const prevPt = surfacePoint(prev.spot.u, prev.spot.v, geo);
      const flightOpts: PickOpts = { delayMs: leapWindupMs, durOf: () => leapMs, ease: "linear" };
      // 歩きは「先に動いて、触れる手前で止まる」。出発時に経路上の予定位置を調べ、触れる地点を求める
      // (飛ぶときは上を越えるので判定しない)。まっすぐ当たりに行く行き先は避けて、何度か選びなおす。
      type Plan = { spot: { u: number; v: number }; hitFrac: number | null; hitWith: { kind: "static" } | { kind: "other"; id?: string } | null; dashMs: number; ease: Ease };
      const planWalk = (spot: { u: number; v: number }): Plan => {
        const toPt = surfacePoint(spot.u, spot.v, geo);
        const dist = surfaceDistancePct(prevPt, toPt);
        const walkMs = Math.min(MAX_TRAVEL_MS * travelScale, Math.max(MIN_TRAVEL_MS * travelScale, dist * TRAVEL_MS_PER_PCT * travelScale));
        const dashMs = flipTrap ? Math.max(1, dist * CLICK_DASH_MS_PER_PCT * travelScale) : walkMs;
        const ease: Ease = flipTrap ? "linear" : "inout";
        const { hitFrac, hitWith } = scanPath({
          proj: (u, v) => surfacePoint(u, v, geo),
          from: prevPt,
          to: toPt,
          startMs: Date.now(),
          durMs: dashMs,
          ease,
          ownWidthPct: widthPct,
          ownShape: shape,
          statics: decorationPts,
          others: othersList(),
          factor: flipTrap ? CLICK_CONTACT_FACTOR : BUMP_CONTACT_FACTOR,
          mode: "hit",
        });
        return { spot, hitFrac, hitWith, dashMs, ease };
      };
      let plan: Plan;
      if (leaping) {
        const spot = Number.isFinite(leapMaxDistPct) ? pickNear(prevPt, leapMaxDistPct, flightOpts) : pickNextSpot(flightOpts);
        plan = { spot, hitFrac: null, hitWith: null, dashMs: leapMs, ease: "linear" };
      } else {
        const pickSpot = () => (flipTrap ? pickDestinationOnly() : pickNextSpot());
        plan = planWalk(pickSpot());
        for (let i = 0; i < PLAN_RETRIES && plan.hitFrac !== null && plan.hitFrac < PLAN_MIN_HIT_FRAC; i++) {
          const alt = planWalk(pickSpot());
          if (alt.hitFrac === null || alt.hitFrac > plan.hitFrac) plan = alt;
        }
      }
      const nextSpot = plan.spot;
      const nextPt = surfacePoint(nextSpot.u, nextSpot.v, geo);
      const dx = nextPt.left - prevPt.left;
      const dy = nextPt.top - prevPt.top;
      const facing: Facing = Math.abs(dy) >= Math.abs(dx) ? (dy >= 0 ? "front" : "back") : dx <= 0 ? "front" : "back";
      const heading: Heading = dx === 0 ? prev.heading : dx < 0 ? "left" : "right";
      if (!leaping && plan.hitFrac !== null) {
        // 触れる手前まで歩いて止まる。tc=経路上のどこで触れるか(0〜1)。
        const tc = progress(plan.ease, plan.hitFrac);
        const contactSpot = {
          u: prev.spot.u + (nextSpot.u - prev.spot.u) * tc,
          v: prev.spot.v + (nextSpot.v - prev.spot.v) * tc,
        };
        const contactPt = surfacePoint(contactSpot.u, contactSpot.v, geo);
        const walkMs = flipTrap
          ? Math.max(CLICK_MIN_WALK_MS, surfaceDistancePct(prevPt, contactPt) * CLICK_DASH_MS_PER_PCT * travelScale)
          : Math.max(BUMP_MIN_WALK_MS, plan.dashMs * plan.hitFrac);
        reserve(prev.spot, contactSpot, 0, walkMs, "linear");
        // 向きは、行き先ではなく実際に歩く(止まる地点までの)向きで決める。
        const cdx = contactPt.left - prevPt.left;
        const cdy = contactPt.top - prevPt.top;
        const hitFacing: Facing = Math.abs(cdy) >= Math.abs(cdx) ? (cdy >= 0 ? "front" : "back") : cdx <= 0 ? "front" : "back";
        const hitHeading: Heading = cdx === 0 ? prev.heading : cdx < 0 ? "left" : "right";
        const approach = { spot: contactSpot, facing: hitFacing, heading: hitHeading, travelMs: walkMs, leaping: false, charging: false, posing: false, hitting: true, flipped: false, bumped: false };
        stateRef.current = approach;
        setState(approach);
        flipTimer = setTimeout(() => {
          if (cancelled) return;
          // ぶつかった相手が他の個体なら、相手にも知らせる(相手も「！」を出す)。
          if (plan.hitWith?.kind === "other" && plan.hitWith.id) positionsRef.current[plan.hitWith.id]?.onBump?.();
          // 当たった勢いで、来た道を少し弾き返される。
          const rb = Math.min(BUMP_RECOIL_FRAC, tc * 0.2);
          const recoilSpot = {
            u: prev.spot.u + (nextSpot.u - prev.spot.u) * (tc - rb),
            v: prev.spot.v + (nextSpot.v - prev.spot.v) * (tc - rb),
          };
          if (!flipTrap) {
            // ふつうの個体: ぶつかって止まる。反応はbumpReactionFor(種類)で決まる(いまは確認用に「！」を出して震える)。
            reserve(contactSpot, recoilSpot, 0, BUMP_RECOIL_MS, "linear");
            if (bumpReaction === "chat") chatTriggerRef?.current?.();
            const angry = { ...stateRef.current, spot: recoilSpot, travelMs: BUMP_RECOIL_MS, hitting: true, bumped: bumpReaction === "alert" || bumpReaction === "angry" };
            stateRef.current = angry;
            setState(angry);
            flipTimer = setTimeout(() => {
              if (cancelled) return;
              const calm = { ...stateRef.current, hitting: false, bumped: false };
              stateRef.current = calm;
              setState(calm);
            }, BUMP_MS);
            return;
          }
          // コメたん: 弾き返されながら裏返ってじたばたし、パチンと跳ねる。
          reserve(contactSpot, recoilSpot, 0, CLICK_RECOIL_MS, "linear");
          const flippedState = { ...stateRef.current, spot: recoilSpot, travelMs: CLICK_RECOIL_MS, hitting: false, flipped: true };
          stateRef.current = flippedState;
          setState(flippedState);
          flipTimer = setTimeout(() => {
            if (cancelled) return;
            // パチン: 近めの着地点へ跳ねる(裏返しから元の姿に戻る)。
            const landing = pickNear(contactPt, CLICK_HOP_MAX_DIST_PCT, { durOf: () => CLICK_HOP_MS, ease: "linear" });
            reserve(recoilSpot, landing, 0, CLICK_HOP_MS, "linear");
            const landPt = surfacePoint(landing.u, landing.v, geo);
            const lx = landPt.left - contactPt.left;
            const ly = landPt.top - contactPt.top;
            const landFacing: Facing = Math.abs(ly) >= Math.abs(lx) ? (ly >= 0 ? "front" : "back") : lx <= 0 ? "front" : "back";
            const landHeading: Heading = lx === 0 ? heading : lx < 0 ? "left" : "right";
            const clicked = { spot: landing, facing: landFacing, heading: landHeading, travelMs: CLICK_HOP_MS, leaping: true, charging: false, posing: false, hitting: false, flipped: false };
            stateRef.current = clicked;
            setState(clicked);
            leapTimer = setTimeout(() => {
              if (cancelled) return;
              const landed = { ...stateRef.current, leaping: false };
              stateRef.current = landed;
              setState(landed);
            }, CLICK_HOP_MS);
          }, CLICK_FLIP_MS);
        }, walkMs);
        timer = setTimeout(
          goToNextSpot,
          flipTrap
            ? walkMs + CLICK_FLIP_MS + CLICK_HOP_MS + 2000 + Math.random() * 5000
            : walkMs + BUMP_MS + 1500 + Math.random() * 3500
        );
        return;
      }
      // 移動時間は距離に比例(歩く速さを一定に保つ)。移動範囲が広くても速くならない。
      // たまに(leapChance)、歩かずに速く弧を描いて飛んで移動する(着地まで LEAP_MS)。
      const travelMs = leaping
        ? leapMs
        : Math.min(
            MAX_TRAVEL_MS * travelScale,
            Math.max(MIN_TRAVEL_MS * travelScale, surfaceDistancePct(prevPt, nextPt) * TRAVEL_MS_PER_PCT * travelScale)
          );
      reserve(prev.spot, nextSpot, leaping ? leapWindupMs : 0, travelMs, leaping ? "linear" : "inout");
      const next = { spot: nextSpot, facing, heading, travelMs, leaping, charging: false, posing: false };
      stateRef.current = next;
      setState(next);
      if (leaping) {
        leapTimer = setTimeout(() => {
          if (cancelled) return;
          const landed = { ...stateRef.current, leaping: false };
          stateRef.current = landed;
          setState(landed);
        }, leapWindupMs + travelMs);
      }
      // 次の移動は、到着してからひと休みした後(休み2〜7秒)
      timer = setTimeout(goToNextSpot, (leaping ? leapWindupMs : 0) + travelMs + (2000 + Math.random() * 5000) * restScale);
    };

    // 個体ごとに最初の移動タイミングをズラす(同期して動くのを防ぐ)
    const firstDelay = 400 + (hashHue(seedKey) % 2200);
    timer = setTimeout(goToNextSpot, firstDelay);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (leapTimer) clearTimeout(leapTimer);
      if (chargeTimer) clearTimeout(chargeTimer);
      if (poseTimer) clearTimeout(poseTimer);
      if (flipTimer) clearTimeout(flipTimer);
      if (bumpTimer) clearTimeout(bumpTimer);
      clearWadeTimers();
      const entry = positionsRef.current[seedKey];
      if (entry) entry.onBump = undefined;
    };
  }, [seedKey, widthPct, shape, bumpReaction, chatTriggerRef, waterZones, moves, decorationSpots, positionsRef, travelScale, leapChance, chargeHopChance, poseChance, chargeMs, hopMs, hopMaxDistPct, restScale, geo, leapMs, leapMaxDistPct, flipTrap, courtChance, leapWindupMs]);

  return { ...state, wading };
}

// 水の中を泳ぐ種(動きの種類F)。ゲンたん。
const SWIMMER_SPECIES_CODES = ["KW-0039"];
const isSwimmer = (code: string) => SWIMMER_SPECIES_CODES.includes(code);
// 泳ぐ速さ(移動距離%あたりの時間)と、移動1回の時間の下限・上限。歩くより速い。
const SWIM_MS_PER_PCT = 330;
const MIN_SWIM_MS = 2600;
const MAX_SWIM_MS = 9000;
// 水面まで上がって息継ぎする確率(次の行き先が水面近くになる)。
const SWIM_SURFACE_CHANCE = 0.2;
// 底まで潜る確率(砂利のすぐ上を泳ぐ)。
const SWIM_BOTTOM_CHANCE = 0.2;

// 泳ぐ高さwの上限。スプライトの体が水面から出ないように、スプライトの高さ(コンテナの縦幅に対する%)から決める。
function swimMaxHeight(widthPct: number, geo: TankGeometry): number {
  const spriteHeightPct = widthPct * (4 / 3);
  return Math.min(0.9, Math.max(0.2, 1 - (spriteHeightPct * 0.6) / geo.heightPct));
}

type SwimSpot = { u: number; v: number; w: number };

// 水の中を泳ぎ回るためのフック。底の面(u,v)に高さw(0=底〜1=水面)を足した3次元の行き先を、
// 他の個体とぶつからない場所から選び、CSSのtransition(left/top)でそこまで滑るように泳がせる。
// 移動中だけmoving=trueになる(後ろ足の掻きはこの間だけ強く動かし、止まっている間はゆっくり揺らす)。
// 行き先はときどき水面(息継ぎ)や底のすぐ上になる。
function useSwim(
  seedKey: string,
  initial: { u: number; v: number },
  widthPct: number,
  enabled: boolean,
  positionsRef: { current: Record<string, WorldEntry> },
  geo: TankGeometry
): { spot: SwimSpot; facing: Facing; heading: Heading; travelMs: number; moving: boolean } {
  const [state, setState] = useState<{ spot: SwimSpot; facing: Facing; heading: Heading; travelMs: number; moving: boolean }>({
    spot: { ...initial, w: swimMaxHeight(widthPct, geo) * 0.5 },
    facing: "front",
    heading: "left",
    travelMs: MIN_SWIM_MS,
    moving: false,
  });
  const stateRef = useRef(state);

  useEffect(() => {
    if (!enabled) return;
    const positions = positionsRef.current;
    const wMax = swimMaxHeight(widthPct, geo);
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    let stopTimer: ReturnType<typeof setTimeout> | undefined;
    const ownRadius = spriteRadius(widthPct);
    const spriteHeightPct = widthPct * (4 / 3);
    const point = (s: SwimSpot) => surfacePoint(s.u, s.v, geo, s.w);
    positions[seedKey] = { ...stateRef.current.spot, widthPct };

    const pickNextSpot = (): SwimSpot => {
      const others = Object.entries(positions).filter(([id]) => id !== seedKey);
      let best: SwimSpot = stateRef.current.spot;
      let bestSlack = -Infinity;
      for (let attempt = 0; attempt < SPOT_PICK_ATTEMPTS; attempt++) {
        const uv = pickRandomSpot(widthPct, Math.random, geo);
        const roll = Math.random();
        const w = roll < SWIM_SURFACE_CHANCE ? wMax : roll < SWIM_SURFACE_CHANCE + SWIM_BOTTOM_CHANCE ? 0.04 : 0.1 + Math.random() * (wMax - 0.1);
        const candidate: SwimSpot = { ...uv, w };
        const pt = point(candidate);
        // 体の上端が画像の上にはみ出さない高さに限る。
        if (pt.top - spriteHeightPct * 0.9 < 1) continue;
        let slack = Infinity;
        for (const [, other] of others) {
          slack = Math.min(slack, surfaceDistancePct(pt, surfacePoint(other.u, other.v, geo, other.w ?? 0)) - (ownRadius + spriteRadius(other.widthPct)));
        }
        if (slack > bestSlack) {
          bestSlack = slack;
          best = candidate;
        }
        if (bestSlack >= 0) break;
      }
      return best;
    };

    const swimToNextSpot = () => {
      if (cancelled) return;
      const prev = stateRef.current;
      const next = pickNextSpot();
      positions[seedKey] = { ...next, widthPct };
      const prevPt = point(prev.spot);
      const nextPt = point(next);
      const dx = nextPt.left - prevPt.left;
      const dy = nextPt.top - prevPt.top;
      const facing: Facing = Math.abs(dy) >= Math.abs(dx) ? (dy >= 0 ? "front" : "back") : dx <= 0 ? "front" : "back";
      const heading: Heading = dx === 0 ? prev.heading : dx < 0 ? "left" : "right";
      const travelMs = Math.min(MAX_SWIM_MS, Math.max(MIN_SWIM_MS, surfaceDistancePct(prevPt, nextPt) * SWIM_MS_PER_PCT));
      const moving = { spot: next, facing, heading, travelMs, moving: true };
      stateRef.current = moving;
      setState(moving);
      stopTimer = setTimeout(() => {
        if (cancelled) return;
        const arrived = { ...stateRef.current, moving: false };
        stateRef.current = arrived;
        setState(arrived);
      }, travelMs);
      // 着いたら少しだけ漂ってから、次へ。
      timer = setTimeout(swimToNextSpot, travelMs + 800 + Math.random() * 2200);
    };

    timer = setTimeout(swimToNextSpot, 400 + (hashHue(seedKey) % 1800));
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (stopTimer) clearTimeout(stopTimer);
      delete positions[seedKey];
    };
  }, [seedKey, widthPct, enabled, positionsRef, geo]);

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
  decorationSpots: DecoSpot[],
  taken: { u: number; v: number; widthPct: number; shape: BodyShape }[],
  shape: BodyShape,
  geo: TankGeometry = TERRARIUM_GEOMETRY,
): { u: number; v: number } {
  const random = seededRandom(seedKey);
  const statics = decorationSpots.map((o) => staticCircle(o, geo));
  const others = taken.map((o) => bodyCircles(surfacePoint(o.u, o.v, geo), o.widthPct, o.shape));
  let best = { u: 0.5, v: 0.5 };
  let bestSlack = -Infinity;
  for (let attempt = 0; attempt < SPOT_PICK_ATTEMPTS * 8; attempt++) {
    const candidate = pickRandomSpot(widthPct, random, geo);
    const anchor = surfacePoint(candidate.u, candidate.v, geo);
    const own = bodyCircles(anchor, widthPct, shape);
    let slack = Infinity;
    for (const st of statics) slack = Math.min(slack, slackToStatic(anchor, widthPct, shape, st));
    for (const o of others) slack = Math.min(slack, circlesSlack(own, o));
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
// 定期の喋りの間隔。ぶつかったときの喋りを主役にするため、長め(2026-10: 15秒→45秒)。
const CHATTER_CYCLE_MS = 45000;
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
// triggerRefには「いますぐ喋る」関数を入れる(他の個体とぶつかったときに、定期の喋りとは別に喋らせる)。
function useChatter(enabled: boolean, seedKey: string, triggerRef?: { current: (() => void) | null }): ChatterBubble | null {
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
    if (triggerRef) {
      triggerRef.current = () => {
        if (cancelled) return;
        // いま喋っている最中でなければ喋る。喋り終えたら、定期の喋りに戻る(次の定期まで間隔をあける)。
        clearTimeout(timer);
        startChat();
      };
    }
    return () => {
      cancelled = true;
      clearTimeout(timer);
      if (triggerRef) triggerRef.current = null;
      setBubble(null);
    };
  }, [enabled, seedKey, triggerRef]);

  return bubble;
}

// フルクワたん(KW-0008)の「ファイティングポーズ」。本番に強い実践派らしく、12秒に1回・3秒間、
// 体を前にかがめて小刻みに構え、大顎をガチガチ開閉する。個体ごとに開始をずらして一斉には構えない。
const FIGHT_CYCLE_MS = 12000;
const FIGHT_DURATION_MS = 3000;
const FIGHT_SPECIES_CODE = "KW-0008";

// テッペンクワたん(KW-0004)の「てっぺんポーズ」。14秒に1回・3秒間、すっと背伸びして胸を張り、
// 頭上できらきらが瞬く。名前のとおり「てっぺんに立つ」堂々とした仕草。
const PROUD_CYCLE_MS = 14000;
const PROUD_DURATION_MS = 3000;
const PROUD_SPECIES_CODE = "KW-0004";
// タマたんもテッペンクワたんと同じ「大きくなる」ポーズをする。きらきらは黄・黄緑・緑・紫・赤紫のカラフルなランダム色。
const RAINBOW_SPARKLE_SPECIES_CODES = ["KW-0019", "KW-0029"]; // タマたん・ニシキたん
const RAINBOW_SPARKLE_COLORS = ["#facc15", "#a3e635", "#22c55e", "#a855f7", "#d946ef"];

// バッたん(KW-0009)の「ジャンプ」。バッタらしく、歩いている途中でときどき(8秒に1回)ぴょんと跳ぶ。
// 一瞬かがんで溜め→跳ね上がる→着地でぺちゃっと潰れる、1.1秒の動き。
const HOP_CYCLE_MS = 8000;
const HOP_DURATION_MS = 1100;
const HOP_SPECIES_CODE = "KW-0009";
// ウマたん(KW-0046)もジャンプする。うしろ脚(2パーツ)が2関節で蹴り出す。
const HOP_SPECIES_CODES = [HOP_SPECIES_CODE, "KW-0046"];
// ウマたんは、体の高さの約2倍まで跳ね上がる高いジャンプ(1.4秒。kuwagata-hop-high)。
const HIGH_HOP_SPECIES_CODE = "KW-0046";
const HIGH_HOP_DURATION_MS = 1400;

// カブたん(KW-0014)の「ツノ振り」。7秒に1回・1.6秒間、立派なツノを付け根を軸にゆっくり
// 振り上げて戻す(力強さのアピール)。個体ごとに開始をずらす。
const HORN_CYCLE_MS = 7000;
const HORN_DURATION_MS = 1600;
const HORN_SPECIES_CODE = "KW-0014";
// ナナたん(ナナフシ): 移動のたびに一定確率で、その場で止まって前脚(L1・R1)を頭方向へまっすぐ突き出す擬態ポーズ。
// タランたん(タランチュラ): 移動と移動の間に一定確率で、ピタッと止まって(STALK_MS)→パッと素早く短く飛びつく(POUNCE_MS)。
const POUNCE_SPECIES_CODE = "KW-0036";
const POUNCE_CHANCE = 0.4;
const STALK_MS = 900;
const POUNCE_MS = 120;
// 飛びつく距離の上限(棚の表面上の距離%)。短く。
const POUNCE_MAX_DIST_PCT = 14;
// ヒマたん(ヒマラヤジャンピングスパイダー): タランたんの待ち伏せ→飛びつきを使い回し、距離だけ少し長く(飛ぶ時間もそれに合わせて少し長く)。
const JUMPING_SPIDER_SPECIES_CODE = "KW-0050";
const JUMPING_SPIDER_MAX_DIST_PCT = 26;
const JUMPING_SPIDER_POUNCE_MS = 220;
const isPounce = (code: string) => code === POUNCE_SPECIES_CODE || code === JUMPING_SPIDER_SPECIES_CODE;
const MIMIC_SPECIES_CODE = "KW-0035";
const MIMIC_POSE_CHANCE = 0.4;
// 出す0.8秒＋キープ5秒＋戻す0.8秒
const POSE_MS = 6600;
// ツノたん(ツノゼミ): ツノを軽く振る(HORN_*と同じ)＋ときどき、溜め(体が赤くキラッ、キラッ)→跳ねる。
const HORN_SPECIES_CODE_2 = "KW-0034";
const CHARGE_HOP_SPECIES_CODE = "KW-0034";
// 移動のたびにこの確率で「その場で溜める(赤くキラッ)→少し弧を描いて跳ねて移動」を行う。
const CHARGE_HOP_CHANCE = 0.4;
const CHARGE_MS = 1400;
const HOP_MOVE_MS = 900;
const CHOMP_CYCLE_MS = 6000;
const CHOMP_DURATION_MS = 1500;
const CHOMP_SPECIES_CODE = "KW-0017";
const CHOMP_SPECIES_CODE_2 = "KW-0027"; // ハンたんも大顎をガチガチさせる
// サソたん: 尻尾(tale)をシュシュッ! と素早く打ち下ろす(残像つき)。ハサミ(claw)は左右交互にパクパク。
const TAIL_STRIKE_SPECIES_CODE = "KW-0031";
const TAIL_STRIKE_SPECIES_CODE_2 = "KW-0058";
const TAIL_STRIKE_CYCLE_MS = 5000;
const TAIL_STRIKE_DURATION_MS = 900;
// ヘラたん: ときどき大きくなり(テッペンクワたんと同じ=proud)、頭ごとツノを上下にガチガチ振り、体全体をキラッと光が走る。
const HERA_SPECIES_CODE = "KW-0032";
// コーたん(KW-0037)もヘラたんと同じ演出。
const isHera = (code: string) => code === HERA_SPECIES_CODE || code === "KW-0037";
const JAW_SHINE_SPECIES_CODE = "KW-0033"; // グンたん: ガチガチ中に大顎がキラッと光る
const CHOMP_SPECIES_CODE_3 = "KW-0030"; // ルリたん・スズたん・サワたん・グンたんも
const SHINE_CYCLE_MS = 5000;
const SHINE_DURATION_MS = 1300;
const SHINE_SPECIES_CODE = "KW-0030";
const SNIFF_CYCLE_MS = 5500;
const SNIFF_DURATION_MS = 1800;
const SNIFF_SPECIES_CODE = "KW-0021";
const SCYTHE_CYCLE_MS = 7000;
const SCYTHE_DURATION_MS = 1800;
const SCYTHE_SPECIES_CODE = "KW-0018";
const SCYTHE_TRAVEL_SCALE = 2.2;
// ミノたん(ミノムシ): 動きの種類E。糸でぶら下がり、動き回らず、糸の付け根を軸に振り子のようにぶらぶら揺れる。
const DANGLE_SPECIES_CODE = "KW-0013";
// ハナたん(ハナカマキリ): カマキリたんと同じく、あまり動き回らずゆらゆら揺れる。ときどき折りたたんだカマを0.12秒で伸ばして獲物を捕まえる。
const ORCHID_SPECIES_CODE = "KW-0038";
const GRAB_CYCLE_MS = 16000;
// ハナたんは動く頻度を減らす(休みの長さを何倍にするか)。
const ORCHID_REST_SCALE = 3.5;
const GRAB_DURATION_MS = 1300;
const isMantis = (code: string) => code === SCYTHE_SPECIES_CODE || code === ORCHID_SPECIES_CODE;
const STINK_CYCLE_MS = 9000;
const STINK_DURATION_MS = 2000;
const STINK_SPECIES_CODE = "KW-0022";
// ガスの粒(位置はスプライト内の%、px/pyは漂う量[px]、delayは出る順)
// 後ろ向きのときは、おしりが左下側にあるので、別の位置(STINK_PUFFS_BACK)から左へ漂う。
const STINK_PUFFS_BACK = [
  { left: "34%", top: "68%", px: -22, py: 18, size: 22, delay: 0.1 },
  { left: "28%", top: "60%", px: -30, py: 30, size: 28, delay: 0.35 },
  { left: "38%", top: "74%", px: -14, py: 24, size: 18, delay: 0.55 },
  { left: "24%", top: "68%", px: -34, py: 14, size: 20, delay: 0.8 },
  { left: "32%", top: "56%", px: -20, py: 40, size: 24, delay: 1.0 },
];
const STINK_PUFFS = [
  { left: "62%", top: "38%", px: 16, py: 34, size: 22, delay: 0.1 },
  { left: "55%", top: "30%", px: -10, py: 42, size: 28, delay: 0.35 },
  { left: "68%", top: "44%", px: 26, py: 26, size: 18, delay: 0.55 },
  { left: "48%", top: "36%", px: -22, py: 30, size: 20, delay: 0.8 },
  { left: "60%", top: "28%", px: 6, py: 50, size: 24, delay: 1.0 },
];

// 一定周期で短時間だけtrueになる仕草用のフック。開始は個体ごとにずらす。
function useTimedGesture(enabled: boolean, seedKey: string, cycleMs: number, durationMs: number): boolean {
  const [active, setActive] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const firstDelay = seededRandom(seedKey + ":gesture")() * (cycleMs - durationMs);

    const start = () => {
      if (cancelled) return;
      setActive(true);
      timer = setTimeout(() => {
        if (cancelled) return;
        setActive(false);
        timer = setTimeout(start, cycleMs - durationMs);
      }, durationMs);
    };

    timer = setTimeout(start, firstDelay);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setActive(false);
    };
  }, [enabled, seedKey, cycleMs, durationMs]);

  return active;
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
  waterZones,
  positionsRef,
  hasCompanions,
  geo,
  showCollision = false,
  tintKey = null,
  actions = [],
  debugAction = null,
  murmurs = [],
  rimKey = null,
  visitTargets = [],
  debugDeco = null,
}: {
  // 開発中の動作確認用: 指定した置物のところへ歩いて行き、置物アクションを今すぐ見せる。
  debugDeco?: { key: string; n: number } | null;
  seedKey: string;
  // 置物の位置。成虫はときどき歩いて行き、動きと一緒にそのシーンの表現をつぶやく。
  visitTargets?: { key: string; u: number; v: number; pattern: string; scene: string; widthPct: number }[];
  // 色の実で色づけしたシーンのキー（色づけなしはnull）。
  tintKey?: string | null;
  rimKey?: RimKey | null;
  // 見せられるアクション（成虫のみ）。
  actions?: ActionId[];
  // つぶやき(習得した表現)の候補。成虫だけが、ときどき吹き出しで英語をつぶやく。
  murmurs?: Murmur[];
  // 開発中の動作確認用: 指定したアクションを今すぐ見せる(nが変わるたびに発火)。
  debugAction?: { id: ActionId; n: number } | null;
  initialSpot: { u: number; v: number };
  widthPct: number;
  hasArt: boolean;
  speciesCode: string;
  mandibleVariant: number;
  growthStage: KuwagataGrowthStage;
  nickname: string | null;
  color: string;
  mirror: boolean;
  decorationSpots: DecoSpot[];
  // 通り抜けられる水場(川)。足元が入ると水しぶきが出る。
  waterZones: Obstacle[];
  positionsRef: { current: Record<string, WorldEntry> };
  // 同じ水槽に自分以外の個体がいるか(シャベクワたんの「喋る仕草」の条件)
  hasCompanions: boolean;
  // 当たり判定の円を重ねて表示する(確認用)。
  showCollision?: boolean;
  // この水槽の立体の実測(底の面と水面の高さ)。テラリウムとアクアリウムで違う。
  geo: TankGeometry;
}) {
  const muted = useSoundMuted();
  const chatTriggerRef = useRef<(() => void) | null>(null);
  const chatterBubble = useChatter(
    hasCompanions && speciesCode === CHATTER_SPECIES_CODE && growthStage === "成虫" && hasArt,
    seedKey,
    chatTriggerRef
  );
  const chatting = chatterBubble !== null;
  const fighting = useTimedGesture(
    speciesCode === FIGHT_SPECIES_CODE && growthStage === "成虫" && hasArt,
    seedKey + ":fight",
    FIGHT_CYCLE_MS,
    FIGHT_DURATION_MS
  );
  const proud = useTimedGesture(
    (speciesCode === PROUD_SPECIES_CODE || isHera(speciesCode) || RAINBOW_SPARKLE_SPECIES_CODES.includes(speciesCode)) && growthStage === "成虫" && hasArt,
    seedKey + ":proud",
    PROUD_CYCLE_MS,
    PROUD_DURATION_MS
  );
  const rainbowSparkle = RAINBOW_SPARKLE_SPECIES_CODES.includes(speciesCode);
  // タマたんのきらきら。ポーズのたびに、体の中心から放射状に飛び散る粒を作り直す(色・向き・距離・落ちる量がランダム)。
  const [sparkles, setSparkles] = useState<
    { color: string; dx: number; dy: number; fall: number; delay: number; size: number }[]
  >([]);
  useEffect(() => {
    if (!(proud && rainbowSparkle)) return;
    const count = 10;
    setSparkles(
      Array.from({ length: count }, (_, i) => {
        // 真上〜左右に広がる扇形(真下は除く)。粒ごとに角度を均等割り+ゆらぎ
        const angle = (-170 + (160 * i) / (count - 1) + (Math.random() - 0.5) * 16) * (Math.PI / 180);
        const dist = 34 + Math.random() * 26;
        return {
          color: RAINBOW_SPARKLE_COLORS[Math.floor(Math.random() * RAINBOW_SPARKLE_COLORS.length)],
          dx: Math.round(Math.cos(angle) * dist),
          dy: Math.round(Math.sin(angle) * dist),
          fall: 30 + Math.round(Math.random() * 24),
          delay: Math.round(Math.random() * 1600) / 1000,
          size: 12 + Math.round(Math.random() * 8),
        };
      })
    );
  }, [proud, rainbowSparkle]);
  const hopping = useTimedGesture(
    HOP_SPECIES_CODES.includes(speciesCode) && growthStage === "成虫" && hasArt,
    seedKey + ":hop",
    HOP_CYCLE_MS,
    speciesCode === HIGH_HOP_SPECIES_CODE ? HIGH_HOP_DURATION_MS : HOP_DURATION_MS
  );
  const hornSwing = useTimedGesture(
    (speciesCode === HORN_SPECIES_CODE || speciesCode === HORN_SPECIES_CODE_2) && growthStage === "成虫" && hasArt,
    seedKey + ":horn",
    HORN_CYCLE_MS,
    HORN_DURATION_MS
  );
  const chomping = useTimedGesture(
    (speciesCode === CHOMP_SPECIES_CODE || speciesCode === CHOMP_SPECIES_CODE_2 || speciesCode === CHOMP_SPECIES_CODE_3 || speciesCode === HORNET_SPECIES_CODE || speciesCode === "KW-0024" || speciesCode === "KW-0044" || speciesCode === "KW-0055" || speciesCode === "KW-0054" || speciesCode === "KW-0033" || speciesCode === SNAKEFLY_SPECIES_CODE || speciesCode === TAIL_STRIKE_SPECIES_CODE) && growthStage === "成虫" && hasArt,
    seedKey + ":chomp",
    CHOMP_CYCLE_MS,
    CHOMP_DURATION_MS
  );
  const shining = useTimedGesture(
    speciesCode === SHINE_SPECIES_CODE && growthStage === "成虫" && hasArt,
    seedKey + ":shine",
    SHINE_CYCLE_MS,
    SHINE_DURATION_MS
  );
  const striking = useTimedGesture(
    (speciesCode === TAIL_STRIKE_SPECIES_CODE || speciesCode === TAIL_STRIKE_SPECIES_CODE_2) && growthStage === "成虫" && hasArt,
    seedKey + ":strike",
    TAIL_STRIKE_CYCLE_MS,
    TAIL_STRIKE_DURATION_MS
  );
  const grabbing = useTimedGesture(
    speciesCode === ORCHID_SPECIES_CODE && growthStage === "成虫" && hasArt,
    seedKey + ":grab",
    GRAB_CYCLE_MS,
    GRAB_DURATION_MS
  );
  const sniffing = useTimedGesture(
    speciesCode === SNIFF_SPECIES_CODE && growthStage === "成虫" && hasArt,
    seedKey + ":sniff",
    SNIFF_CYCLE_MS,
    SNIFF_DURATION_MS
  );
  const scything = useTimedGesture(
    speciesCode === SCYTHE_SPECIES_CODE && growthStage === "成虫" && hasArt,
    seedKey + ":scythe",
    SCYTHE_CYCLE_MS,
    SCYTHE_DURATION_MS
  );
  const stinking = useTimedGesture(
    speciesCode === STINK_SPECIES_CODE && growthStage === "成虫" && hasArt,
    seedKey + ":stink",
    STINK_CYCLE_MS,
    STINK_DURATION_MS
  );
  const moves = !isStationaryStage(speciesCode, growthStage);
  const bodyShape = bodyShapeFor(speciesCode, growthStage);
  const swimmer = isSwimmer(speciesCode) && growthStage === "成虫";
  // 羽のある成虫は、置物・背景を無視して通り抜ける(虫同士は今まで通りぶつかる)。
  const ignoresStatics = growthStage === "成虫" && WINGED_SPECIES_CODES.includes(speciesCode);
  const walk = useWander(
    seedKey,
    initialSpot,
    widthPct,
    moves && !swimmer,
    ignoresStatics ? NO_DECORATIONS : decorationSpots,
    positionsRef,
    isDragonfly(speciesCode) ? DRAGONFLY_TRAVEL_SCALE : speciesCode === HORNET_SPECIES_CODE ? HORNET_TRAVEL_SCALE : isMantis(speciesCode) ? SCYTHE_TRAVEL_SCALE : 1,
    speciesCode === LEAP_SPECIES_CODE && growthStage === "成虫" ? LEAP_CHANCE : speciesCode === SNAKEFLY_SPECIES_CODE && growthStage === "成虫" ? SNAKEFLY_CHANCE : 0,
    growthStage === "成虫" ? (speciesCode === CHARGE_HOP_SPECIES_CODE ? CHARGE_HOP_CHANCE : isPounce(speciesCode) ? POUNCE_CHANCE : 0) : 0,
    speciesCode === MIMIC_SPECIES_CODE && growthStage === "成虫" ? MIMIC_POSE_CHANCE : 0,
    isPounce(speciesCode) ? STALK_MS : CHARGE_MS,
    speciesCode === JUMPING_SPIDER_SPECIES_CODE ? JUMPING_SPIDER_POUNCE_MS : speciesCode === POUNCE_SPECIES_CODE ? POUNCE_MS : HOP_MOVE_MS,
    speciesCode === JUMPING_SPIDER_SPECIES_CODE ? JUMPING_SPIDER_MAX_DIST_PCT : speciesCode === POUNCE_SPECIES_CODE ? POUNCE_MAX_DIST_PCT : 30,
    speciesCode === ORCHID_SPECIES_CODE ? ORCHID_REST_SCALE : 1,
    geo,
    speciesCode === SNAKEFLY_SPECIES_CODE ? SNAKEFLY_MS : LEAP_MS,
    speciesCode === SNAKEFLY_SPECIES_CODE ? SNAKEFLY_MAX_DIST_PCT : Infinity,
    speciesCode === CLICK_BEETLE_SPECIES_CODE && growthStage === "成虫",
    speciesCode === COURT_SPECIES_CODE && growthStage === "成虫" ? COURT_CHANCE : 0,
    speciesCode === LEAP_SPECIES_CODE ? LEAP_WINDUP_MS : 0,
    bodyShape,
    bumpReactionFor(speciesCode),
    chatTriggerRef,
    waterZones
  );
  // 水中を泳ぐ種は、歩く代わりに3次元(底〜水面)を泳ぎ回る。
  const swim = useSwim(seedKey, initialSpot, widthPct, moves && swimmer, positionsRef, geo);
  const { facing, heading, leaping, charging, posing } = swimmer ? { ...walk, ...swim, leaping: false, charging: false, posing: false } : walk;
  // 飛ぶ種は、羽根を広げた姿で少し構えてから、実際に位置が動き出す。
  const windupMs = leaping && speciesCode === LEAP_SPECIES_CODE ? LEAP_WINDUP_MS : 0;
  const flipped = !swimmer && !!walk.flipped;
  const hitting = !swimmer && !!walk.hitting;
  const courting = !swimmer && !!walk.courting;
  const bumped = !swimmer && !!walk.bumped;
  // 川の水しぶきは歩く種だけ(羽のある種は通り抜けるので出さない)。
  const wading = !swimmer && !ignoresStatics && walk.wading;
  // 怒りっぽい種は、ぶつかると「！」の代わりに「💢」を出して全身を赤く光らせる。
  const angryLook = bumpReactionFor(speciesCode) === "angry";
  const spot = swimmer ? swim.spot : walk.spot;
  const walkTravelMs = swimmer ? swim.travelMs : walk.travelMs;
  const swimming = swimmer && swim.moving;
  // 飛ぶ種は縦横で別のイージングにして、目的地まで直線ではなく滑らかな曲線(弧)を描いて飛ぶ。
  // 弧の向き(上に膨らむ/下に膨らむ)は目的地ごとに決まる。
  const flyingCurve = isCurveFlight(speciesCode) && growthStage === "成虫";
  const arcUp = Math.round(spot.u * 100 + spot.v * 100) % 2 === 0;
  const [actionId, setActionId] = useState<ActionId | null>(null);
  const [murmur, setMurmur] = useState<Murmur | null>(null);
  const [murmurOpen, setMurmurOpen] = useState(false);
  const murmurPrevRef = useRef<string | null>(null);
  const murmurHoldRef = useRef(false);
  const murmurCount = murmurs.length;
  const murmursRef = useRef(murmurs);
  murmursRef.current = murmurs;
  const tintKeyRef = useRef(tintKey);
  tintKeyRef.current = tintKey;
  useEffect(() => {
    if (growthStage !== "成虫" || murmurCount === 0) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const rnd = seededRandom(seedKey + ":murmur");
    const next = (first: boolean) => {
      const wait = first ? 6000 + rnd() * 20000 : 25000 + Math.random() * 25000;
      timer = setTimeout(() => {
        if (cancelled) return;
        const picked = pickMurmur(murmursRef.current, tintKeyRef.current, murmurPrevRef.current);
        if (!picked) return next(false);
        murmurPrevRef.current = picked.id;
        murmurHoldRef.current = false;
        setMurmurOpen(false);
        setMurmur(picked);
        timer = setTimeout(function hide() {
          if (cancelled) return;
          if (murmurHoldRef.current) {
            timer = setTimeout(hide, 2500);
            return;
          }
          setMurmur(null);
          next(false);
        }, 5000);
      }, wait);
    };
    next(true);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setMurmur(null);
    };
  }, [growthStage, murmurCount, seedKey]);
  const [visit, setVisit] = useState<{ left: number; top: number; ms: number } | null>(null);
  const [decoMotion, setDecoMotion] = useState<string | null>(null);
  const visitTargetsRef = useRef(visitTargets);
  visitTargetsRef.current = visitTargets;
  const visitCount = visitTargets.length;
  const triggerRef = useRef<((t: (typeof visitTargets)[number], walkFirst: boolean) => void) | null>(null);
  useEffect(() => {
    if (!debugDeco || debugDeco.n === 0) return;
    const t = visitTargetsRef.current.find((x) => x.key === debugDeco.key);
    if (t) triggerRef.current?.(t, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debugDeco?.n]);
  useEffect(() => {
    if (growthStage !== "成虫" || visitCount === 0) return;
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const later = (fn: () => void, ms: number) => {
      timers.push(setTimeout(() => !cancelled && fn(), ms));
    };
    // 置物の近くを通りかかったら反応する(近づいていくのではなく、通過中に判定)。
    let busy = false;
    let nextOkAt = Date.now() + 6000 + Math.random() * 8000;
    const startVisit = (t: (typeof visitTargets)[number], walkFirst: boolean) => {
      const me = document.querySelector(`[data-individual-id="${CSS.escape(seedKey)}"]`);
      if (!me) return;
      busy = true;
      // 置物のところまで歩いて行ってから始める(近くを通りかかった場合は短く、動作確認ボタンは少し長く)。
      // 飛び乗るは置物の真上、のぞくは置物の右、さわる・見回すは置物の左に立つ。
      const dur = walkFirst ? 1500 : 900;
      const walkMs = dur + 100;
      const p = surfacePoint(t.u, t.v, geo);
      const dx = t.pattern === "peek" ? t.widthPct * 0.5 : t.pattern === "hop-on" ? 0 : -t.widthPct * 0.55;
      setVisit({ left: p.left + dx, top: p.top, ms: dur });
      later(() => {
        // 1) その場で止まる(いまの表示位置に固定)。
        const parent = (me as HTMLElement).offsetParent as HTMLElement | null;
        const cs = getComputedStyle(me);
        if (parent && parent.clientWidth > 0) {
          setVisit({ left: (parseFloat(cs.left) / parent.clientWidth) * 100, top: (parseFloat(cs.top) / parent.clientHeight) * 100, ms: 0 });
        }
        // 2) 少し止まってから、伸び縮みする動きとつぶやき。
        later(() => {
          setDecoMotion(t.pattern);
          const picked = pickMurmur(murmursRef.current, t.scene, murmurPrevRef.current);
          if (picked) {
            murmurPrevRef.current = picked.id;
            murmurHoldRef.current = false;
            setMurmurOpen(false);
            setMurmur(picked);
          }
          later(() => setDecoMotion(null), 2800);
          later(function leave() {
            if (murmurHoldRef.current) return void later(leave, 2000);
            setMurmur(null);
            setVisit(null);
            busy = false;
            nextOkAt = Date.now() + 30000 + Math.random() * 30000;
          }, 5800);
        }, 800);
      }, walkMs);
    };
    triggerRef.current = startVisit;
    const poll = setInterval(() => {
      if (cancelled || busy || Date.now() < nextOkAt) return;
      const me = document.querySelector(`[data-individual-id="${CSS.escape(seedKey)}"]`);
      if (!me) return;
      const mr = me.getBoundingClientRect();
      const mx = mr.left + mr.width / 2;
      const my = mr.bottom;
      let hit: (typeof visitTargets)[number] | null = null;
      for (const t of visitTargetsRef.current) {
        const el = document.querySelector(`[data-deco-key="${CSS.escape(t.key)}"]`);
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const dx = mx - (r.left + r.width / 2);
        const dy = my - r.bottom;
        if (Math.hypot(dx, dy) < Math.max(r.width, mr.width) * 0.9) {
          hit = t;
          break;
        }
      }
      if (!hit) return;
      startVisit(hit, false);
    }, 500);
    timers.push(poll as unknown as ReturnType<typeof setTimeout>);
    return () => {
      cancelled = true;
      timers.forEach((t) => { clearTimeout(t); clearInterval(t as unknown as ReturnType<typeof setInterval>); });
      setVisit(null);
      setDecoMotion(null);
    };
  }, [growthStage, visitCount, seedKey]);
  const pt = visit ? { left: visit.left, top: visit.top } : surfacePoint(spot.u, spot.v, geo, swimmer ? swim.spot.w : 0);
  const travelMs = visit ? visit.ms : walkTravelMs;
  const tapMurmur = async () => {
    if (!murmur) return;
    // 開いている吹き出しをもう一度タップしたら、閉じる。
    if (murmurOpen) {
      murmurHoldRef.current = false;
      setMurmurOpen(false);
      setMurmur(null);
      return;
    }
    murmurHoldRef.current = true;
    setMurmurOpen(true);
    // ミュート中は日本語訳だけ出して、音声は鳴らさない。
    if (muted) return;
    try {
      const res = await fetch(`/api/roadmap/kuwagata/murmur-audio?id=${encodeURIComponent(murmur.id)}`);
      if (!res.ok) return;
      const json = (await res.json()) as { url?: string };
      if (json.url) await new Audio(json.url).play();
    } catch {
      // 音が出なくても、訳は出ているので何もしない
    }
  };

  const debugN = debugAction?.n ?? 0;
  const debugId = debugAction?.id ?? null;
  useEffect(() => {
    if (!debugId || debugN === 0 || growthStage !== "成虫") return;
    setActionId(debugId);
    const t = setTimeout(() => setActionId(null), ACTIONS[debugId].durationMs);
    return () => clearTimeout(t);
  }, [debugN, debugId, growthStage]);
  const actionKey = actions.join(",");
  useEffect(() => {
    if (growthStage !== "成虫" || !actionKey) return;
    const list = actionKey.split(",") as ActionId[];
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const rnd = seededRandom(seedKey + ":action");
    const schedule = () => {
      timer = setTimeout(() => {
        if (cancelled) return;
        const id = list[Math.floor(Math.random() * list.length)];
        setActionId(id);
        timer = setTimeout(() => {
          if (cancelled) return;
          setActionId(null);
          schedule();
        }, ACTIONS[id].durationMs);
      }, 9000 + Math.random() * 14000);
    };
    timer = setTimeout(schedule, rnd() * 6000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      setActionId(null);
    };
  }, [actionKey, growthStage, seedKey]);

  const straightFlight = isDragonfly(speciesCode) && growthStage === "成虫";
  // 泳ぐ種は、掻いて勢いよく出て、だんだん減速して止まる(ゆっくり漂うように着く)。
  const moveTransition = swimmer
    ? `left ${travelMs}ms cubic-bezier(0.25, 0.6, 0.3, 1), top ${travelMs}ms cubic-bezier(0.25, 0.6, 0.3, 1)`
    : flipped
    ? `left ${travelMs}ms ease-out, top ${travelMs}ms ease-out`
    : leaping || hitting
    ? `left ${travelMs}ms linear ${windupMs}ms, top ${travelMs}ms linear ${windupMs}ms`
    : straightFlight
    ? `left ${travelMs}ms linear, top ${travelMs}ms linear`
    : flyingCurve
    ? `left ${travelMs}ms cubic-bezier(0.45, 0, 0.55, 1), top ${travelMs}ms ${
        arcUp ? "cubic-bezier(0.3, 0, 0.2, 1)" : "cubic-bezier(0.8, 0, 0.7, 1)"
      }`
    : `left ${travelMs}ms ease-in-out, top ${travelMs}ms ease-in-out`;

  return (
    <div
      data-individual-id={seedKey}
      className="absolute -translate-y-full"
      style={{
        left: `${pt.left}%`,
        top: `${pt.top}%`,
        width: `${widthPct}%`,
        aspectRatio: hasArt ? "1 / 1" : undefined,
        filter: individualFilter(tintKey, speciesCode, rimKey),
        transition: moveTransition,
        // 実アートは左右反転しない(反転すると脚の左右が逆になってしまうため)。
        // Bugアイコンのフォールバックのみ、個体ごとに左右反転して向きにバリエーションを出す。
        transform: mirror ? "translateX(-50%) translateY(-100%) scaleX(-1)" : "translateX(-50%) translateY(-100%)",
      }}
    >
      {hasArt ? (
        <div
          className="relative h-full w-full"
          style={actionId ? { animation: `kw-act-${actionId} ${ACTIONS[actionId].durationMs}ms ease-in-out` } : decoMotion ? { animation: `kw-deco-${decoMotion} 2800ms ease-in-out`, transformOrigin: "50% 100%" } : undefined}
        >
        <div
          className={`h-full w-full ${bumped ? "animate-kuwagata-bump" : ""} ${chatting ? "animate-kuwagata-chat" : ""} ${fighting ? "animate-kuwagata-fight" : ""} ${proud ? "animate-kuwagata-proud" : ""} ${hopping ? (speciesCode === HIGH_HOP_SPECIES_CODE ? "animate-kuwagata-hop-high" : "animate-kuwagata-hop") : ""} ${charging ? (isPounce(speciesCode) ? "animate-kuwagata-stalk" : "animate-kuwagata-charge") : ""} ${stinking ? "animate-kuwagata-stink" : ""}`}
          style={leaping || (bumped && angryLook) ? { filter: bumped && angryLook ? ANGRY_FILTER : undefined, animation: leaping ?  `${isPounce(speciesCode) ? "kuwagata-pounce" : speciesCode === SNAKEFLY_SPECIES_CODE ? "kuwagata-fly-short" : speciesCode === CLICK_BEETLE_SPECIES_CODE ? "kuwagata-click-leap" : "kuwagata-leap"} ${travelMs}ms linear ${windupMs}ms` : undefined } : undefined}
        >
          <KnownCreatureSprite
            fighting={fighting}
            hornSwing={hornSwing}
            charge={charging}
            mimic={posing}
            still={charging && isPounce(speciesCode)}
            grab={grabbing}
            chomp={chomping}
            sniff={sniffing}
            scythe={scything}
            shine={shining || (isHera(speciesCode) && proud)}
            strike={striking}
            swim={swimming}
            hop={hopping}
            airborne={leaping}
            flipped={flipped}
            courting={courting}
            code={speciesCode}
            facing={facing}
            mandibleVariant={mandibleVariant}
            growthStage={growthStage}
            heading={heading}
            phaseSeed={seedKey}
          />
        </div>
          {(actionId === "sp-silver" || actionId === "sp-gold") && (
            // ぎんぎら/こがねの舞: 体のまわりに光の輪と✦が次々に弾ける(金は数も量も多め)
            <span className="pointer-events-none absolute inset-0">
              <span className={actionId === "sp-gold" ? "kw-flash-ring kw-flash-ring-gold" : "kw-flash-ring kw-flash-ring-silver"} />
              {Array.from({ length: actionId === "sp-gold" ? 14 : 9 }).map((_, i, arr) => {
                const ang = (i / arr.length) * Math.PI * 2;
                const rad = 62 + (i % 3) * 12;
                return (
                  <span
                    key={i}
                    className="kw-flash-star"
                    style={
                      {
                        color: actionId === "sp-gold" ? "#ffd24a" : "#eaf3ff",
                        textShadow: `0 0 6px ${actionId === "sp-gold" ? "#ffb300" : "#9fc4ff"}`,
                        "--fx": `${Math.cos(ang) * rad}%`,
                        "--fy": `${Math.sin(ang) * rad * 0.8}%`,
                        animationDelay: `${(i % 5) * 0.25}s`,
                      } as CSSProperties
                    }
                  >
                    ✦
                  </span>
                );
              })}
            </span>
          )}
          {(actionId === "sp-daily" || actionId === "sp-business" || actionId === "sp-limited") && (
            // ほっこり(ハートとお花)/キリッ(青い光とキラリ)/きらきらダンス(虹色の紙吹雪): 光の輪と飾りがあふれる
            <span className="pointer-events-none absolute inset-0">
              <span className={`kw-flash-ring kw-flash-ring-${actionId === "sp-daily" ? "pink" : actionId === "sp-business" ? "blue" : "rainbow"}`} style={actionId === "sp-limited" ? undefined : { opacity: 0, animationName: actionId === "sp-daily" ? "kw-soft-ring" : "kw-flash-ring", animationDuration: actionId === "sp-daily" ? "2400ms" : "1000ms", filter: actionId === "sp-business" ? "opacity(.45)" : "opacity(.55)" }} />
              {Array.from({ length: actionId === "sp-limited" ? 16 : actionId === "sp-daily" ? 6 : 11 }).map((_, i, arr) => {
                const ang = (i / arr.length) * Math.PI * 2;
                const rad = 62 + (i % 3) * 12;
                const glyphs = actionId === "sp-daily" ? ["♥", "✿", "♥"] : actionId === "sp-business" ? ["✦", "◆", "✦"] : ["★", "✦", "●", "♪"];
                const colors =
                  actionId === "sp-daily"
                    ? ["#ff7eb0", "#ffb3cf", "#ff5c9a"]
                    : actionId === "sp-business"
                    ? ["#4aa8ff", "#a8d8ff", "#2f7de0"]
                    : ["#ff6b6b", "#ffd93d", "#6bcbff", "#c77dff", "#6bff9e"];
                const color = colors[i % colors.length];
                return (
                  <span
                    key={i}
                    className={actionId === "sp-daily" ? "kw-soft-float" : "kw-flash-star"}
                    style={
                      {
                        color,
                        textShadow: `0 0 6px ${color}`,
                        ...(actionId === "sp-daily" ? { opacity: 0 } : {}),
                        fontSize: actionId === "sp-limited" ? 16 : 18,
                        "--fx": `${Math.cos(ang) * rad}%`,
                        "--fy": `${Math.sin(ang) * rad * 0.8 - (actionId === "sp-daily" ? 12 : 0)}%`,
                        animationDelay: actionId === "sp-daily" ? `${i * 0.4}s` : `${(i % 6) * 0.22}s`,
                      } as CSSProperties
                    }
                  >
                    {glyphs[i % glyphs.length]}
                  </span>
                );
              })}
            </span>
          )}
          {actionId === "radio" && (
            // テレクワたん: 体の上から、電波の弧が3本、順に広がって消える
            <span className="pointer-events-none absolute" style={{ left: "46%", top: "30%", width: 0, height: 0 }}>
              {[0, 1, 2].map((i) => (
                <span key={i} className="kw-radio-wave" style={{ animationDelay: `${0.2 + i * 0.35}s` }} />
              ))}
            </span>
          )}
          {actionId === "stomp" && (
            // ネゴクワたん: ドシンと踏みしめるたびに、足元から地鳴りの輪が広がる(3回)
            <span className="pointer-events-none absolute inset-x-0" style={{ bottom: "6%", height: 0 }}>
              {[0, 1, 2].map((i) => (
                <span key={i} className="kw-stomp-ring" style={{ animationDelay: `${0.3 + i * 0.5}s` }} />
              ))}
            </span>
          )}
          {actionId === "beam" && (
            // プレクワたん: 額の緑のマル(正面の絵で左から約36%・上から約51%)から、顔の向き(左下)へビームを出す
            // 背面のときは、頭(右側)から逆向き(右へ)に出す
            <span
              className="pointer-events-none absolute"
              style={{ left: facing === "back" ? "84%" : "36%", top: facing === "back" ? "44%" : "51%", width: 0, height: 0 }}
            >
              <span className="kw-beam-charge" />
              <span className="kw-beam-ray" style={facing === "back" ? { rotate: "-25deg" } : undefined} />
            </span>
          )}
        </div>
      ) : (
        <Bug className="block w-full h-auto drop-shadow-sm" style={{ color }} strokeWidth={1.75} />
      )}
      {murmur && (
        // つぶやき: 頭の上に英文の吹き出し。タップで音声が鳴り、日本語訳が出る。
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            void tapMurmur();
          }}
          data-murmur-bubble="1"
          className={`kw-murmur absolute z-20 w-max max-w-[11rem] rounded-xl border px-2 py-1 text-left text-[11px] leading-tight shadow-md ${visit ? "border-amber-300 bg-amber-50 text-amber-900" : "border-zinc-200 bg-white text-zinc-700"}`}
          style={{ left: "50%", bottom: "100%", transform: "translateX(-50%)" }}
        >
          <span className="block font-semibold">{murmur.en}</span>
          {murmurOpen && <span className="mt-0.5 block text-[10px] text-zinc-500">{murmur.ja}</span>}
        </button>
      )}
      {wading && (
        // 川の中を歩いている間の水しぶき: 体の左右の外側へ、足元から小さな水玉が弧を描いて跳ね上がる。
        <div className="pointer-events-none absolute inset-x-0 z-[5]" style={{ bottom: "2%", height: "20%" }}>
          {[
            { side: "left", x: "20%", delay: 0, size: 6 },
            { side: "left", x: "27%", delay: 0.35, size: 5 },
            { side: "right", x: "20%", delay: 0.18, size: 6 },
            { side: "right", x: "27%", delay: 0.53, size: 5 },
          ].map((drop) => (
            <span
              key={`${drop.side}-${drop.x}`}
              className={`${drop.side === "left" ? "animate-kuwagata-splash-left" : "animate-kuwagata-splash-right"} absolute rounded-full bg-sky-200 ring-1 ring-white`}
              style={{ [drop.side]: drop.x, bottom: 0, width: `${drop.size}%`, aspectRatio: "1 / 1", animationDelay: `${drop.delay}s` }}
            />
          ))}
        </div>
      )}
      {showCollision && (
        // 当たり判定の確認用。足元(この枠の下端中央)から胴体の円を描く: 青=避ける広さ、赤=この距離まで近づくと止まる。
        // 中心は足元から幅の0.4倍だけ上、半径は幅の0.5倍(tank-collision.tsのBODY_*)。枠は幅=高さなので円は真円になる。
        <>
          <span
            className="pointer-events-none absolute rounded-full border-2 border-emerald-600/80"
            style={{ left: `${(0.5 - FOOT_RADIUS_FACTOR) * 100}%`, top: `${(1 - FOOT_RISE_FACTOR - FOOT_RADIUS_FACTOR) * 100}%`, width: `${FOOT_RADIUS_FACTOR * 200}%`, height: `${FOOT_RADIUS_FACTOR * 200}%` }}
          />
          {bodyShape.map((c, i) => (
            <span key={i}>
              <span
                className="pointer-events-none absolute rounded-full border-2 border-sky-500/80 bg-sky-400/10"
                style={{ left: `${(0.5 + c.dx - c.r) * 100}%`, top: `${(1 - c.dy - c.r) * 100}%`, width: `${c.r * 200}%`, height: `${c.r * 200}%` }}
              />
              <span
                className="pointer-events-none absolute rounded-full border-2 border-dashed border-red-500/80"
                style={{ left: `${(0.5 + c.dx - c.r * BUMP_CONTACT_FACTOR) * 100}%`, top: `${(1 - c.dy - c.r * BUMP_CONTACT_FACTOR) * 100}%`, width: `${c.r * BUMP_CONTACT_FACTOR * 200}%`, height: `${c.r * BUMP_CONTACT_FACTOR * 200}%` }}
              />
            </span>
          ))}
        </>
      )}
      {bumped && (
        // ぶつかって怒っている間だけ出る「！」(怒りっぽい種は「💢」)。名前ラベルより手前に出す。
        angryLook ? (
          <span
            className="animate-question-card-enter pointer-events-none absolute z-20 flex h-7 w-7 items-center justify-center text-[22px] leading-none"
            style={{ left: "62%", top: "2%", transform: "translateY(-100%)" }}
          >
            💢
          </span>
        ) : (
          <span
            className="animate-question-card-enter pointer-events-none absolute z-20 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[15px] font-black leading-none text-red-500 shadow-sm"
            style={{ left: "62%", top: "2%", transform: "translateY(-100%)" }}
          >
            !
          </span>
        )
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
      {proud &&
        !rainbowSparkle &&
        // てっぺんポーズ中だけ頭上で瞬くきらきら(位置・タイミングを少しずつずらした3つ)
        [
          { left: "-6%", top: "14%", delay: "0s" },
          { left: "88%", top: "8%", delay: "0.5s" },
          { left: "96%", top: "34%", delay: "1s" },
        ].map((sp, i) => (
          <span
            key={i}
            className="animate-egg-twinkle pointer-events-none absolute z-20 text-[18px] leading-none text-amber-300"
            style={{
              left: sp.left,
              top: sp.top,
              animationDelay: sp.delay,
              textShadow: "0 0 3px #b45309, 0 0 1px #b45309",
            }}
          >
            ✦
          </span>
        ))}
      {proud &&
        rainbowSparkle &&
        // タマたん: 体の中心から放射状に飛び散り、最後は重力で落ちながら消えるきらきら
        sparkles.map((sp, i) => (
          <span
            key={i}
            className="animate-kuwagata-sparkle-burst pointer-events-none absolute z-20 leading-none"
            style={
              {
                left: "50%",
                top: "50%",
                fontSize: sp.size,
                color: sp.color,
                textShadow: `0 0 4px ${sp.color}, 0 0 1px #52525b`,
                animationDelay: `${sp.delay}s`,
                "--sx": `${sp.dx}px`,
                "--sy": `${sp.dy}px`,
                "--sf": `${sp.fall}px`,
              } as CSSProperties
            }
          >
            ✦
          </span>
        ))}
      {stinking &&
        // モンたん: 震えたあと、臭いガスの粒がもわっと出て、ふくらみながら漂って消える
        // 後ろ向きのときは、おしり(左下)側から出す。
        (facing === "back" ? STINK_PUFFS_BACK : STINK_PUFFS).map((pf, i) => {
          return (
          <span
            key={i}
            className="animate-kuwagata-stink-puff pointer-events-none absolute z-20 rounded-full"
            style={
              {
                left: pf.left,
                top: pf.top,
                width: pf.size,
                height: pf.size,
                background: "radial-gradient(circle, rgba(190,220,60,0.85) 0%, rgba(150,190,40,0.55) 55%, rgba(150,190,40,0) 100%)",
                animationDelay: `${pf.delay}s`,
                "--gx": `${pf.px}px`,
                "--gy": `${-pf.py}px`,
              } as CSSProperties
            }
          />
          );
        })}
      {nickname && (
        // 名前ラベル。スプライトの頭上に出し、歩き回るのに合わせてラベルも一緒に動く。
        // 幅は名前の最大10文字(+左右の余白)が省略されずに入る広さ。最長の種類名は「テッペンクワたん」(8文字)。
        // 実アートの正方形キャンバスは上に透明な余白があるため、その分だけ下げて本体の
        // すぐ上に付ける(Bugアイコンは余白が無いので枠の上端)。
        // 左右反転するBugフォールバックでは、文字が鏡文字にならないよう反転を打ち消す。
        <span
          className="pointer-events-none absolute left-1/2 z-10 max-w-[11em] truncate whitespace-nowrap rounded-full bg-white/85 px-1.5 py-px text-[9px] font-semibold leading-tight text-zinc-700 shadow-sm"
          style={{
            top: hasArt ? "10%" : 0,
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

// 水の中の泡。水槽の立体(底の面のu,v＋高さw)で置く。
const AQUARIUM_BUBBLES: { u: number; v: number; w: number; size: number }[] = [
  { u: 0.18, v: 0.3, w: 0.15, size: 5 },
  { u: 0.55, v: 0.2, w: 0.7, size: 4 },
  { u: 0.8, v: 0.6, w: 0.35, size: 6 },
  { u: 0.4, v: 0.75, w: 0.85, size: 3 },
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
function tankBgStyle(isAquarium: boolean, isAncient = false): CSSProperties {
  const url = isAncient
    ? "/roadmap/tank/tank_bg_ancient.png"
    : isAquarium
    ? "/roadmap/tank/tank_bg_aquarium.png"
    : "/roadmap/tank/tank_bg_terrarium.png";
  // background-imageのレイヤーには単色(#hexなど)を指定できない(CSS的に無効な値になり、
  // レイヤーリスト全体が無効化されて1枚目のurl()ごと効かなくなる)ため、フォールバックは
  // 単色ではなく必ずグラデーションにする(room_bg.pngと同じ考え方)。
  const fallback = isAquarium
    ? "linear-gradient(to bottom, #a5f3fc, #0ea5e9)"
    : isAncient
    ? "linear-gradient(to bottom, #ecfeff, #bbf7d0)"
    : "linear-gradient(to bottom, #e0f2fe, #ffffff)";
  return { backgroundImage: `url(${url}), ${fallback}` };
}

// 水槽の絵のズーム倍率の上限。
const TANK_ZOOM_MAX = 3;

function EnlargedTankVisual({
  tank,
  color,
  nicknameOf,
  tintOf,
  rimOf,
  actionsOf,
  debugAction,
  murmurs,
  placedDecos,
  decoEdit,
  decoSelectedKey,
  onDecoTap,
  onDecoMove,
  debugDeco,
  onTapIndividual,
}: {
  tank: KuwagataShelfTank;
  color: string;
  nicknameOf: (individual: {
    id: string;
    nickname: string | null;
  }) => string | null;
  // 個体の色づけ（色の実）。プレビュー中の色もここで返す。
  tintOf: (individual: { id: string; tintKey: string | null }) => string | null;
  rimOf: (individual: { id: string; rimKey: RimKey | null }) => RimKey | null;
  actionsOf: (individual: { id: string; tintKey: string | null; rimKey: RimKey | null; speciesCode: string }) => ActionId[];
  debugAction: { id: ActionId; n: number } | null;
  murmurs: Murmur[];
  // この水槽に置いた置物（無ければ、従来どおり石・エサを出す）。
  placedDecos: { itemKey: string; u: number; v: number }[];
  // 置物を置くモード。タップ位置(u,v)と、タップした置物のキーを返す。
  decoEdit: boolean;
  decoSelectedKey: string | null;
  onDecoTap: (hitKey: string | null, u: number, v: number) => void;
  // 置物をドラッグして動かし終えたとき。
  onDecoMove: (key: string, u: number, v: number) => void;
  debugDeco: { key: string; n: number } | null;
  // 水槽の中の個体をタップしたとき（ダブルタップのズームとは区別する）。
  onTapIndividual: (individualId: string) => void;
}) {
  const isAquarium = tank.speciesAreaCode === "aquarium";
  const isAncient = tank.speciesAreaCode === "ancient";
  // 水槽内の「現在、他の個体がどこにいるか」を各WanderingCreatureが共有で読み書き
  // するためのref(Reactのstateにはしない=位置が変わってもこの水槽全体が再レンダー
  // されない)。モーダルを閉じるとEnlargedTankVisual自体がアンマウントされるので、
  // 次に開いたときは自動的に空の状態から始まる。
  const positionsRef = useRef<Record<string, WorldEntry>>({});
  // 当たり判定の円の表示(確認用)。切り替えボタンは外した。URL に ?collision=1 を付けたときだけ表示する。
  const [showCollision, setShowCollision] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("collision") === "1") {
      setShowCollision(true);
    }
  }, []);
  // この水槽の立体の実測。水を張ったアクアリウムは、底の砂利の面と、そこから水面までの高さを持つ。
  const geo = isAquarium ? AQUARIUM_GEOMETRY : isAncient ? ANCIENT_GEOMETRY : TERRARIUM_GEOMETRY;
  // デコレーションは水槽(tankId)ごとに決定的なので、個体の衝突回避にも
  // そのまま使い回す(描画用の配置情報と衝突回避用の座標リストを二重管理しない)。
  // widthPctも一緒に持たせ、衝突判定側でアイテムごとの実際の大きさを加味できるようにする。
  // 古代の森は背景絵に置物が描き込んであるので、置物は出さず、背景の障害物(ANCIENT_OBSTACLES)を避けさせる。
  const [dragPos, setDragPos] = useState<{ key: string; u: number; v: number } | null>(null);
  const dragRef = useRef<{ key: string; offX: number; offY: number } | null>(null);
  // PCでマウスを動かしているとき、選んだ置物が置かれる位置に出す半透明の見本。
  const [ghost, setGhost] = useState<{ u: number; v: number } | null>(null);
  const decorations = useMemo(() => {
    if (isAquarium || isAncient) return [];
    // 石・エサは常に出す(置いた位置があればそこ)。置物は石・エサに加えて置く。
    const base = pickDecorations(tank).map((d, i) => {
      const key = baseDecoKey(tank.tankId, i);
      const p = placedDecos.find((x) => x.itemKey === key);
      return { ...d, key: key as string | null, spot: p ? { u: p.u, v: p.v } : d.spot };
    });
    const placed = placedDecos
      .filter((p) => DECO_BY_KEY[p.itemKey])
      .map((p) => ({ key: p.itemKey as string | null, file: DECO_BY_KEY[p.itemKey].file, widthPct: DECO_BY_KEY[p.itemKey].widthPct, spot: { u: p.u, v: p.v } }));
    return [...base, ...placed].map((d) => (dragPos && d.key === dragPos.key ? { ...d, spot: { u: dragPos.u, v: dragPos.v } } : d));
  }, [tank, isAquarium, isAncient, placedDecos, dragPos]);
  const allDecorationSpots = useMemo<DecoSpot[]>(
    () => (isAncient ? ANCIENT_OBSTACLES : decorations.map((d) => ({ u: d.spot.u, v: d.spot.v, widthPct: d.widthPct }))),
    [decorations, isAncient],
  );
  // ぶつかる障害物と、通り抜けられる水場(川)に分ける。
  const decorationSpots = useMemo(() => solidSpotsOf(allDecorationSpots), [allDecorationSpots]);
  const waterZones = useMemo(() => waterZonesOf(allDecorationSpots), [allDecorationSpots]);
  // 開いたときの置き場所。置物や、先に置いた他の個体と重ならない場所を、個体ごとに1回だけ決める。
  // 動かない個体(卵・蛹)を先に置き、歩き回る個体はその後に置く(大きい個体ほど先に決めて場所を確保する)。
  const stationarySpots = useMemo(() => {
    const spots: Record<string, { u: number; v: number }> = {};
    const taken: { u: number; v: number; widthPct: number; shape: BodyShape }[] = [];
    const ordered = [...tank.individuals].sort((a, b) => {
      const sa = isStationaryStage(a.speciesCode, a.growthStage) ? 0 : 1;
      const sb = isStationaryStage(b.speciesCode, b.growthStage) ? 0 : 1;
      return sa - sb || b.sizeScale - a.sizeScale;
    });
    for (const individual of ordered) {
      const widthPct = creatureWidthPct(individual.sizeScale);
      const shape = bodyShapeFor(individual.speciesCode, individual.growthStage);
      const ghost = individual.growthStage === "成虫" && WINGED_SPECIES_CODES.includes(individual.speciesCode);
      const spot = pickStationarySpot(individual.id, widthPct, ghost ? NO_DECORATIONS : decorationSpots, taken, shape, geo);
      spots[individual.id] = spot;
      taken.push({ ...spot, widthPct, shape });
    }
    return spots;
  }, [tank, decorationSpots, geo]);

  // ピンチ・ホイールで水槽の絵をズームする(見た目だけ。個体の動きや当たり判定の座標には影響しない)。
  // 倍率と位置はrefで持ち、styleを直接書き換える(動かすたびに水槽全体を再レンダーしないため)。
  const frameRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef({ s: 1, x: 0, y: 0 });
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const gestureRef = useRef<{
    dist: number;
    s: number;
    x: number;
    y: number;
    mx: number;
    my: number;
  } | null>(null);
  const tapRef = useRef<{
    t: number;
    x: number;
    y: number;
    cx: number;
    cy: number;
    moved: boolean;
  } | null>(null);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTapRef = useRef(0);
  const [zoomed, setZoomed] = useState(false);
  useEffect(
    () => () => {
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    },
    [],
  );

  const applyView = (s: number, x: number, y: number) => {
    const frame = frameRef.current;
    const content = contentRef.current;
    if (!frame || !content) return;
    const ns = Math.min(TANK_ZOOM_MAX, Math.max(1, s));
    const w = frame.clientWidth;
    const h = frame.clientHeight;
    const nx = Math.min(0, Math.max(w * (1 - ns), x));
    const ny = Math.min(0, Math.max(h * (1 - ns), y));
    viewRef.current = { s: ns, x: nx, y: ny };
    content.style.transform = ns === 1 ? "" : `translate(${nx}px, ${ny}px) scale(${ns})`;
    frame.style.touchAction = ns > 1.001 ? "none" : "pan-y";
    setZoomed(ns > 1.001);
  };
  const zoomAt = (ns: number, cx: number, cy: number) => {
    const { s, x, y } = viewRef.current;
    const clamped = Math.min(TANK_ZOOM_MAX, Math.max(1, ns));
    applyView(clamped, cx - (cx - x) * (clamped / s), cy - (cy - y) * (clamped / s));
  };
  const localPoint = (e: { clientX: number; clientY: number }) => {
    const rect = frameRef.current?.getBoundingClientRect();
    return { x: e.clientX - (rect?.left ?? 0), y: e.clientY - (rect?.top ?? 0) };
  };
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    // PCでは、Ctrl(トラックパッドのピンチを含む)＋ホイールでズームする。普通のホイールは、ポップアップのスクロールに使う。
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const rect = frame.getBoundingClientRect();
      zoomAt(viewRef.current.s * (e.deltaY < 0 ? 1.12 : 1 / 1.12), e.clientX - rect.left, e.clientY - rect.top);
    };
    frame.addEventListener("wheel", onWheel, { passive: false });
    return () => frame.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 置物は足元(下端)が基準なので、触れた場所が置物の中心あたりになるよう、置物の高さの半分ほど下にずらす。
  const decoShiftPx = (boxWidthPx: number): number => {
    if (!decoSelectedKey) return 0;
    const el = document.querySelector(`[data-deco-key="${CSS.escape(decoSelectedKey)}"]`);
    if (el) return el.getBoundingClientRect().height * 0.5;
    const def = DECO_BY_KEY[decoSelectedKey];
    return def ? ((def.widthPct * boxWidthPx) / 100) * 0.75 * 0.5 : 0;
  };
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const pt = localPoint(e);
    pointersRef.current.set(e.pointerId, pt);
    e.currentTarget.setPointerCapture(e.pointerId);
    if (pointersRef.current.size === 1 && decoEdit) {
      // 置物を置くモード: 置物の上で押したら、ドラッグで動かせるようにする。
      const hitEl = document.elementsFromPoint(e.clientX, e.clientY).find((el) => el instanceof HTMLElement && el.dataset.decoKey);
      if (hitEl instanceof HTMLElement && hitEl.dataset.decoKey) {
        const r = hitEl.getBoundingClientRect();
        dragRef.current = { key: hitEl.dataset.decoKey, offX: e.clientX - (r.left + r.width / 2), offY: e.clientY - r.bottom };
      }
    }
    if (pointersRef.current.size === 1) {
      tapRef.current = {
        t: Date.now(),
        x: pt.x,
        y: pt.y,
        cx: e.clientX,
        cy: e.clientY,
        moved: false,
      };
    } else if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      const { s, x, y } = viewRef.current;
      gestureRef.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        s,
        x,
        y,
        mx: (a.x + b.x) / 2,
        my: (a.y + b.y) / 2,
      };
      if (tapRef.current) tapRef.current.moved = true;
    }
  };
  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (decoEdit && decoSelectedKey && e.pointerType === "mouse" && !dragRef.current) {
      const box = contentRef.current?.getBoundingClientRect();
      if (box && box.width > 0) {
        const uv = uvFromScreen(((e.clientX - box.left) / box.width) * 100, ((e.clientY + decoShiftPx(box.width) - box.top) / box.height) * 100, geo);
        setGhost(uv);
      }
    } else if (ghost) {
      setGhost(null);
    }
    const prev = pointersRef.current.get(e.pointerId);
    if (!prev) return;
    const pt = localPoint(e);
    pointersRef.current.set(e.pointerId, pt);
    if (tapRef.current && Math.hypot(pt.x - tapRef.current.x, pt.y - tapRef.current.y) > 8) tapRef.current.moved = true;
    if (dragRef.current && tapRef.current?.moved && pointersRef.current.size === 1) {
      const box = contentRef.current?.getBoundingClientRect();
      if (box && box.width > 0) {
        const uv = uvFromScreen(((e.clientX - dragRef.current.offX - box.left) / box.width) * 100, ((e.clientY - dragRef.current.offY - box.top) / box.height) * 100, geo);
        if (uv) setDragPos({ key: dragRef.current.key, ...uv });
      }
      return;
    }
    if (pointersRef.current.size >= 2 && gestureRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const g = gestureRef.current;
      const ns = Math.min(TANK_ZOOM_MAX, Math.max(1, (g.s * Math.hypot(a.x - b.x, a.y - b.y)) / g.dist));
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      applyView(ns, mx - (g.mx - g.x) * (ns / g.s), my - (g.my - g.y) * (ns / g.s));
    } else if (pointersRef.current.size === 1 && viewRef.current.s > 1.001) {
      const { s, x, y } = viewRef.current;
      applyView(s, x + (pt.x - prev.x), y + (pt.y - prev.y));
    }
  };
  const handlePointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    pointersRef.current.delete(e.pointerId);
    gestureRef.current = null;
    if (dragRef.current) {
      const moved = dragPos;
      dragRef.current = null;
      if (moved) {
        onDecoMove(moved.key, moved.u, moved.v);
        // 保存の反映(親の置物リスト更新)を待たずに戻ると一瞬元の位置に見えるので、少しだけ保持する。
        setTimeout(() => setDragPos(null), 400);
        tapRef.current = null;
        return;
      }
    }
    const tap = tapRef.current;
    if (pointersRef.current.size === 0 && tap && !tap.moved && Date.now() - tap.t < 300) {
      // ダブルタップ: 拡大中なら元に戻し、等倍なら2.2倍にする。
      if (Date.now() - lastTapRef.current < 300) {
        if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
        if (viewRef.current.s > 1.001) applyView(1, 0, 0);
        else zoomAt(2.2, tap.x, tap.y);
        lastTapRef.current = 0;
      } else {
        lastTapRef.current = Date.now();
        // 1回だけのタップは、ダブルタップではないと分かってから、その位置の個体を選ぶ。
        const { cx, cy } = tap;
        tapTimerRef.current = setTimeout(() => {
          tapTimerRef.current = null;
          // つぶやきの吹き出しの上なら、個体ではなく吹き出し(音声と訳)を優先する。
          // (枠がポインターを捕まえているので、吹き出しのクリックは自分で呼ぶ)
          const els = document.elementsFromPoint(cx, cy);
          if (decoEdit) {
            // 置物を置くモード: 置物をタップならそれを選び、床をタップならその位置を伝える。
            const decoEl = els.find((el) => el instanceof HTMLElement && el.dataset.decoKey);
            const box = contentRef.current?.getBoundingClientRect();
            if (box && box.width > 0) {
              // 置物は足元(下端)が基準なので、指で触れた場所が置物の中心あたりになるよう、置物の高さの半分ほど下にずらす。
              const shiftPx = decoShiftPx(box.width);
              const uv = uvFromScreen(((cx - box.left) / box.width) * 100, ((cy + shiftPx - box.top) / box.height) * 100, geo);
              if (uv) onDecoTap(decoEl instanceof HTMLElement ? decoEl.dataset.decoKey ?? null : null, uv.u, uv.v);
            }
            return;
          }
          const bubble = els.find((el) => el instanceof HTMLElement && el.dataset.murmurBubble);
          if (bubble instanceof HTMLElement) {
            bubble.click();
            return;
          }
          const hit = els.find((el) => el instanceof HTMLElement && el.dataset.individualId);
          if (hit instanceof HTMLElement && hit.dataset.individualId)
            onTapIndividual(hit.dataset.individualId);
        }, 300);
      }
    }
    if (pointersRef.current.size === 0) tapRef.current = null;
  };

  return (
    <div
      ref={frameRef}
      data-no-room-swipe
      className="relative mb-3.5 w-full select-none overflow-hidden rounded-lg border border-zinc-200"
      style={{ touchAction: decoEdit ? "none" : "pan-y" }}
      onDragStart={(e) => e.preventDefault()}
      onPointerLeave={() => setGhost(null)}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
    >
    <div
      ref={contentRef}
      className="relative aspect-[4/3] w-full origin-top-left bg-cover bg-center"
      style={tankBgStyle(isAquarium, isAncient)}
    >
      {isAquarium &&
        AQUARIUM_BUBBLES.map((bubble, i) => {
          const pt = surfacePoint(bubble.u, bubble.v, geo, bubble.w);
          return (
            <div
              key={i}
              className="absolute rounded-full bg-white/60"
              style={{ left: `${pt.left}%`, top: `${pt.top}%`, width: bubble.size, height: bubble.size }}
            />
          );
        })}
      {!isAquarium &&
        decorations.map((deco, index) => {
          const pt = surfacePoint(deco.spot.u, deco.spot.v, geo);
          return (
            <div
              key={deco.key ?? index}
              data-deco-key={deco.key ?? undefined}
              className="absolute -translate-x-1/2 -translate-y-full"
              style={{
                left: `${pt.left}%`,
                top: `${pt.top}%`,
                width: `${deco.widthPct}%`,
                outline: decoEdit && deco.key && deco.key === decoSelectedKey ? "2px dashed #f59e0b" : undefined,
                outlineOffset: 2,
              }}
            >
              <img src={deco.file} alt="" draggable={false} className="pointer-events-none block w-full select-none object-contain drop-shadow-sm" />
            </div>
          );
        })}
      {ghost && decoSelectedKey && !isAquarium && (() => {
        const file = decorations.find((d) => d.key === decoSelectedKey)?.file ?? DECO_BY_KEY[decoSelectedKey]?.file;
        const widthPct = decorations.find((d) => d.key === decoSelectedKey)?.widthPct ?? DECO_BY_KEY[decoSelectedKey]?.widthPct;
        if (!file || !widthPct) return null;
        const gp = surfacePoint(ghost.u, ghost.v, geo);
        return (
          // eslint-disable-next-line @next/next/no-img-element -- 自前アート
          <img src={file} alt="" draggable={false} className="pointer-events-none absolute -translate-x-1/2 -translate-y-full select-none object-contain opacity-50" style={{ left: `${gp.left}%`, top: `${gp.top}%`, width: `${widthPct}%` }} />
        );
      })()}
      {tank.individuals.map((individual, index) => {
        if (isAquarium && !KNOWN_CREATURE_ART[individual.speciesCode]) {
          // 実アートが無いアクアリウムの種は、従来どおりの簡易配置のまま
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
            tintKey={tintOf(individual)}
            rimKey={rimOf(individual)}
            actions={actionsOf(individual)}
            debugAction={debugAction}
            murmurs={murmurs}
            debugDeco={tank.individuals.find((i) => i.growthStage === "成虫")?.id === individual.id ? debugDeco : null}
            visitTargets={decorations
              .filter((d) => d.key && DECO_BY_KEY[d.key])
              .map((d) => ({ key: d.key as string, u: d.spot.u, v: d.spot.v, pattern: DECO_BY_KEY[d.key as string].pattern, scene: DECO_BY_KEY[d.key as string].scene, widthPct: DECO_BY_KEY[d.key as string].widthPct }))}
            nickname={nicknameOf(individual) ?? individual.speciesName}
            color={color}
            mirror={!hasArt && index % 2 === 1}
            decorationSpots={decorationSpots}
            waterZones={waterZones}
            positionsRef={positionsRef}
            hasCompanions={tank.individuals.length > 1}
            geo={geo}
            showCollision={showCollision}
          />
        );
      })}
      {showCollision &&
        allDecorationSpots.map((spot, index) => {
          const c = staticCircle(spot, geo);
          return (
            <span
              key={`collision-${index}`}
              className={`pointer-events-none absolute z-10 rounded-full border-2 ${spot.screen?.water ? "border-cyan-500/80 border-dashed bg-cyan-300/20" : c.ground ? "border-emerald-600/80 bg-emerald-400/15" : "border-sky-500/80 bg-sky-400/10"}`}
              style={{ left: `${c.pt.left}%`, top: `${c.pt.top}%`, width: `${c.radius * 2}%`, aspectRatio: "1 / 1", transform: "translate(-50%, -50%)" }}
            />
          );
        })}
      {/* 水の底の秘境: 手前ガラス・水面の透明レイヤーを生き物・置物の上に重ねて「水の中」に見せる */}
      {isAquarium && (
        <img
          src="/roadmap/tank/tank_fg_aquarium.png"
          alt=""
          aria-hidden
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none"
        />
      )}
    </div>
      {zoomed && (
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => applyView(1, 0, 0)}
          className="absolute right-1.5 top-1.5 z-30 rounded-full bg-white/90 px-2.5 py-1 text-[11px] font-bold text-zinc-600 shadow"
        >
          元に戻す
        </button>
      )}
    </div>
  );
}

// 金属ラック風の棚。飼育部屋の棚アイテム(グレーの金属フレーム)に合わせて、
// 両脇の支柱(等間隔の薄い溝つき)・ひし形を並べた天板と棚板をCSSで描き、水槽を棚板の上に載せる。
// ひし形は、メタルラックを横から見たときの斜め格子(X字を横に並べた形)。
const RACK_DIAMOND_URL = `url("data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="12" viewBox="0 0 14 12"><path d="M0 0L14 12M14 0L0 12" stroke="#8d8d96" stroke-width="1.6" fill="none"/></svg>'
)}")`;
const RACK_BAR_STYLE: CSSProperties = {
  backgroundImage: RACK_DIAMOND_URL,
  backgroundSize: "14px 100%",
  backgroundColor: "#ececef",
};
const RACK_POST_STYLE: CSSProperties = {
  backgroundImage: "repeating-linear-gradient(180deg, #a1a1aa 0 9px, #6b6b73 9px 10px)",
};
const SOIL_STYLE: CSSProperties = {
  backgroundColor: "#6b4a2f",
  backgroundImage:
    "radial-gradient(circle at 20% 35%, #4a3220 1px, transparent 1.6px), radial-gradient(circle at 60% 65%, #94694a 1px, transparent 1.6px), radial-gradient(circle at 82% 28%, #3b281a 1.2px, transparent 1.8px)",
  backgroundSize: "13px 11px, 10px 9px, 17px 13px",
  borderTop: "2px solid #4a3220",
};
const SAND_STYLE: CSSProperties = {
  backgroundColor: "#e6d3a1",
  backgroundImage:
    "radial-gradient(circle at 25% 40%, #c9b27a 1px, transparent 1.6px), radial-gradient(circle at 70% 65%, #f4e8c4 1px, transparent 1.6px)",
  backgroundSize: "11px 9px, 14px 11px",
  borderTop: "2px solid #c9b27a",
};

const ANCIENT_SOIL_STYLE: CSSProperties = {
  backgroundColor: "#6f6a3a",
  backgroundImage:
    "radial-gradient(circle at 20% 35%, #4d4a28 1px, transparent 1.6px), radial-gradient(circle at 60% 65%, #9a9552 1px, transparent 1.6px), radial-gradient(circle at 82% 28%, #3f6b3a 1.2px, transparent 1.8px)",
  backgroundSize: "13px 11px, 10px 9px, 17px 13px",
  borderTop: "2px solid #3f6b3a",
};

// 古代の森の小さな水槽の遠景(火山とシダの影)。他の水槽と同じくコードだけで描く。
function AncientBackdrop() {
  return (
    <svg className="pointer-events-none absolute inset-x-0 bottom-[40px] h-[52px] w-full" viewBox="0 0 100 52" preserveAspectRatio="none" aria-hidden>
      <polygon points="52,52 66,14 72,14 88,52" fill="#a7c4a0" />
      <polygon points="64,14 74,14 72,18 66,18" fill="#f59e0b" opacity="0.8" />
      <polygon points="0,52 14,30 26,52" fill="#86b98a" />
      <polygon points="18,52 34,22 48,52" fill="#74ab7c" />
      <path d="M6 52 Q8 38 2 32 M6 52 Q10 40 16 36 M6 52 Q4 42 10 38" stroke="#3f7a47" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

const RACK_CELL_CLASS = "relative px-1.5 pb-3 pt-3";
const RACK_SHELF_CLASS = "absolute inset-x-0 bottom-0 h-3 border-y border-zinc-400";

// 棚の1マス。下に棚板を描き、水槽はその上に載る。plateを渡すと棚板に番号の小さなプレートが付く。
function RackCell({ children, plate }: { children?: React.ReactNode; plate?: string }) {
  return (
    <div className={RACK_CELL_CLASS}>
      {children}
      <div className={RACK_SHELF_CLASS} style={RACK_BAR_STYLE} />
      {plate && (
        <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 rounded-sm bg-zinc-50 px-1.5 text-[9px] font-medium leading-3 text-zinc-500 ring-1 ring-zinc-300">
          {plate}
        </span>
      )}
    </div>
  );
}

// 最後の段が途中で終わっても棚板が途切れないよう、空きマスを足す(2列/3列それぞれの表示用)。
function RackFillers({ count }: { count: number }) {
  const two = (2 - (count % 2)) % 2;
  const three = (3 - (count % 3)) % 3;
  const filler = (key: string, cls: string) => (
    <div key={key} className={`${cls} ${RACK_CELL_CLASS}`}>
      <div className="h-[114px]" />
      <div className={RACK_SHELF_CLASS} style={RACK_BAR_STYLE} />
    </div>
  );
  return (
    <>
      {Array.from({ length: two }).map((_, i) => filler(`f2-${i}`, "sm:hidden"))}
      {Array.from({ length: three }).map((_, i) => filler(`f3-${i}`, "hidden sm:block"))}
    </>
  );
}

// 複数ページある新種の棚で、最後のページの空きマスを空の棚板で埋める(全ページの段数をそろえ、
// 行が間延びして見えないようにする)。
function RackEmptyCells({ count }: { count: number }) {
  return (
    <>
      {Array.from({ length: Math.max(0, count) }).map((_, i) => (
        <div key={i} className={RACK_CELL_CLASS}>
          <div className="h-[114px]" />
          <div className={RACK_SHELF_CLASS} style={RACK_BAR_STYLE} />
        </div>
      ))}
    </>
  );
}

// 棚に載る水槽。ガラスの枠・蓋・土(アクアリウムは砂)・ガラスの照り返しを描き、中に生きものを立たせる。
// 土は水槽の一番下から厚めに敷き、その土の上に「名前＋匹数」の半透明ラベルを貼る。
// 水槽の下端は棚板に直接置く。
function TankButton({
  onClick,
  variant,
  name,
  sub,
  children,
}: {
  onClick: () => void;
  variant: "known" | "terrarium" | "aquarium" | "ancient";
  name: string;
  sub: string;
  children: React.ReactNode;
}) {
  const aquarium = variant === "aquarium";
  const ancient = variant === "ancient";
  const known = variant === "known";
  const frame = known ? "border-amber-300" : aquarium ? "border-cyan-200" : ancient ? "border-emerald-200" : "border-white";
  const air = aquarium ? "from-cyan-100/90 to-cyan-200/80" : ancient ? "from-cyan-50 to-emerald-100" : "from-sky-50/80 to-white/50";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative block h-[114px] w-full overflow-hidden rounded-t-md border-2 border-b-0 bg-gradient-to-b shadow-inner ring-1 ring-zinc-300 transition-transform hover:scale-[1.03] active:scale-95 ${frame} ${air}`}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-zinc-300/80" />
      {ancient && <AncientBackdrop />}
      <div className="absolute inset-x-0 bottom-0 h-[46px]" style={aquarium ? SAND_STYLE : ancient ? ANCIENT_SOIL_STYLE : SOIL_STYLE} />
      <div className="absolute inset-x-0 bottom-[40px] flex justify-center">{children}</div>
      <div className="absolute inset-x-0 bottom-1.5 flex justify-center">
        <div
          className={`flex flex-col items-center rounded-md px-3 py-0.5 leading-tight shadow-sm backdrop-blur-[1px] ${
            known ? "bg-amber-50/80" : aquarium ? "bg-cyan-50/75" : "bg-white/75"
          }`}
        >
          <span className={`whitespace-nowrap text-xs font-semibold ${known ? "text-amber-800" : "text-zinc-700"}`}>
            {name}
          </span>
          <span className={`text-[10px] ${known ? "text-amber-600" : "text-zinc-500"}`}>{sub}</span>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/40 via-transparent to-transparent" />
    </button>
  );
}

// Freeの表示枠を超えた種類の水槽。中は見せず、タップでPro案内へ。
function LockedTankLink({ count }: { count: number }) {
  return (
    <Link
      href="/roadmap/pro?from=shelf"
      className="relative flex h-[114px] w-full flex-col items-center justify-center gap-1 overflow-hidden rounded-t-md border-2 border-b-0 border-white bg-gradient-to-b from-zinc-200/90 to-zinc-300/80 shadow-inner ring-1 ring-zinc-300 transition-transform hover:scale-[1.03] active:scale-95"
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-zinc-300/80" />
      <Lock className="h-6 w-6 text-zinc-500" strokeWidth={1.75} />
      <span className="rounded-md bg-white/75 px-2 py-0.5 text-xs font-semibold text-zinc-700 shadow-sm">{count}種が飾れていません</span>
      <span className="mx-1 inline-flex items-center gap-1 rounded-2xl bg-gradient-to-b from-amber-400 to-orange-500 px-2 py-1 text-center text-[10px] font-black leading-tight text-white shadow-md ring-2 ring-amber-200">
        <Crown className="h-3 w-3 shrink-0" />
        Proなら飾れる水槽無制限！
      </span>
    </Link>
  );
}

// 新種の棚の1ページの個数。PC/タブレット(sm以上)は3列×3段=9、スマホは2列×4段=8。
const NEW_SHELF_PAGE_SIZE_WIDE = 9;
const NEW_SHELF_PAGE_SIZE_NARROW = 8;
// クワたんシリーズの棚は2行ずつ(横3列なら6個、横2列なら4個)。
const KNOWN_SHELF_PAGE_SIZE_WIDE = 6;
const KNOWN_SHELF_PAGE_SIZE_NARROW = 4;

export function KuwagataShelf({
  tanks,
  knownTanks,
  lockedSpeciesCount = 0,
}: {
  tanks: KuwagataShelfTank[];
  knownTanks: KuwagataShelfTank[];
  // Free会員の表示枠(FREE_SHELF_NEW_SPECIES_TANK_CAP)を超えて隠れている新種の種類数。鍵付きの水槽として並べる。
  lockedSpeciesCount?: number;
}) {
  const [selectedTankId, setSelectedTankId] = useState<string | null>(null);
  // 名前の編集。保存に成功した分はサーバー(props)の再取得を待たず、ここで上書きして即反映する。
  const [nicknameOverrides, setNicknameOverrides] = useState<Record<string, string | null>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNickname, setDraftNickname] = useState("");
  const [savingNickname, setSavingNickname] = useState(false);
  const [nicknameError, setNicknameError] = useState<string | null>(null);
  const nicknameOf = (individual: {
    id: string;
    nickname: string | null;
  }): string | null =>
    individual.id in nicknameOverrides
      ? nicknameOverrides[individual.id]
      : individual.nickname;

  // 色の実（持ち物）と個体の色づけ。保存に成功した分は、ここで上書きして即反映する。
  const [items, setItems] = useState<KuwagataItem[]>([]);
  const [tintOverrides, setTintOverrides] = useState<Record<string, string>>(
    {},
  );
  const [tintTargetId, setTintTargetId] = useState<string | null>(null);
  const [tintPreview, setTintPreview] = useState<string | null>(null);
  const [tintBusy, setTintBusy] = useState(false);
  const [tintError, setTintError] = useState<string | null>(null);
  const [itemsOpen, setItemsOpen] = useState(false);
  const [murmurs, setMurmurs] = useState<Murmur[]>([]);
  const [actionFlags, setActionFlags] = useState<ActionFlags>(NO_ACTION_FLAGS);
  const [rimOverrides, setRimOverrides] = useState<Record<string, RimKey>>({});
  const [rimPreview, setRimPreview] = useState<RimKey | null>(null);
  // 置物: 置いている位置(全水槽ぶん)と、水槽の拡大表示での配置モード。
  const [placedDecos, setPlacedDecos] = useState<{ itemKey: string; tankId: string; u: number; v: number }[]>([]);
  const [decoEdit, setDecoEdit] = useState(false);
  const [decoSelectedKey, setDecoSelectedKey] = useState<string | null>(null);
  const [decoError, setDecoError] = useState<string | null>(null);
  const [debugDeco, setDebugDeco] = useState<{ key: string; n: number } | null>(null);
  const decoItems = items.filter((i) => i.itemType === ITEM_TYPE_DECO && i.quantity > 0 && DECO_BY_KEY[i.itemKey]);
  const postDeco = async (body: Record<string, unknown>) => {
    setDecoError(null);
    try {
      const res = await fetch("/api/roadmap/kuwagata/decos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(String(res.status));
      return true;
    } catch {
      setDecoError("保存できなかった");
      return false;
    }
  };
  const handleDecoTap = async (hitKey: string | null, u: number, v: number) => {
    if (!selectedTank) return;
    if (hitKey && hitKey !== decoSelectedKey) {
      setDecoSelectedKey(hitKey);
      return;
    }
    const key = decoSelectedKey;
    if (!key) return;
    void placeDecoAt(key, u, v);
  };
  const placeDecoAt = async (key: string, u: number, v: number) => {
    if (!selectedTank) return;
    const tankId = selectedTank.tankId;
    const countHere = placedDecos.filter((p) => p.tankId === tankId && p.itemKey !== key && !isBaseDecoKey(p.itemKey)).length;
    if (!isBaseDecoKey(key) && countHere >= MAX_DECOS_PER_TANK) {
      setDecoError(`1つの水槽に${MAX_DECOS_PER_TANK}つまで`);
      return;
    }
    const prev = placedDecos;
    setPlacedDecos([...placedDecos.filter((p) => p.itemKey !== key), { itemKey: key, tankId, u, v }]);
    const ok = await postDeco({ action: "place", itemKey: key, tankId, u, v });
    if (!ok) setPlacedDecos(prev);
  };
  const handleDecoMove = (key: string, u: number, v: number) => {
    setDecoSelectedKey(key);
    void placeDecoAt(key, u, v);
  };
  const handleDecoRemove = async (key: string) => {
    const prev = placedDecos;
    setPlacedDecos(placedDecos.filter((p) => p.itemKey !== key));
    const ok = await postDeco({ action: "remove", itemKey: key });
    if (!ok) setPlacedDecos(prev);
  };
  const itemCount = items.reduce(
    (sum, item) => (item.itemType === ITEM_TYPE_SHIZUKU || item.itemType === ITEM_TYPE_RIM || item.itemType === ITEM_TYPE_DECO ? sum + Math.max(item.quantity, 0) : sum),
    0,
  );
  const rimItems = items.filter((item) => item.itemType === ITEM_TYPE_RIM && item.quantity > 0 && isRimKey(item.itemKey));
  const shizukuItems = items.filter(
    (item) => item.itemType === ITEM_TYPE_SHIZUKU && item.quantity > 0,
  );
  useEffect(() => {
    let cancelled = false;
    fetch("/api/roadmap/kuwagata/items", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { items?: KuwagataItem[]; actionFlags?: ActionFlags; placedDecos?: { itemKey: string; tankId: string; u: number; v: number }[] } | null) => {
        if (cancelled) return;
        if (json?.items) setItems(json.items);
        if (json?.actionFlags) setActionFlags(json.actionFlags);
        if (json?.placedDecos) setPlacedDecos(json.placedDecos);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/roadmap/kuwagata/murmurs", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { murmurs?: Murmur[] } | null) => {
        if (!cancelled && json?.murmurs) setMurmurs(json.murmurs);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  // 水槽に出す色づけ。プレビュー中の個体は、選んだ色を仮に当てる。
  const tintOf = (individual: {
    id: string;
    tintKey: string | null;
  }): string | null => {
    if (tintTargetId === individual.id && tintPreview) return tintPreview;
    return individual.id in tintOverrides
      ? tintOverrides[individual.id]
      : individual.tintKey;
  };
  const rimOf = (individual: { id: string; rimKey: RimKey | null }): RimKey | null => {
    if (tintTargetId === individual.id && rimPreview) return rimPreview;
    return individual.id in rimOverrides ? rimOverrides[individual.id] : individual.rimKey;
  };
  const actionsOf = (individual: { id: string; tintKey: string | null; rimKey: RimKey | null; speciesCode: string }): ActionId[] =>
    availableActions(
      individual.id in tintOverrides ? tintOverrides[individual.id] : individual.tintKey,
      individual.id in rimOverrides ? rimOverrides[individual.id] : individual.rimKey,
      actionFlags,
      individual.speciesCode,
    );
  const applyRim = async (
    target: { id: string; speciesCode: string; mandibleVariant: number; growthStage: KuwagataGrowthStage; sizeScale: number; tintKey: string | null },
    rim: RimKey,
  ) => {
    setTintBusy(true);
    setTintError(null);
    try {
      const res = await fetch("/api/roadmap/kuwagata/tint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ individualId: target.id, sceneKey: rim, kind: "rim" }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setTintError(json.error ?? "星のカケラをふりかけられませんでした");
        return;
      }
      setRimCeremony({
        speciesCode: target.speciesCode,
        mandibleVariant: target.mandibleVariant,
        growthStage: target.growthStage,
        sizeScale: target.sizeScale,
        tintKey: target.id in tintOverrides ? tintOverrides[target.id] : target.tintKey,
        rim,
      });
      setRimOverrides((prev) => ({ ...prev, [target.id]: rim }));
      setItems((prev) =>
        prev.map((item) =>
          item.itemType === ITEM_TYPE_RIM && item.itemKey === rim ? { ...item, quantity: item.quantity - 1 } : item,
        ),
      );
      closeTintPanel();
    } catch {
      setTintError("星のカケラをふりかけられませんでした");
    } finally {
      setTintBusy(false);
    }
  };
  const closeTintPanel = () => {
    setTintTargetId(null);
    setTintPreview(null);
    setRimPreview(null);
    setTintError(null);
  };
  const [tintCeremony, setTintCeremony] = useState<TintCeremonyInfo | null>(null);
  const [debugAction, setDebugAction] = useState<{ id: ActionId; n: number } | null>(null);
  const [rimCeremony, setRimCeremony] = useState<RimCeremonyInfo | null>(null);
  const applyTint = async (
    target: { id: string; speciesCode: string; mandibleVariant: number; growthStage: KuwagataGrowthStage; sizeScale: number; tintKey: string | null },
    sceneKey: string
  ) => {
    const individualId = target.id;
    const fromKey = individualId in tintOverrides ? tintOverrides[individualId] : target.tintKey;
    setTintBusy(true);
    setTintError(null);
    try {
      const res = await fetch("/api/roadmap/kuwagata/tint", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ individualId, sceneKey }),
      });
      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setTintError(json.error ?? "色づけに失敗しました");
        return;
      }
      setTintCeremony({
        speciesCode: target.speciesCode,
        mandibleVariant: target.mandibleVariant,
        growthStage: target.growthStage,
        sizeScale: target.sizeScale,
        fromKey,
        toKey: sceneKey,
      });
      setTintOverrides((prev) => ({ ...prev, [individualId]: sceneKey }));
      setItems((prev) =>
        prev.map((item) =>
          item.itemType === ITEM_TYPE_SHIZUKU && item.itemKey === sceneKey
            ? { ...item, quantity: item.quantity - 1 }
            : item,
        ),
      );
      closeTintPanel();
    } catch {
      setTintError("色づけに失敗しました");
    } finally {
      setTintBusy(false);
    }
  };

  const startEditingNickname = (individual: {
    id: string;
    nickname: string | null;
  }) => {
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

  const newShelfRef = useRef<HTMLDivElement>(null);
  const knownShelfRef = useRef<HTMLDivElement>(null);
  const [isWideShelf, setIsWideShelf] = useState(true);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 640px)");
    const update = () => {
      setIsWideShelf(mq.matches);
      setNewPage(0);
      newShelfRef.current?.scrollTo({ left: 0 });
    };
    setIsWideShelf(mq.matches);
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  const [knownPage, setKnownPage] = useState(0);
  const handleKnownShelfScroll = () => {
    const el = knownShelfRef.current;
    if (el && el.clientWidth > 0) setKnownPage(Math.round(el.scrollLeft / el.clientWidth));
  };
  const scrollKnownShelf = (dir: 1 | -1) => {
    const el = knownShelfRef.current;
    if (!el) return;
    const last = Math.max(0, Math.ceil(el.scrollWidth / el.clientWidth) - 1);
    const next = Math.min(last, Math.max(0, knownPage + dir));
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  };
  const [newPage, setNewPage] = useState(0);
  const handleNewShelfScroll = () => {
    const el = newShelfRef.current;
    if (el && el.clientWidth > 0) setNewPage(Math.round(el.scrollLeft / el.clientWidth));
  };
  const scrollNewShelf = (dir: 1 | -1) => {
    const el = newShelfRef.current;
    if (!el) return;
    const last = Math.max(0, Math.ceil(el.scrollWidth / el.clientWidth) - 1);
    const next = Math.min(last, Math.max(0, newPage + dir));
    el.scrollTo({ left: next * el.clientWidth, behavior: "smooth" });
  };

  const lookupTanks = [...knownTanks, ...tanks];
  const selectedTank = lookupTanks.find((t) => t.tankId === selectedTankId) ?? null;
  const knownGroups = groupBySpecies(knownTanks);
  const newGroups = groupBySpecies(tanks);
  const knownPageSize = isWideShelf ? KNOWN_SHELF_PAGE_SIZE_WIDE : KNOWN_SHELF_PAGE_SIZE_NARROW;
  const knownPages: KuwagataShelfTank[][][] = [];
  for (let i = 0; i < knownGroups.length; i += knownPageSize) knownPages.push(knownGroups.slice(i, i + knownPageSize));
  // 新種の棚は9個(3×3)ずつのページに分け、右スクロールで次のページを見せる。
  const newPageSize = isWideShelf ? NEW_SHELF_PAGE_SIZE_WIDE : NEW_SHELF_PAGE_SIZE_NARROW;
  // 新種の棚の並び。表示枠を超えて隠れている種類があれば、最後に鍵付きの水槽(null)を1つ並べる。
  // 隠れている種類は、1つの鍵付き水槽にまとめて「◯種が飾れていません」と出す。
  const newItems: (KuwagataShelfTank[] | null)[] = [...newGroups, ...(lockedSpeciesCount > 0 ? [null] : [])];
  const newPages: (KuwagataShelfTank[] | null)[][] = [];
  for (let i = 0; i < newItems.length; i += newPageSize) newPages.push(newItems.slice(i, i + newPageSize));
  // 選択中の水槽と同じ種類の水槽(ページャ用)と、その中での位置
  const siblingTanks = selectedTank ? lookupTanks.filter((t) => t.speciesId === selectedTank.speciesId) : [];
  const siblingIndex = selectedTank ? siblingTanks.findIndex((t) => t.tankId === selectedTank.tankId) : 0;

  if (tanks.length === 0 && knownTanks.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-amber-200 bg-white/60 px-6 py-12 text-center">
        <Bug className="mx-auto mb-3 h-8 w-8 text-amber-300" strokeWidth={1.5} />
        <p className="text-sm text-zinc-500">
          まだ誰も棚に届いていません
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <button
          type="button"
          onClick={() => setItemsOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-4 py-2 text-sm font-black text-zinc-600 shadow-md transition-transform hover:border-amber-300 hover:text-amber-700 active:scale-95"
        >
          <Backpack className="h-4 w-4" />
          持ち物
          {itemCount > 0 && (
            <span className="rounded-full bg-amber-500 px-1.5 text-xs font-bold tabular-nums text-white">
              {itemCount}
            </span>
          )}
        </button>
      </div>
      <div className="relative px-[10px]">
        <div className="absolute inset-y-0 left-0 w-[10px] rounded-t-sm" style={RACK_POST_STYLE} />
        <div className="absolute inset-y-0 right-0 w-[10px] rounded-t-sm" style={RACK_POST_STYLE} />
        <div className="bg-gradient-to-b from-zinc-100 to-zinc-50 shadow-sm">
          <div className="h-3 border-b border-zinc-400" style={RACK_BAR_STYLE} />
          {knownTanks.length > 0 && (
            <div className="relative">
              <div
                ref={knownShelfRef}
                data-room-swipe-edge
                onScroll={handleKnownShelfScroll}
                className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              >
                {knownPages.map((pageGroups, pageIndex) => (
                  <div key={pageIndex} className="grid w-full shrink-0 snap-start grid-cols-2 content-start sm:grid-cols-3">
                    {pageGroups.map((group) => {
                      const tank = group[0];
                      const representative = pickRepresentative(group);
                      const count = group.reduce((sum, t) => sum + t.individuals.length, 0);
                      return (
                        <RackCell key={tank.speciesId}>
                          <TankButton
                            onClick={() => setSelectedTankId(tank.tankId)}
                            variant="known"
                            name={tank.speciesName}
                            sub={count > 1 ? `${count}匹` : GROWTH_STAGE_LABEL[representative.growthStage]}
                          >
                            <TankOccupant
                              color={KNOWN_SPECIES_COLOR}
                              sizeScale={representative.sizeScale}
                              speciesCode={representative.speciesCode}
                              mandibleVariant={representative.mandibleVariant}
                              growthStage={representative.growthStage}
                            />
                          </TankButton>
                        </RackCell>
                      );
                    })}
                    {knownPages.length > 1 ? (
                      <RackEmptyCells count={knownPageSize - pageGroups.length} />
                    ) : (
                      <RackFillers count={pageGroups.length} />
                    )}
                  </div>
                ))}
              </div>
              {knownPages.length > 1 && (
                <div className="absolute left-1/2 top-1 z-10 flex -translate-x-1/2 gap-2">
                  {knownPage > 0 && (
                    <button
                      type="button"
                      aria-label="前の棚へ"
                      onClick={() => scrollKnownShelf(-1)}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/50 text-zinc-500 shadow ring-1 ring-zinc-300/70 backdrop-blur-sm transition hover:bg-white/80 active:scale-95"
                    >
                      <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
                    </button>
                  )}
                  {knownPage < knownPages.length - 1 && (
                    <button
                      type="button"
                      aria-label="次の棚へ"
                      onClick={() => scrollKnownShelf(1)}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-white/50 text-zinc-500 shadow ring-1 ring-zinc-300/70 backdrop-blur-sm transition hover:bg-white/80 active:scale-95"
                    >
                      <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="relative">
            <div
              ref={newShelfRef}
              data-room-swipe-edge
              onScroll={handleNewShelfScroll}
              className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {newPages.map((pageGroups, pageIndex) => (
                <div key={pageIndex} className="grid w-full shrink-0 snap-start grid-cols-2 content-start sm:grid-cols-3">
                  {pageGroups.map((group, itemIndex) => {
                    if (group === null) {
                      return (
                        <RackCell key={`locked-${pageIndex}-${itemIndex}`}>
                          <LockedTankLink count={lockedSpeciesCount} />
                        </RackCell>
                      );
                    }
                    const tank = group[0];
                    const color = tankColor(tank);
                    const representative = pickRepresentative(group);
                    const count = group.reduce((sum, t) => sum + t.individuals.length, 0);

                    return (
                      <RackCell key={tank.speciesId} plate={`棚${tank.tankNumber}`}>
                        <TankButton
                          onClick={() => setSelectedTankId(tank.tankId)}
                          variant={tank.speciesAreaCode === "aquarium" ? "aquarium" : tank.speciesAreaCode === "ancient" ? "ancient" : "terrarium"}
                          name={tank.speciesName}
                          sub={count > 1 ? `${count}匹` : GROWTH_STAGE_LABEL[representative.growthStage]}
                        >
                          <TankOccupant
                            color={color}
                            sizeScale={representative.sizeScale}
                            speciesCode={representative.speciesCode}
                            mandibleVariant={representative.mandibleVariant}
                            growthStage={representative.growthStage}
                          />
                        </TankButton>
                      </RackCell>
                    );
                  })}
                  {newPages.length > 1 ? (
                    <RackEmptyCells count={newPageSize - pageGroups.length} />
                  ) : (
                    <RackFillers count={pageGroups.length} />
                  )}
                </div>
              ))}
            </div>
            {newPages.length > 1 && (
              <div className="absolute left-1/2 top-1 z-10 flex -translate-x-1/2 gap-2">
                {newPage > 0 && (
                  <button
                    type="button"
                    aria-label="前の棚へ"
                    onClick={() => scrollNewShelf(-1)}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/50 text-zinc-500 shadow ring-1 ring-zinc-300/70 backdrop-blur-sm transition hover:bg-white/80 active:scale-95"
                  >
                    <ChevronLeft className="h-5 w-5" strokeWidth={1.75} />
                  </button>
                )}
                {newPage < newPages.length - 1 && (
                  <button
                    type="button"
                    aria-label="次の棚へ"
                    onClick={() => scrollNewShelf(1)}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/50 text-zinc-500 shadow ring-1 ring-zinc-300/70 backdrop-blur-sm transition hover:bg-white/80 active:scale-95"
                  >
                    <ChevronRight className="h-5 w-5" strokeWidth={1.75} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {tintCeremony && <TintCeremony info={tintCeremony} onDone={() => setTintCeremony(null)} />}
      {rimCeremony && <RimCeremony info={rimCeremony} onDone={() => setRimCeremony(null)} />}

      {itemsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setItemsOpen(false)}
        >
          <div
            className="max-h-[80vh] w-full max-w-sm overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-zinc-800">持ち物</h2>
              <button
                type="button"
                onClick={() => setItemsOpen(false)}
                className="rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                aria-label="閉じる"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="mb-2 text-xs font-semibold text-zinc-500">色の実</p>
            {shizukuItems.length === 0 ? (
              <p className="text-sm text-zinc-400">なし</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {shizukuItems.map((item) => (
                  <li
                    key={item.itemKey}
                    className="flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- 自前SVGアート */}
                    <img
                      src="/roadmap/items/shizuku.svg"
                      alt=""
                      className="h-8 w-8 object-contain"
                      style={{ filter: tintFilter(item.itemKey) }}
                    />
                    <span className="flex-1 text-sm font-semibold text-zinc-800">
                      {item.itemKey}
                    </span>
                    <span className="text-sm font-bold tabular-nums text-zinc-600">
                      ×{item.quantity}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {rimItems.length > 0 && (
              <>
                <p className="mb-2 mt-4 text-xs font-semibold text-zinc-500">星のカケラ</p>
                <ul className="flex flex-col gap-2">
                  {rimItems.map((item) => (
                    <li key={item.itemKey} className="flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                      {/* eslint-disable-next-line @next/next/no-img-element -- 自前SVGアート */}
                      <img src={`/roadmap/items/rim-${item.itemKey}.svg`} alt="" className="h-8 w-8 object-contain" />
                      <span className="flex-1 text-sm font-semibold text-zinc-800">{item.itemKey === "gold" ? "金星のカケラ" : "銀星のカケラ"}</span>
                      <span className="text-sm font-bold tabular-nums text-zinc-600">×{item.quantity}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {decoItems.length > 0 && (
              <>
                <p className="mb-2 mt-4 text-xs font-semibold text-zinc-500">置物</p>
                <ul className="flex flex-col gap-2">
                  {decoItems.map((item) => (
                    <li key={item.itemKey} className="flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2">
                      {/* eslint-disable-next-line @next/next/no-img-element -- 自前SVGアート */}
                      <img src={DECO_BY_KEY[item.itemKey].file} alt="" className="h-8 w-8 object-contain" />
                      <span className="flex-1 text-sm font-semibold text-zinc-800">{DECO_BY_KEY[item.itemKey].label}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}

      {selectedTank && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-2 sm:p-4"
          onClick={() => {
            setSelectedTankId(null);
            setDecoEdit(false);
            setDecoSelectedKey(null);
            closeTintPanel();
          }}
        >
          <div
            className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-1.5 shadow-xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-center justify-between px-2 pt-1.5 sm:mb-3 sm:px-0 sm:pt-0">
              <h2 className="text-base font-bold text-zinc-800 sm:text-lg">
                {selectedTank.speciesKind === "known"
                  ? selectedTank.speciesName
                  : `棚${selectedTank.tankNumber}・${selectedTank.speciesName}`}
              </h2>
              <button
                type="button"
                onClick={() => {
                  setSelectedTankId(null);
                  closeTintPanel();
                }}
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

            <EnlargedTankVisual
              key={selectedTank.tankId}
              tank={selectedTank}
              color={tankColor(selectedTank)}
              nicknameOf={nicknameOf}
              tintOf={tintOf}
              rimOf={rimOf}
              actionsOf={actionsOf}
              debugAction={debugAction}
              murmurs={murmurs}
              placedDecos={placedDecos.filter((p) => p.tankId === selectedTank.tankId)}
              decoEdit={decoEdit}
              decoSelectedKey={decoSelectedKey}
              onDecoTap={handleDecoTap}
              onDecoMove={handleDecoMove}
              debugDeco={debugDeco}
              onTapIndividual={(id) => {
                if (
                  selectedTank.individuals.find((i) => i.id === id)
                    ?.growthStage !== "成虫"
                )
                  return;
                setTintTargetId(id);
                setTintPreview(null);
                setTintError(null);
              }}
            />

            {selectedTank.speciesAreaCode !== "aquarium" && selectedTank.speciesAreaCode !== "ancient" && (
              <div className="mb-2">
                <button
                  type="button"
                  onClick={() => {
                    setDecoEdit((v) => !v);
                    setDecoSelectedKey(null);
                    setDecoError(null);
                  }}
                  className={`rounded-full border px-3 py-1 text-xs font-semibold ${decoEdit ? "border-amber-400 bg-amber-50 text-amber-700" : "border-zinc-200 bg-white text-zinc-600"}`}
                >
                  置物 {placedDecos.filter((p) => p.tankId === selectedTank.tankId && !isBaseDecoKey(p.itemKey)).length}/{MAX_DECOS_PER_TANK}
                </button>
                {decoEdit && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {decoItems.map((item) => {
                      const def = DECO_BY_KEY[item.itemKey];
                      const p = placedDecos.find((x) => x.itemKey === item.itemKey);
                      const here = p?.tankId === selectedTank.tankId;
                      const sel = decoSelectedKey === item.itemKey;
                      return (
                        <button
                          key={item.itemKey}
                          type="button"
                          onClick={() => setDecoSelectedKey(sel ? null : item.itemKey)}
                          className={`relative flex items-center gap-1 rounded-lg border px-2 py-1 text-xs ${sel ? "border-amber-400 bg-amber-50" : "border-zinc-200 bg-white"} ${p && !here ? "opacity-60" : ""}`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element -- 自前SVGアート */}
                          <img src={def.file} alt="" className="h-6 w-6 object-contain" />
                          <span>{def.label}</span>
                          {here && <Check className="h-3 w-3 text-emerald-600" />}
                        </button>
                      );
                    })}
                    {decoSelectedKey && !isBaseDecoKey(decoSelectedKey) && placedDecos.some((p) => p.itemKey === decoSelectedKey) && (
                      <button
                        type="button"
                        onClick={() => {
                          void handleDecoRemove(decoSelectedKey);
                          setDecoSelectedKey(null);
                        }}
                        className="rounded-full border border-zinc-200 bg-white px-3 py-1 text-xs text-zinc-600"
                      >
                        外す
                      </button>
                    )}
                    {decoError && <span className="text-xs text-red-500">{decoError}</span>}
                  </div>
                )}
              </div>
            )}

            {process.env.NODE_ENV === "development" && (
              <div className="mb-2 flex flex-wrap gap-1 rounded-lg border border-dashed border-zinc-300 p-2">
                {(Object.keys(ACTIONS) as ActionId[]).map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setDebugAction((prev) => ({ id, n: (prev?.n ?? 0) + 1 }))}
                    className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-600 hover:border-amber-400"
                  >
                    {ACTIONS[id].label}
                  </button>
                ))}
                {placedDecos
                  .filter((p) => p.tankId === selectedTank.tankId && DECO_BY_KEY[p.itemKey])
                  .map((p) => (
                    <button
                      key={p.itemKey}
                      type="button"
                      onClick={() => setDebugDeco((prev) => ({ key: p.itemKey, n: (prev?.n ?? 0) + 1 }))}
                      className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-700"
                    >
                      置物: {DECO_BY_KEY[p.itemKey].label}
                    </button>
                  ))}
              </div>
            )}

            {tintTargetId &&
              (() => {
                const target = selectedTank.individuals.find(
                  (i) => i.id === tintTargetId,
                );
                if (!target) return null;
                return (
                  <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-bold text-zinc-800">
                        {nicknameOf(target) ?? target.speciesName}
                        <span className="ml-2 text-xs font-normal text-zinc-500">
                          {GROWTH_STAGE_LABEL[target.growthStage]}
                          {target.growthStage === "成虫"
                            ? `・サイズ${target.sizeLevel}`
                            : ""}
                        </span>
                      </p>
                      <button
                        type="button"
                        onClick={closeTintPanel}
                        className="rounded-full p-1 text-zinc-400 hover:bg-amber-100 hover:text-zinc-600"
                        aria-label="閉じる"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {rimItems.length > 0 && (
                      <>
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {rimItems.map((item) => (
                            <button
                              key={item.itemKey}
                              type="button"
                              onClick={() => setRimPreview(rimPreview === item.itemKey ? null : (item.itemKey as RimKey))}
                              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                                rimPreview === item.itemKey ? "border-amber-500 bg-white text-zinc-900" : "border-zinc-200 bg-white/70 text-zinc-600"
                              }`}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element -- 自前SVGアート */}
                              <img src={`/roadmap/items/rim-${item.itemKey}.svg`} alt="" className="h-4 w-4 object-contain" />
                              {item.itemKey === "gold" ? "金星のカケラ" : "銀星のカケラ"}
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          disabled={!rimPreview || tintBusy}
                          onClick={() => rimPreview && void applyRim(target, rimPreview)}
                          className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-full bg-zinc-700 py-2 text-sm font-bold text-white transition-transform active:scale-95 disabled:opacity-40"
                        >
                          星のカケラをふりかける
                        </button>
                      </>
                    )}
                    {shizukuItems.length === 0 ? (
                      rimItems.length === 0 ? (
                        <p className="text-xs text-zinc-500">色の実がありません</p>
                      ) : null
                    ) : (
                      <>
                        <div className="mb-2 flex flex-wrap gap-1.5">
                          {shizukuItems.map((item) => (
                            <button
                              key={item.itemKey}
                              type="button"
                              onClick={() =>
                                setTintPreview(
                                  tintPreview === item.itemKey
                                    ? null
                                    : item.itemKey,
                                )
                              }
                              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                                tintPreview === item.itemKey
                                  ? "border-amber-500 bg-white text-zinc-900"
                                  : "border-zinc-200 bg-white/70 text-zinc-600"
                              }`}
                            >
                              <span
                                className="h-3 w-3 rounded-full"
                                style={{
                                  backgroundColor: shizukuSwatchColor(
                                    item.itemKey,
                                  ),
                                }}
                              />
                              {item.itemKey}
                              <span className="tabular-nums text-zinc-400">
                                ×{item.quantity}
                              </span>
                            </button>
                          ))}
                        </div>
                        <button
                          type="button"
                          disabled={!tintPreview || tintBusy}
                          onClick={() =>
                            tintPreview &&
                            void applyTint(target, tintPreview)
                          }
                          className="flex w-full items-center justify-center gap-1.5 rounded-full bg-amber-500 py-2 text-sm font-bold text-white transition-transform active:scale-95 disabled:opacity-40"
                        >
                          <Paintbrush className="h-4 w-4" />
                          色の実をあげる
                        </button>
                      </>
                    )}
                    {tintError && (
                      <p className="mt-2 text-xs text-red-500">{tintError}</p>
                    )}
                  </div>
                );
              })()}

            <ul className="flex flex-col gap-2">
              {selectedTank.individuals.map((individual) => (
                <li
                  key={individual.id}
                  className="flex items-center gap-3 rounded-lg border border-zinc-100 bg-zinc-50 px-3 py-2"
                >
                  <div className="flex w-10 shrink-0 flex-col items-center gap-1">
                    <TankOccupant
                      color={tankColor(selectedTank)}
                      sizeScale={individual.sizeScale}
                      speciesCode={individual.speciesCode}
                      mandibleVariant={individual.mandibleVariant}
                      growthStage={individual.growthStage}
                      tintKey={tintOf(individual)}
                      rimKey={rimOf(individual)}
                    />
                    {individual.growthGauge && <GrowthGauge gauge={individual.growthGauge} />}
                    {individual.growthStage === "成虫" && (
                      <SizeGauge level={individual.sizeLevel} ratio={individual.sizeRatio} />
                    )}
                  </div>
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
                    <span className="text-zinc-400">
                      {formatDate(individual.obtainedAt)}
                    </span>
                    {individual.growthStage === "成虫" && (
                      <button
                        type="button"
                        onClick={() => {
                          setTintTargetId(individual.id);
                          setTintPreview(null);
                          setTintError(null);
                        }}
                        className="mt-1 flex w-fit items-center gap-1 rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-500 hover:border-amber-300 hover:text-amber-700"
                      >
                        <Paintbrush className="h-3 w-3" />
                        色づけ
                      </button>
                    )}
                    {editingId === individual.id && nicknameError && (
                      <span className="text-red-500">{nicknameError}</span>
                    )}
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

// 開発用: 全種類の絵に当たり判定の円(青=避ける広さ、赤破線=止まる距離)を重ねて並べる確認画面。
export function CollisionShapeGallery() {
  const [stage, setStage] = useState<KuwagataGrowthStage>("成虫");
  const codes = Object.keys(KNOWN_CREATURE_ART).sort();
  return (
    <div className="p-4">
      <div className="mb-3 flex gap-2">
        {(["成虫", "幼虫"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStage(s)}
            className={`rounded border px-3 py-1 text-sm ${stage === s ? "bg-zinc-800 text-white" : "bg-white"}`}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {codes.map((code) => {
          const shape = bodyShapeFor(code, stage);
          return (
            <div key={code} className="rounded border border-zinc-200 bg-zinc-50 p-2">
              <div className="mb-1 text-xs text-zinc-600">
                {code}
                {shape.length > 1 ? "(楕円)" : ""}
              </div>
              <div className="relative mx-auto aspect-square w-full max-w-[220px] border-b border-zinc-400">
                <KnownCreatureSprite code={code} facing="front" mandibleVariant={1} growthStage={stage} />
                {shape.map((c, i) => (
                  <span key={i}>
                    <span
                      className="pointer-events-none absolute rounded-full border-2 border-sky-500/80 bg-sky-400/10"
                      style={{ left: `${(0.5 + c.dx - c.r) * 100}%`, top: `${(1 - c.dy - c.r) * 100}%`, width: `${c.r * 200}%`, height: `${c.r * 200}%` }}
                    />
                    <span
                      className="pointer-events-none absolute rounded-full border-2 border-dashed border-red-500/80"
                      style={{ left: `${(0.5 + c.dx - c.r * BUMP_CONTACT_FACTOR) * 100}%`, top: `${(1 - c.dy - c.r * BUMP_CONTACT_FACTOR) * 100}%`, width: `${c.r * BUMP_CONTACT_FACTOR * 200}%`, height: `${c.r * BUMP_CONTACT_FACTOR * 200}%` }}
                    />
                  </span>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
