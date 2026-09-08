// 箱庭マップ上にStage1〜5の建物/ボタンを配置するための座標定義。
// 「手前(Stage1)→奥(Stage5)」の緩やかな奥行き進行は保ちつつ、建物同士がきっちり
// 一直線に並ばないよう位置を軽くジグザグさせている。ボタン(横長ピル)は各Stageの
// 建物の真上ではなく、そばに寄せた位置に配置する（方向はStageごとに変え、
// 隣接する建物・ボタンと重ならないよう手動で調整済み）。
// 詳細な経緯は_reference/speaking-roadmap-design.md参照。
type MapPoint = { top: number; left: number };

export const STAGE_MAP_ANCHORS: Record<
  1 | 2 | 3 | 4 | 5,
  { building: MapPoint; buttonOffset: MapPoint; size: number }
> = {
  1: { building: { top: 82, left: 12 }, buttonOffset: { top: 6, left: 8 }, size: 60 },
  2: { building: { top: 66, left: 30 }, buttonOffset: { top: -15, left: -11 }, size: 54 },
  3: { building: { top: 46, left: 45 }, buttonOffset: { top: 12, left: 13 }, size: 48 },
  4: { building: { top: 34, left: 68 }, buttonOffset: { top: -11, left: -14 }, size: 42 },
  5: { building: { top: 14, left: 88 }, buttonOffset: { top: 10, left: -16 }, size: 36 },
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
