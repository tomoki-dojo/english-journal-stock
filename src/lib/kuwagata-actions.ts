// 水槽の中で個体がときどき見せる、共通アクションと特別アクションの定義。
// 絵は足さず、体全体を動かすCSSのアニメーションだけで表す（keyframesは globals.css の kw-act-*）。
//
// - 共通アクション（12種）: 色の実で色づけした個体が、その色のシーンに割り当てられたアクションを覚える。
// - 特別アクション（5種）: 節目の達成で解放される。全個体が使うものと、金・銀の縁の個体だけが使うものがある。

export type ActionId =
  | "hop" | "chew" | "sway" | "roll" | "stretch" | "chatter"
  | "nod" | "float" | "spin" | "puff" | "lunge" | "bow"
  | "beam" | "stomp" | "radio"
  | "sp-daily" | "sp-business" | "sp-limited" | "sp-silver" | "sp-gold";

export type ActionDef = {
  id: ActionId;
  label: string;
  // 動かす時間（ms）。globals.css の kw-act-* のアニメーション時間と合わせる。
  durationMs: number;
  // 動かしたあとに足す飾り（光の輪など）。無しなら動きだけ。
  effect?: "glow-pink" | "glow-blue" | "rainbow" | "silver" | "gold";
};

export const ACTIONS: Record<ActionId, ActionDef> = {
  hop: { id: "hop", label: "ぴょんぴょん", durationMs: 1400 },
  chew: { id: "chew", label: "もぐもぐ", durationMs: 1500 },
  sway: { id: "sway", label: "ルンルン", durationMs: 1800 },
  roll: { id: "roll", label: "ころころ", durationMs: 1600 },
  stretch: { id: "stretch", label: "のび", durationMs: 1700 },
  chatter: { id: "chatter", label: "ぺちゃくちゃ", durationMs: 1500 },
  nod: { id: "nod", label: "うんうん", durationMs: 1500 },
  float: { id: "float", label: "ふわふわ", durationMs: 2200 },
  spin: { id: "spin", label: "くるくる", durationMs: 1300 },
  puff: { id: "puff", label: "ドヤッ", durationMs: 1700 },
  lunge: { id: "lunge", label: "ぐいっ", durationMs: 1200 },
  bow: { id: "bow", label: "ぺこり", durationMs: 1500 },
  radio: { id: "radio", label: "でんぱ", durationMs: 2200 },
  stomp: { id: "stomp", label: "ドシンドシン", durationMs: 2000 },
  beam: { id: "beam", label: "ビーム", durationMs: 2000 },
  "sp-daily": { id: "sp-daily", label: "ほっこり", durationMs: 3600, effect: "glow-pink" },
  "sp-business": { id: "sp-business", label: "キリッ", durationMs: 2200, effect: "glow-blue" },
  "sp-limited": { id: "sp-limited", label: "きらきらダンス", durationMs: 2800, effect: "rainbow" },
  "sp-silver": { id: "sp-silver", label: "ぎんぎら", durationMs: 2600, effect: "silver" },
  "sp-gold": { id: "sp-gold", label: "こがねの舞", durationMs: 2800, effect: "gold" },
};

// 色の実のシーン → 共通アクション。Stage4（12シーン）は1つずつ、Stage5（8シーン）は近い動きを割り当てる。
export const COMMON_ACTION_BY_SCENE: Record<string, ActionId> = {
  // Stage4
  旅行: "hop",
  外食: "chew",
  買い物: "sway",
  友人: "roll",
  体調: "stretch",
  雑談: "chatter",
  会議: "nod",
  メール: "float",
  電話: "spin",
  プレゼン: "puff",
  交渉: "lunge",
  "依頼・断り": "bow",
  // Stage5
  "住まい・手続き": "stretch",
  "銀行・契約": "nod",
  生活サービス: "chew",
  トラブル対応: "bow",
  "プレゼン・面接": "puff",
  "交渉・依頼": "lunge",
  "会議・報告": "chatter",
  "電話・メール": "spin",
};

// 種ごとの専用アクション（その種の成虫は、色づけや節目に関係なく見せる）。
// stomp: ネゴクワたん(KW-0064)が、たまにドシンドシンと3回地面を踏みしめて、地鳴りの輪を広げる。
// radio: テレクワたん(KW-0066)が、たまに体の上へ電波の弧を3本広げる。
// beam: プレクワたん(KW-0063)の額の緑のマルから、ビームを出す（。
export const SPECIES_ACTIONS: Record<string, ActionId[]> = {
  "KW-0063": ["beam"],
  "KW-0064": ["stomp"],
  "KW-0066": ["radio"],
};

// 節目の達成による解放状況。サーバーで数えて、棚に渡す。
//  daily / business: 0=未達成, 1=Stage4の全シーンを習得, 2=Stage5の全シーンを習得（強化版）
export type ActionFlags = {
  daily: 0 | 1 | 2;
  business: 0 | 1 | 2;
  limitedComplete: boolean;
};

export const NO_ACTION_FLAGS: ActionFlags = { daily: 0, business: 0, limitedComplete: false };

// この個体が見せられるアクションの一覧。
export function availableActions(
  tintKey: string | null,
  rimKey: "silver" | "gold" | null,
  flags: ActionFlags,
  speciesCode?: string
): ActionId[] {
  const list: ActionId[] = [];
  if (speciesCode && SPECIES_ACTIONS[speciesCode]) list.push(...SPECIES_ACTIONS[speciesCode]);
  const common = tintKey ? COMMON_ACTION_BY_SCENE[tintKey] : undefined;
  if (common) list.push(common);
  if (flags.daily > 0) list.push("sp-daily");
  if (flags.business > 0) list.push("sp-business");
  if (flags.limitedComplete) list.push("sp-limited");
  if (rimKey === "silver" || rimKey === "gold") list.push("sp-silver");
  if (rimKey === "gold") list.push("sp-gold");
  return list;
}
