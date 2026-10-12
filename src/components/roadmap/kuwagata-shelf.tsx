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
  grab?: { a: [number, number, number]; p1: [number, number]; p2: [number, number]; p3: [number, number] }; src: string; delay: string; kind?: "wing" | "scythe" | "claw" | "tail" | "tail-ghost" | "grab" | "paddle" | "hind-thigh" | "hind-shin"; hind?: { knee: [number, number]; dir: 1 | -1 }; origin?: string; baseRotateDeg?: number; shiftYPct?: number; squashAt?: { x: number; y: number }; clawDir?: 1 | -1; ghostOpacity?: number; paddleDir?: 1 | -1; flapDir?: 1 | -1 };

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
  // 水の中を泳ぐ種(動きの種類F)。後ろ足(kind:"paddle")が付け根を軸に水を掻く。
  swimming?: boolean;
  // お腹(体の一部)がぼんやり光る種(ホタたん)。中心位置と直径は絵のキャンバスに対する%。
  glow?: { left: number; top: number; size: number };
  // trueなら体の形の中だけを光の帯が走る演出(ルリたん)に対応する種。
  shine?: boolean;
  // 裏返しの姿(コメたん)。ぶつかって裏返っている間は、体・脚のパーツの代わりにこの1枚を出す。
  flippedSrc?: string;
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
  // コメたん(コメツキムシ。置物・他の個体にぶつかると裏返ってじたばた→パチンと跳ねる=CLICK_*)
  "KW-0048": buildClickBeetleArt("KW-0048"),
  // ヘビたん(ヘビトンボ。大顎をガチガチ+大顎がキラッ=CHOMP_*。たまに羽ばたいて短い距離を飛ぶ=SNAKEFLY_*)
  "KW-0047": buildSnakeflyArt(),
  // ハンたん(ハンミョウ。大顎をガチガチ=CHOMP_*。たまに弧を描いて素早く飛んで移動=LEAP_*)
  "KW-0027": buildNewSpeciesWalkerArt("KW-0027", { frontOrigin: "30% 88%", backOrigin: "90% 60%" }),
  // カミたん(カミキリムシ。大顎mandible_01をときどきガチガチ=CHOMP_*)
  // オサたん(オサムシ。標準の歩く6脚＋大顎。大顎mandible_01をガチガチ=CHOMP_*)
  "KW-0044": buildNewSpeciesWalkerArt("KW-0044", { frontOrigin: "38% 82%", backOrigin: "90% 66%" }),
  "KW-0017": buildLongicornArt("KW-0017", { front: "31% 85%", back: "90% 58%" }),
  // カブたん(カブトムシ。ツノはmandible_01、付け根を軸にときどき首振り＝HORN_*)
  "KW-0014": buildNewSpeciesWalkerArt("KW-0014", {
    frontOrigin: "29% 43%",
    backOrigin: "76% 38%",
    backBehindBody: true,
  }),
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
function KnownCreatureSprite({
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
        <img src={c.body1} alt="" className="absolute inset-0 h-full w-full drop-shadow-sm" />
        <img src={c.legL.src} alt="" className="animate-kuwagata-court-leg absolute inset-0 h-full w-full" style={legStyle(c.legL, "0s")} />
        <img src={c.legR.src} alt="" className="animate-kuwagata-court-leg absolute inset-0 h-full w-full" style={legStyle(c.legR, "-0.11s")} />
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

  // 大顎(ツノ)。既定は一番手前、mandibleBehindBodyの向きは最背面(本体より奥)に描く。
  const heraShow = isHera(code) && shine;
  const jawClassName = `absolute inset-0 h-full w-full ${heraShow ? "animate-kuwagata-nod" : ""} ${fighting ? "animate-kuwagata-fight-jaw" : ""} ${hornSwing && art.mandibleOrigin ? "animate-kuwagata-horn" : ""} ${chomp && art.mandibleOrigin ? (code === SNAKEFLY_SPECIES_CODE ? "animate-kuwagata-chomp-big" : "animate-kuwagata-chomp") : ""} ${sniff && art.mandibleOrigin ? "animate-kuwagata-sniff" : ""}`;
  // グンたん: ガチガチの間、大顎の形でくり抜いた光がキラッと走る(大顎と一緒に動く)。
  const jawShine = (((code === JAW_SHINE_SPECIES_CODE || code === SNAKEFLY_SPECIES_CODE) && chomp) || heraShow) && mandible;
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
      <img src={art.body} alt="" className="absolute inset-0 h-full w-full drop-shadow-sm" />
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
  // ヘビたんの羽根は、飛んでいる間だけ羽ばたく。
  if (kind === "wing" && code === SNAKEFLY_SPECIES_CODE) return airborne ? "animate-kuwagata-wing-snakefly" : "";
  if (kind === "wing") return isFastFlap(code) ?"animate-kuwagata-wing-dragonfly" : "animate-kuwagata-wing";
  if (kind === "scythe") return scythe ? "animate-kuwagata-scythe" : "";
  return "animate-kuwagata-leg";
}

export function TankOccupant({
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

// 平行四辺形なので back + u*(right-back) + v*(left-back) で底の面内の任意の点が求まる。
// u, vは0〜1だが、スプライトの見た目の大きさ分の余白を持たせるため呼び出し側では
// 0.12〜0.88程度の範囲に収めて「安全地帯」を作る。wは水中の高さ(0=底〜1=水面)。
function surfacePoint(u: number, v: number, geo: TankGeometry = TERRARIUM_GEOMETRY, w = 0): { left: number; top: number } {
  const left = geo.back.left + u * (geo.right.left - geo.back.left) + v * (geo.left.left - geo.back.left);
  const top = geo.back.top + u * (geo.right.top - geo.back.top) + v * (geo.left.top - geo.back.top) - w * geo.heightPct;
  return { left, top };
}

// 歩き回る・置かれる位置(u,v)の候補を、天面のほぼ全体(縁から0.08だけ内側)から選ぶ。
// ただし虫は幅の半分ほどが左右にはみ出すので、アンカーの横位置は水槽の端から
// 「虫の幅の約35%」以上内側に制限する(大きい虫ほど左右の端に寄れない)。
// 奥・手前の縁は、虫が縁の上に立って見えるだけなので制限しない。
const SPOT_EDGE_MARGIN = 0.08;
function pickRandomSpot(widthPct: number, random: () => number, geo: TankGeometry = TERRARIUM_GEOMETRY): { u: number; v: number } {
  const halfWidth = widthPct * 0.35;
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = {
      u: SPOT_EDGE_MARGIN + random() * (1 - 2 * SPOT_EDGE_MARGIN),
      v: SPOT_EDGE_MARGIN + random() * (1 - 2 * SPOT_EDGE_MARGIN),
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

// 歩く速さ。移動時間(travelMs)=距離(横幅%相当)×TRAVEL_MS_PER_PCT を、MIN〜MAXの範囲に収める。
// 大きいほどゆっくり歩く(2026-10: 移動範囲を全面に広げて速く見えたため、固定7秒から距離比例に変更)。
const TRAVEL_MS_PER_PCT = 700;
// ハンたん: たまに弧を描いて素早く飛んで移動する。頻度は低め(移動のたびにLEAP_CHANCEの確率)、飛行時間はLEAP_MS。
const LEAP_SPECIES_CODE = "KW-0027";
// 保留中(0=飛ばない)。羽根を広げた姿の絵ができたら、飛ぶ間だけその絵に切り替えて0.4前後に戻す。
const LEAP_CHANCE = 0;
const LEAP_MS = 1100;
// ヘビたん: たまに羽ばたいて短い距離を飛ぶ(移動のたびにSNAKEFLY_CHANCEの確率)。距離はSNAKEFLY_MAX_DIST_PCT以下、飛行時間はSNAKEFLY_MS。
const SNAKEFLY_SPECIES_CODE = "KW-0047";
const SNAKEFLY_CHANCE = 0.4;
const SNAKEFLY_MS = 1800;
const SNAKEFLY_MAX_DIST_PCT = 30;
// コメたん: 歩いている途中で置物や他の個体にぶつかったら、その場で裏返ってじたばた(CLICK_FLIP_MS)し、
// パチンと跳ねて(CLICK_HOP_MS)近くに着地する。ぶつからない移動のときは普通に歩くだけ。
const CLICK_BEETLE_SPECIES_CODE = "KW-0048";
const CLICK_FLIP_MS = 1800;
const CLICK_HOP_MS = 1000;
const CLICK_HOP_MAX_DIST_PCT = 20;
const CLICK_MIN_WALK_MS = 1200;
// ぶつかる地点へは、ふだんより速く突っ込む(距離1%あたりのms)。当たった勢いで少し弾き返される(CLICK_RECOIL_MS)。
const CLICK_DASH_MS_PER_PCT = 400;
const CLICK_RECOIL_MS = 260;
// 円の半径の和に対する「ぶつかった」とみなす距離の比。小さいほど、絵が実際に触れるくらいまで近づく。
const CLICK_CONTACT_FACTOR = 0.6;
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
  decorationSpots: { u: number; v: number; widthPct: number }[],
  positionsRef: { current: Record<string, { u: number; v: number; widthPct: number }> },
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
  courtChance = 0
): { spot: { u: number; v: number }; facing: Facing; heading: Heading; travelMs: number; leaping: boolean; charging: boolean; posing: boolean; flipped?: boolean; hitting?: boolean; courting?: boolean } {
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
    let leapTimer: ReturnType<typeof setTimeout> | undefined;
    let chargeTimer: ReturnType<typeof setTimeout> | undefined;
    let poseTimer: ReturnType<typeof setTimeout> | undefined;
    let flipTimer: ReturnType<typeof setTimeout> | undefined;
    const ownRadius = spriteRadius(widthPct);
    const decorationPts = decorationSpots.map((spot) => ({ pt: surfacePoint(spot.u, spot.v, geo), radius: spriteRadius(spot.widthPct) }));

    const pickNextSpot = () => {
      const others = Object.entries(positionsRef.current).filter(([id]) => id !== seedKey);
      let best = pickRandomSpot(widthPct, Math.random, geo);
      let bestSlack = -Infinity;
      for (let attempt = 0; attempt < SPOT_PICK_ATTEMPTS; attempt++) {
        const candidate = pickRandomSpot(widthPct, Math.random, geo);
        const pt = surfacePoint(candidate.u, candidate.v, geo);
        // スコア=一番近い障害物との余裕(距離-必要距離)の最小値。プラスなら衝突なし、
        // マイナスでも値が大きい(=0に近い)ほど「まだマシな重なり方」として優先される。
        let slack = Infinity;
        for (const d of decorationPts) {
          slack = Math.min(slack, surfaceDistancePct(pt, d.pt) - (ownRadius + d.radius));
        }
        for (const [, other] of others) {
          slack = Math.min(slack, surfaceDistancePct(pt, surfacePoint(other.u, other.v, geo)) - (ownRadius + spriteRadius(other.widthPct)));
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
        let hopSpot = pickNextSpot();
        let hopDist = surfaceDistancePct(prevPt0, surfacePoint(hopSpot.u, hopSpot.v, geo));
        for (let i = 0; i < 14 && hopDist > hopMaxDistPct; i++) {
          const cand = pickNextSpot();
          const d = surfaceDistancePct(prevPt0, surfacePoint(cand.u, cand.v, geo));
          if (d < hopDist) {
            hopSpot = cand;
            hopDist = d;
          }
        }
        const charging = { ...prev, leaping: false, charging: true };
        stateRef.current = charging;
        setState(charging);
        chargeTimer = setTimeout(() => {
          if (cancelled) return;
          positionsRef.current[seedKey] = { ...hopSpot, widthPct };
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
      let nextSpot = pickNextSpot();
      if (leaping && Number.isFinite(leapMaxDistPct)) {
        // 飛ぶときは、近めの着地点を選ぶ(短い距離)。
        let nextDist = surfaceDistancePct(prevPt, surfacePoint(nextSpot.u, nextSpot.v, geo));
        for (let i = 0; i < 14 && nextDist > leapMaxDistPct; i++) {
          const cand = pickNextSpot();
          const d = surfaceDistancePct(prevPt, surfacePoint(cand.u, cand.v, geo));
          if (d < nextDist) {
            nextSpot = cand;
            nextDist = d;
          }
        }
      }
      positionsRef.current[seedKey] = { ...nextSpot, widthPct };
      const nextPt = surfacePoint(nextSpot.u, nextSpot.v, geo);
      const dx = nextPt.left - prevPt.left;
      const dy = nextPt.top - prevPt.top;
      const facing: Facing = Math.abs(dy) >= Math.abs(dx) ? (dy >= 0 ? "front" : "back") : dx <= 0 ? "front" : "back";
      const heading: Heading = dx === 0 ? prev.heading : dx < 0 ? "left" : "right";
      if (flipTrap && !leaping) {
        // コメたん: 目的地までの直線が置物・他の個体の円と交わるなら、交わる手前まで歩いてぶつかり、
        // 裏返ってじたばた→パチンと跳ねて近くに着地する。動く相手は出発時の位置で判定する。
        const obstacles = [
          ...decorationPts,
          ...Object.entries(positionsRef.current)
            .filter(([id]) => id !== seedKey)
            .map(([, other]) => ({ pt: surfacePoint(other.u, other.v, geo), radius: spriteRadius(other.widthPct) })),
        ].filter((o) => surfaceDistancePct(prevPt, o.pt) >= (ownRadius + o.radius) * CLICK_CONTACT_FACTOR);
        const STEPS = 48;
        let hitStep = -1;
        for (let k = 1; k <= STEPS && hitStep < 0; k++) {
          const t = k / STEPS;
          const pt = { left: prevPt.left + (nextPt.left - prevPt.left) * t, top: prevPt.top + (nextPt.top - prevPt.top) * t };
          if (obstacles.some((o) => surfaceDistancePct(pt, o.pt) < (ownRadius + o.radius) * CLICK_CONTACT_FACTOR)) hitStep = k;
        }
        if (hitStep >= 4) {
          const tc = hitStep / STEPS;
          const contactSpot = {
            u: prev.spot.u + (nextSpot.u - prev.spot.u) * tc,
            v: prev.spot.v + (nextSpot.v - prev.spot.v) * tc,
          };
          const contactPt = surfacePoint(contactSpot.u, contactSpot.v, geo);
          positionsRef.current[seedKey] = { ...contactSpot, widthPct };
          const walkMs = Math.max(CLICK_MIN_WALK_MS, surfaceDistancePct(prevPt, contactPt) * CLICK_DASH_MS_PER_PCT * travelScale);
          const approach = { spot: contactSpot, facing, heading, travelMs: walkMs, leaping: false, charging: false, posing: false, hitting: true, flipped: false };
          stateRef.current = approach;
          setState(approach);
          flipTimer = setTimeout(() => {
            if (cancelled) return;
            // 当たった勢いで、来た道を少し弾き返されながら裏返る。
            const rb = Math.min(0.12, tc * 0.5);
            const recoilSpot = {
              u: prev.spot.u + (nextSpot.u - prev.spot.u) * (tc - rb),
              v: prev.spot.v + (nextSpot.v - prev.spot.v) * (tc - rb),
            };
            const flippedState = { ...stateRef.current, spot: recoilSpot, travelMs: CLICK_RECOIL_MS, hitting: false, flipped: true };
            stateRef.current = flippedState;
            setState(flippedState);
            flipTimer = setTimeout(() => {
              if (cancelled) return;
              // パチン: 近めの着地点へ跳ねる(裏返しから元の姿に戻る)。
              let landing = pickNextSpot();
              let landDist = surfaceDistancePct(contactPt, surfacePoint(landing.u, landing.v, geo));
              for (let i = 0; i < 14 && landDist > CLICK_HOP_MAX_DIST_PCT; i++) {
                const cand = pickNextSpot();
                const d = surfaceDistancePct(contactPt, surfacePoint(cand.u, cand.v, geo));
                if (d < landDist) {
                  landing = cand;
                  landDist = d;
                }
              }
              positionsRef.current[seedKey] = { ...landing, widthPct };
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
          timer = setTimeout(goToNextSpot, walkMs + CLICK_FLIP_MS + CLICK_HOP_MS + 2000 + Math.random() * 5000);
          return;
        }
      }
      // 移動時間は距離に比例(歩く速さを一定に保つ)。移動範囲が広くても速くならない。
      // たまに(leapChance)、歩かずに速く弧を描いて飛んで移動する(着地まで LEAP_MS)。
      const travelMs = leaping
        ? leapMs
        : Math.min(
            MAX_TRAVEL_MS * travelScale,
            Math.max(MIN_TRAVEL_MS * travelScale, surfaceDistancePct(prevPt, nextPt) * TRAVEL_MS_PER_PCT * travelScale)
          );
      const next = { spot: nextSpot, facing, heading, travelMs, leaping, charging: false, posing: false };
      stateRef.current = next;
      setState(next);
      if (leaping) {
        leapTimer = setTimeout(() => {
          if (cancelled) return;
          const landed = { ...stateRef.current, leaping: false };
          stateRef.current = landed;
          setState(landed);
        }, travelMs);
      }
      // 次の移動は、到着してからひと休みした後(休み2〜7秒)
      timer = setTimeout(goToNextSpot, travelMs + (2000 + Math.random() * 5000) * restScale);
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
    };
  }, [seedKey, widthPct, moves, decorationSpots, positionsRef, travelScale, leapChance, chargeHopChance, poseChance, chargeMs, hopMs, hopMaxDistPct, restScale, geo, leapMs, leapMaxDistPct, flipTrap, courtChance]);

  return state;
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
  positionsRef: { current: Record<string, { u: number; v: number; widthPct: number; w?: number }> },
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
  decorationSpots: { u: number; v: number; widthPct: number }[],
  taken: { u: number; v: number; widthPct: number }[],
  geo: TankGeometry = TERRARIUM_GEOMETRY,
): { u: number; v: number } {
  const random = seededRandom(seedKey);
  const ownRadius = spriteRadius(widthPct);
  const obstacles = [...decorationSpots, ...taken].map((o) => ({ pt: surfacePoint(o.u, o.v, geo), radius: spriteRadius(o.widthPct) }));
  let best = { u: 0.5, v: 0.5 };
  let bestSlack = -Infinity;
  for (let attempt = 0; attempt < SPOT_PICK_ATTEMPTS * 2; attempt++) {
    const candidate = pickRandomSpot(widthPct, random, geo);
    const pt = surfacePoint(candidate.u, candidate.v, geo);
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
  positionsRef,
  hasCompanions,
  geo,
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
  positionsRef: { current: Record<string, { u: number; v: number; widthPct: number; w?: number }> };
  // 同じ水槽に自分以外の個体がいるか(シャベクワたんの「喋る仕草」の条件)
  hasCompanions: boolean;
  // この水槽の立体の実測(底の面と水面の高さ)。テラリウムとアクアリウムで違う。
  geo: TankGeometry;
}) {
  const chatterBubble = useChatter(
    hasCompanions && speciesCode === CHATTER_SPECIES_CODE && growthStage === "成虫" && hasArt,
    seedKey
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
    (speciesCode === CHOMP_SPECIES_CODE || speciesCode === CHOMP_SPECIES_CODE_2 || speciesCode === CHOMP_SPECIES_CODE_3 || speciesCode === HORNET_SPECIES_CODE || speciesCode === "KW-0024" || speciesCode === "KW-0044" || speciesCode === "KW-0033" || speciesCode === SNAKEFLY_SPECIES_CODE || speciesCode === TAIL_STRIKE_SPECIES_CODE) && growthStage === "成虫" && hasArt,
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
    speciesCode === TAIL_STRIKE_SPECIES_CODE && growthStage === "成虫" && hasArt,
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
  const swimmer = isSwimmer(speciesCode) && growthStage === "成虫";
  const walk = useWander(
    seedKey,
    initialSpot,
    widthPct,
    moves && !swimmer,
    decorationSpots,
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
    speciesCode === COURT_SPECIES_CODE && growthStage === "成虫" ? COURT_CHANCE : 0
  );
  // 水中を泳ぐ種は、歩く代わりに3次元(底〜水面)を泳ぎ回る。
  const swim = useSwim(seedKey, initialSpot, widthPct, moves && swimmer, positionsRef, geo);
  const { facing, heading, leaping, charging, posing } = swimmer ? { ...walk, ...swim, leaping: false, charging: false, posing: false } : walk;
  const flipped = !swimmer && !!walk.flipped;
  const hitting = !swimmer && !!walk.hitting;
  const courting = !swimmer && !!walk.courting;
  const spot = swimmer ? swim.spot : walk.spot;
  const travelMs = swimmer ? swim.travelMs : walk.travelMs;
  const swimming = swimmer && swim.moving;
  const pt = surfacePoint(spot.u, spot.v, geo, swimmer ? swim.spot.w : 0);
  // 飛ぶ種は縦横で別のイージングにして、目的地まで直線ではなく滑らかな曲線(弧)を描いて飛ぶ。
  // 弧の向き(上に膨らむ/下に膨らむ)は目的地ごとに決まる。
  const flyingCurve = isCurveFlight(speciesCode) && growthStage === "成虫";
  const arcUp = Math.round(spot.u * 100 + spot.v * 100) % 2 === 0;
  const straightFlight = isDragonfly(speciesCode) && growthStage === "成虫";
  // 泳ぐ種は、掻いて勢いよく出て、だんだん減速して止まる(ゆっくり漂うように着く)。
  const moveTransition = swimmer
    ? `left ${travelMs}ms cubic-bezier(0.25, 0.6, 0.3, 1), top ${travelMs}ms cubic-bezier(0.25, 0.6, 0.3, 1)`
    : flipped
    ? `left ${travelMs}ms ease-out, top ${travelMs}ms ease-out`
    : leaping || hitting
    ? `left ${travelMs}ms linear, top ${travelMs}ms linear`
    : straightFlight
    ? `left ${travelMs}ms linear, top ${travelMs}ms linear`
    : flyingCurve
    ? `left ${travelMs}ms cubic-bezier(0.45, 0, 0.55, 1), top ${travelMs}ms ${
        arcUp ? "cubic-bezier(0.3, 0, 0.2, 1)" : "cubic-bezier(0.8, 0, 0.7, 1)"
      }`
    : `left ${travelMs}ms ease-in-out, top ${travelMs}ms ease-in-out`;

  return (
    <div
      className="absolute -translate-y-full"
      style={{
        left: `${pt.left}%`,
        top: `${pt.top}%`,
        width: `${widthPct}%`,
        aspectRatio: hasArt ? "1 / 1" : undefined,
        transition: moveTransition,
        // 実アートは左右反転しない(反転すると脚の左右が逆になってしまうため)。
        // Bugアイコンのフォールバックのみ、個体ごとに左右反転して向きにバリエーションを出す。
        transform: mirror ? "translateX(-50%) translateY(-100%) scaleX(-1)" : "translateX(-50%) translateY(-100%)",
      }}
    >
      {hasArt ? (
        <div
          className={`h-full w-full ${chatting ? "animate-kuwagata-chat" : ""} ${fighting ? "animate-kuwagata-fight" : ""} ${proud ? "animate-kuwagata-proud" : ""} ${hopping ? (speciesCode === HIGH_HOP_SPECIES_CODE ? "animate-kuwagata-hop-high" : "animate-kuwagata-hop") : ""} ${charging ? (isPounce(speciesCode) ? "animate-kuwagata-stalk" : "animate-kuwagata-charge") : ""} ${stinking ? "animate-kuwagata-stink" : ""}`}
          style={leaping ? { animation: `${isPounce(speciesCode) ? "kuwagata-pounce" : speciesCode === SNAKEFLY_SPECIES_CODE ? "kuwagata-fly-short" : speciesCode === CLICK_BEETLE_SPECIES_CODE ? "kuwagata-click-leap" : "kuwagata-leap"} ${travelMs}ms linear` } : undefined}
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
  const positionsRef = useRef<Record<string, { u: number; v: number; widthPct: number; w?: number }>>({});
  // この水槽の立体の実測。水を張ったアクアリウムは、底の砂利の面と、そこから水面までの高さを持つ。
  const geo = isAquarium ? AQUARIUM_GEOMETRY : TERRARIUM_GEOMETRY;
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
      const spot = pickStationarySpot(individual.id, widthPct, decorationSpots, taken, geo);
      spots[individual.id] = spot;
      taken.push({ ...spot, widthPct });
    }
    return spots;
  }, [tank, decorationSpots, geo]);

  return (
    <div
      className="relative mb-3.5 aspect-[4/3] w-full overflow-hidden rounded-lg border border-zinc-200 bg-cover bg-center"
      style={tankBgStyle(isAquarium)}
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
              key={index}
              className="absolute -translate-x-1/2 -translate-y-full"
              style={{ left: `${pt.left}%`, top: `${pt.top}%`, width: `${deco.widthPct}%` }}
            >
              <img src={deco.file} alt="" className="block w-full object-contain drop-shadow-sm" />
            </div>
          );
        })}
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
            nickname={nicknameOf(individual) ?? individual.speciesName}
            color={color}
            mirror={!hasArt && index % 2 === 1}
            decorationSpots={decorationSpots}
            positionsRef={positionsRef}
            hasCompanions={tank.individuals.length > 1}
            geo={geo}
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
  variant: "known" | "terrarium" | "aquarium";
  name: string;
  sub: string;
  children: React.ReactNode;
}) {
  const aquarium = variant === "aquarium";
  const known = variant === "known";
  const frame = known ? "border-amber-300" : aquarium ? "border-cyan-200" : "border-white";
  const air = aquarium ? "from-cyan-100/90 to-cyan-200/80" : "from-sky-50/80 to-white/50";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative block h-[114px] w-full overflow-hidden rounded-t-md border-2 border-b-0 bg-gradient-to-b shadow-inner ring-1 ring-zinc-300 transition-transform hover:scale-[1.03] active:scale-95 ${frame} ${air}`}
    >
      <div className="absolute inset-x-0 top-0 h-1 bg-zinc-300/80" />
      <div className="absolute inset-x-0 bottom-0 h-[46px]" style={aquarium ? SAND_STYLE : SOIL_STYLE} />
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

// 新種の棚の1ページの個数。PC/タブレット(sm以上)は3列×3段=9、スマホは2列×4段=8。
const NEW_SHELF_PAGE_SIZE_WIDE = 9;
const NEW_SHELF_PAGE_SIZE_NARROW = 8;

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

  const newShelfRef = useRef<HTMLDivElement>(null);
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
  // 新種の棚は9個(3×3)ずつのページに分け、右スクロールで次のページを見せる。
  const newPageSize = isWideShelf ? NEW_SHELF_PAGE_SIZE_WIDE : NEW_SHELF_PAGE_SIZE_NARROW;
  const newPages: KuwagataShelfTank[][][] = [];
  for (let i = 0; i < newGroups.length; i += newPageSize) newPages.push(newGroups.slice(i, i + newPageSize));
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
      <div className="relative px-[10px]">
        <div className="absolute inset-y-0 left-0 w-[10px] rounded-t-sm" style={RACK_POST_STYLE} />
        <div className="absolute inset-y-0 right-0 w-[10px] rounded-t-sm" style={RACK_POST_STYLE} />
        <div className="bg-gradient-to-b from-zinc-100 to-zinc-50 shadow-sm">
          <div className="h-3 border-b border-zinc-400" style={RACK_BAR_STYLE} />
          {knownTanks.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3">
              {knownGroups.map((group) => {
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
              <RackFillers count={knownGroups.length} />
            </div>
          )}

          <div className="relative">
            <div
              ref={newShelfRef}
              onScroll={handleNewShelfScroll}
              className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              {newPages.map((pageGroups, pageIndex) => (
                <div key={pageIndex} className="grid w-full shrink-0 snap-start grid-cols-2 content-start sm:grid-cols-3">
                  {pageGroups.map((group) => {
                    const tank = group[0];
                    const color = tankColor(tank);
                    const representative = pickRepresentative(group);
                    const count = group.reduce((sum, t) => sum + t.individuals.length, 0);

                    return (
                      <RackCell key={tank.speciesId} plate={`棚${tank.tankNumber}`}>
                        <TankButton
                          onClick={() => setSelectedTankId(tank.tankId)}
                          variant={tank.speciesAreaCode === "aquarium" ? "aquarium" : "terrarium"}
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
                  <div className="flex w-10 shrink-0 flex-col items-center gap-1">
                    <TankOccupant
                      color={tankColor(selectedTank)}
                      sizeScale={individual.sizeScale}
                      speciesCode={individual.speciesCode}
                      mandibleVariant={individual.mandibleVariant}
                      growthStage={individual.growthStage}
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
