// Stage1〜5のテーマカラー。
// ブランドの2色（オレンジ #f59e0b・ティールブルー #0269a1）を起点・終点にした
// 「日の出→海に還る」5段階のグラデーション。中間3色は色相を暖色から寒色へ
// 自然に回り込ませる形で選んでいる（直線的なRGB補間だと彩度が落ちて濁るため）。
// 詳細な経緯は _reference/speaking-roadmap-design.md 参照。
export const STAGE_COLORS: Record<1 | 2 | 3 | 4 | 5, string> = {
  1: "#f59e0b", // アンバー（ブランドオレンジそのもの）
  2: "#84cc16", // ライム
  3: "#10b981", // エメラルド
  4: "#0891b2", // シアン
  5: "#0269a1", // ブランドティールブルーそのもの（本体のaccentと同じ）
};

// #rrggbb + 2桁のアルファ値（00〜ff）を連結して、8桁hexの半透明色を作る簡易ヘルパー。
// Tailwindの動的クラス名はJITで拾えないため、Stageカラーはinline styleで扱う。
export function withAlpha(hex: string, alphaHex: string): string {
  return `${hex}${alphaHex}`;
}
