// 箱庭マップ上にStage1〜5の建物/ボタンを配置するための座標定義。
// 2026-09-14修正：以前は「手前(Stage1)→奥(Stage5)」に沿った緩い対角線配置だったが、
// これだと道筋が一目で読めてしまい「次はだいたいこの辺に建つだろう」と予測できてしまう
// ため、左右に大きく蛇行する順路に変更した（1→2で右へ、2→3で左に戻り、3→4で再び右へ、
// 4→5で左へ…というジグザグ）。奥行き（サイズが徐々に小さくなる・全体としては下から上へ
// 進む）という大枠の方向感は保ちつつ、隣のStageがどちら側に建つかを規則的に予測しにくく
// している。合わせてroadmap-map.tsx側で「未解放のStageは実座標にプレースホルダーを出さず
// 完全に隠す」よう変更済み（配置が分かっても、未解放の間は見えなければ意味がないため）。
// ボタン(横長ピル)は各Stageの建物の真上ではなく、そばに寄せた位置に配置する（方向は
// Stageごとに変え、隣接する建物・ボタンと重ならないよう手動で調整済み。ただし蛇行後の
// 配置は暫定値のため、実機・実コンテナ幅での見た目確認と微調整が今後必要）。
// 詳細な経緯は_reference/speaking-roadmap-design.md参照。
type MapPoint = { top: number; left: number };

export const STAGE_MAP_ANCHORS: Record<
  1 | 2 | 3 | 4 | 5,
  { building: MapPoint; buttonOffset: MapPoint; size: number }
> = {
  1: { building: { top: 88, left: 14 }, buttonOffset: { top: 8, left: 10 }, size: 60 },
  2: { building: { top: 60, left: 58 }, buttonOffset: { top: -14, left: -12 }, size: 54 },
  3: { building: { top: 74, left: 34 }, buttonOffset: { top: 12, left: 13 }, size: 48 },
  4: { building: { top: 36, left: 64 }, buttonOffset: { top: -12, left: -13 }, size: 42 },
  5: { building: { top: 12, left: 38 }, buttonOffset: { top: 11, left: -14 }, size: 36 },
};

// Stage0（使い分けパーツ）専用の配置。Stage1〜5は手前→奥の一本道（対角線上）に並ぶが、
// Stage0はその道のどこにも属さない独立エリアという扱いのため、あえて道から外れた
// 右下の余白に単独で置く（「資料館」のような、いつでも寄れるランドマーク）。
export const STAGE0_MAP_ANCHOR: { building: MapPoint; buttonOffset: MapPoint; size: number } = {
  building: { top: 88, left: 80 },
  buttonOffset: { top: 9, left: 4 },
  size: 46,
};

// サイズ(px)からレスポンシブなclamp()の幅/高さ文字列を作る（建物マーカー用）。
// 最小値はサイズの80%を下限にし、一番狭い画面幅（〜360px）でも
// タップ可能なStage1・2の建物マーカーが潰れすぎないようにする
// （Stage3〜5は現状ボタンとして機能しないため、この下限より小さくなっても実害はない）。
export function markerSizeStyle(size: number): string {
  const min = Math.round(size * 0.8);
  const vw = (size / 8).toFixed(1);
  return `clamp(${min}px, ${vw}vw, ${size}px)`;
}
