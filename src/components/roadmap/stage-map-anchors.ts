// 箱庭マップ上にStage1〜5の建物/ボタンを配置するための座標定義。
// 「手前(Stage1)→奥(Stage5)」の斜め配置で奥行き感を出す（詳細は_reference/speaking-roadmap-design.md参照）。
// top/leftはマップコンテナ（aspect-[4/3] sm:aspect-[2/1]の外枠）に対する%位置。
// sizeは目印バッジの基準サイズ(px)。手前ほど大きく・奥ほど小さくすることで、
// 実際のイラストがまだ無くても「近い/遠い」の遠近感だけは出す。
export const STAGE_MAP_ANCHORS: Record<1 | 2 | 3 | 4 | 5, { top: number; left: number; size: number }> = {
  1: { top: 78, left: 15, size: 64 },
  2: { top: 62, left: 34, size: 58 },
  3: { top: 46, left: 53, size: 52 },
  4: { top: 30, left: 71, size: 46 },
  5: { top: 16, left: 88, size: 40 },
};

// サイズ(px)からレスポンシブなclamp()の幅/高さ文字列を作る。
// 最小値はサイズの80%を下限にし、一番狭い画面幅（〜360px）でも
// タップ可能なStage1・2のバッジが44px前後を割り込まないようにする
// （Stage3〜5は現状ボタンとして機能しないため、この下限より小さくなっても実害はない）。
export function markerSizeStyle(size: number): string {
  const min = Math.round(size * 0.8);
  const vw = (size / 8).toFixed(1);
  return `clamp(${min}px, ${vw}vw, ${size}px)`;
}
