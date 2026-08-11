// Pro機能の訴求文言をまとめた単一のソース。
// ホーム画面・ライブラリの絞り込みパネル・設定画面のプラン比較など、
// 複数箇所に導線を置く際に文言がバラバラにならないようにするための共通定義。

export type ProFeatureHighlight = {
  label: string;
  // labelの中で太字にする部分文字列（省略時は太字なし）
  emphasis?: string;
};

// 一覧・バナーなど短いスペースで使う簡潔な箇条書き
export const PRO_FEATURE_HIGHLIGHTS: ProFeatureHighlight[] = [
  {
    label: "シーン×機能タグの掛け合わせ絞り込み",
    emphasis: "シーン×機能タグの掛け合わせ絞り込み",
  },
  { label: "マイリスト保存 無制限", emphasis: "無制限" },
  { label: "例文の音声再生", emphasis: "音声再生" },
  { label: "単語を効率よく復習（今日の復習）", emphasis: "効率よく復習" },
  { label: "広告非表示" },
];

// PRO_FEATURE_HIGHLIGHTSのemphasis指定に従って、該当部分だけ太字にして表示する。
export function ProFeatureLabelText({ highlight }: { highlight: ProFeatureHighlight }) {
  if (!highlight.emphasis) return <>{highlight.label}</>;

  const index = highlight.label.indexOf(highlight.emphasis);
  if (index === -1) return <>{highlight.label}</>;

  const before = highlight.label.slice(0, index);
  const after = highlight.label.slice(index + highlight.emphasis.length);

  return (
    <>
      {before}
      <strong className="font-semibold text-zinc-900">{highlight.emphasis}</strong>
      {after}
    </>
  );
}

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
  { label: "単語の閲覧・検索・保存", free: "全単語OK", pro: "全単語OK" },
  { label: "ランダム学習（単語の練習）", free: "可能", pro: "可能・苦手優先" },
  { label: "今日の復習（効率よく復習）", free: "不可", pro: "可能" },
  { label: "広告", free: "表示あり", pro: "非表示" },
];
