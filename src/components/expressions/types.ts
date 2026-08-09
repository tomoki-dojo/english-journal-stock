// _reference/expressions_schema.sql のCHECK制約に対応する値の定義。
// スキーマ側の値を変更したら、ここも合わせて更新すること。

export const SceneTagValues = [
  "会議",
  "雑談",
  "メール",
  "電話",
  "プレゼン",
  "依頼・断り",
  "交渉",
] as const;
export type SceneTag = (typeof SceneTagValues)[number];

export const FormalityValues = ["カジュアル", "ミドル", "フォーマル"] as const;
export type Formality = (typeof FormalityValues)[number];

export const LevelValues = ["初級", "中級", "上級"] as const;
export type Level = (typeof LevelValues)[number];

export const VerificationStatusValues = [
  "AI生成のみ",
  "クロスチェック済み",
  "ネイティブ確認済み",
] as const;
export type VerificationStatus = (typeof VerificationStatusValues)[number];

// 機能・意図タグ。フレーズが「何をするための表現か」を表す軸で、シーンとは独立。
// 全表現に必ず付くわけではない（該当なしはundefined/null）。
// Pro限定の「シーン×機能」絞り込みに使う。
export const IntentTagValues = [
  "依頼",
  "断り・保留",
  "提案",
  "同意・肯定",
  "反論・懸念",
  "謝罪",
  "確認",
  "相槌・共感",
] as const;
export type IntentTag = (typeof IntentTagValues)[number];

export type SceneTagFilter = SceneTag | "すべて";
export type FormalityFilter = Formality | "すべて";
export type LevelFilter = Level | "すべて";
export type IntentTagFilter = IntentTag | "すべて";

export type Expression = {
  id: string;
  code: string;
  category: string;
  sceneTags: SceneTag[];
  formality: Formality[];
  level: Level;
  intentTags?: IntentTag[];
  expressionEn: string;
  // DB上の生の値。現在はUIでの意味・例文マスクには使っていない（未使用）。
  isPremium: boolean;
  // 旧・内容マスク機構の名残。Pro限定は機能面のみになったため常にfalse。
  locked: boolean;
  meaningJa?: string;
  example1En?: string;
  example1Ja?: string;
  example2En?: string;
  example2Ja?: string;
  similarExpressions?: string[];
  usageNotes?: string;
  verificationStatus: VerificationStatus;
  audioMemo?: string;
  publishStatus: string;
  createdAt: string;
  // 例文音声（Pro/Premium限定）。生のStorageパスはクライアントに渡さず、
  // 「音声が存在するか」だけをbooleanで持つ。再生時はAPI経由で都度signed URLを取る。
  hasAudioExpression: boolean;
  hasAudioExample1: boolean;
  hasAudioExample2: boolean;
};

export type AudioField = "expression" | "example1" | "example2";
