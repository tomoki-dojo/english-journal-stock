// Pro機能の訴求文言をまとめた単一のソース。
// ホーム画面・ライブラリの絞り込みパネル・設定画面のプラン比較など、
// 複数箇所に導線を置く際に文言がバラバラにならないようにするための共通定義。

// 一覧・バナーなど短いスペースで使う簡潔な箇条書き
export const PRO_FEATURE_HIGHLIGHTS = [
  "シーン×機能タグの掛け合わせ絞り込み",
  "マイリスト保存 無制限",
  "例文の音声再生",
  "広告非表示",
] as const;

export type PlanComparisonRow = {
  label: string;
  free: string;
  pro: string;
};

// 設定画面のFree/Pro比較表で使う行データ
export const PLAN_COMPARISON_ROWS: PlanComparisonRow[] = [
  { label: "表現の閲覧", free: "全表現OK", pro: "全表現OK" },
  { label: "シーン×機能タグの絞り込み", free: "一部ロック", pro: "自由に組み合わせ" },
  { label: "マイリスト保存", free: "15件まで", pro: "無制限" },
  { label: "例文の音声再生", free: "不可", pro: "可能" },
  { label: "広告", free: "表示あり", pro: "非表示" },
];
