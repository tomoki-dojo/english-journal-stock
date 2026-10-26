// 水槽の置物（Stage4の12シーン＋Stage5の8シーン＝20点）。そのシーンの全シナリオを習得すると1点もらえる。
// 1水槽に最大3つ、好きな位置に置ける。置いた置物には、ときどき虫が寄っていって動きを見せ、
// そのシーンの表現を吹き出しで出す。

export const ITEM_TYPE_DECO = "deco";
export const MAX_DECOS_PER_TANK = 2;

// 虫の動きの4種類。置物ごとに割り当てる（絵が決まったら、専用の動きに差し替える）。
//  hop-on: 飛び乗ってちょこんと座る / peek: のぞき込む / touch: 触る・叩く / look: 眺める
export type DecoPattern = "hop-on" | "peek" | "touch" | "look";

export type DecoDef = {
  key: string; // 持ち物のitem_key。"s4:旅行" / "s5:住まい・手続き"
  stage: 4 | 5;
  scene: string;
  label: string;
  file: string;
  widthPct: number; // 水槽に置いたときの幅(%)
  pattern: DecoPattern;
  // 置物の色（仮絵・持ち物のアイコン背景）
  color: string;
};

// 本絵(PNG)の横幅px。118pxを幅11%の基準にして、置物ごとの表示幅を比例させる。
const PNG_WIDTH_PX: Record<string, number> = {
  s4_travel: 118, s4_dining: 118, s4_shopping: 94, s4_friend: 118, s4_health: 94, s4_chat: 118,
  s4_meeting: 118, s4_mail: 94, s4_phone: 95, s4_presentation: 118, s4_negotiation: 117, s4_request: 118,
  s5_housing: 117, s5_bank: 95, s5_service: 95, s5_trouble: 95, s5_interview: 118, s5_negotiate: 95, s5_report: 95, s5_comm: 95,
};
const f = (slug: string) => `/roadmap/decos/deco_${slug}.${PNG_WIDTH_PX[slug] ? "png" : "svg"}`;

const make = (stage: 4 | 5, scene: string, slug: string, label: string, pattern: DecoPattern, color: string, widthPct = 11): DecoDef => ({
  key: `s${stage}:${scene}`,
  stage,
  scene,
  label,
  file: f(slug),
  widthPct: PNG_WIDTH_PX[slug] ? Math.round((11 * PNG_WIDTH_PX[slug]) / 118 * 10) / 10 : widthPct,
  pattern,
  color,
});

export const DECOS: DecoDef[] = [
  make(4, "旅行", "s4_travel", "スーツケース", "hop-on", "#e8903a"),
  make(4, "外食", "s4_dining", "切り株のテーブル", "hop-on", "#c9a06a"),
  make(4, "買い物", "s4_shopping", "紙袋", "peek", "#d9b382"),
  make(4, "友人", "s4_friend", "丸太のベンチ", "hop-on", "#b98a5a"),
  make(4, "体調", "s4_health", "救急箱", "peek", "#e45a5a"),
  make(4, "雑談", "s4_chat", "ふきだし岩", "look", "#9aa8b8"),
  make(4, "会議", "s4_meeting", "丸いテーブル", "look", "#8a9bb3"),
  make(4, "メール", "s4_mail", "ポスト", "peek", "#d94f4f"),
  make(4, "電話", "s4_phone", "黒電話", "touch", "#3d3d3d"),
  make(4, "プレゼン", "s4_presentation", "スクリーン", "look", "#e8eef5"),
  make(4, "交渉", "s4_negotiation", "握手岩", "touch", "#e6b84c"),
  make(4, "依頼・断り", "s4_request", "立て札", "look", "#7fb069"),
  make(5, "住まい・手続き", "s5_housing", "小さな家", "peek", "#e0a96d"),
  make(5, "銀行・契約", "s5_bank", "金貨とペン", "touch", "#f2c94c"),
  make(5, "生活サービス", "s5_service", "スパナとバケツ", "touch", "#7a8da6"),
  make(5, "トラブル対応", "s5_trouble", "注意標識", "look", "#f2c230"),
  make(5, "プレゼン・面接", "s5_interview", "演台", "hop-on", "#8b6b4a"),
  make(5, "交渉・依頼", "s5_negotiate", "天秤", "touch", "#c9a227"),
  make(5, "会議・報告", "s5_report", "クリップボード", "look", "#6aa0c7"),
  make(5, "電話・メール", "s5_comm", "アンテナ塔", "look", "#7f8c99"),
];

export const DECO_BY_KEY: Record<string, DecoDef> = Object.fromEntries(DECOS.map((d) => [d.key, d]));

export function isDecoKey(key: string): boolean {
  return key in DECO_BY_KEY;
}

// 石・エサ(水槽ごとに決まる標準の飾り)も動かせる。位置は同じテーブルに base:<tankId>:<番号> のキーで保存する。
export const isBaseDecoKey = (key: string): boolean => /^base:[^:]+:[01]$/.test(key);
export const baseDecoKey = (tankId: string, index: number): string => `base:${tankId}:${index}`;
