// 箱庭マップ上にStage1〜5の建物/ボタンを配置するための座標定義。
// 2026-09-14修正：以前は「手前(Stage1)→奥(Stage5)」に沿った緩い対角線配置だったが、
// これだと道筋が一目で読めてしまい「次はだいたいこの辺に建つだろう」と予測できてしまう
// ため、左右に大きく蛇行する順路に変更した。さらに、建物を道の頂点そのものに置くのを
// やめ、TRUNK_ROAD_POINTS（本道の通過点）から少し外れた位置に建てる形に変更した
// （「道は分かれるもの」という方針のもと、建物は道沿いに立つが道そのものではない）。
// 合わせてroadmap-map.tsx側で「未解放のStageは実座標にプレースホルダーを出さず
// 完全に隠す」（fog of war）よう変更済み。
// ボタン(横長ピル)は各Stageの建物の真上ではなく、そばに寄せた位置に配置する（方向は
// Stageごとに変え、隣接する建物・ボタンと重ならないよう手動で調整済み。ただし現在の
// 配置は暫定値のため、実機・実コンテナ幅での見た目確認と微調整が今後必要）。
// 詳細な経緯は_reference/speaking-roadmap-design.md参照。
type MapPoint = { top: number; left: number };

// 2026-09-14再修正：36〜60pxは画面実機で見ると小さすぎるという指摘を受け、
// 全体を約1.3倍に引き上げた（Stage1: 60→80pxなど）。サイズが大きくなった分、
// 詰まっていた箇所（特にランドマークとの間）は座標も外側にずらして重なりを
// 回避している。ズーム・スクロールを導入せず全区画を一画面に収める方針は維持。
export const STAGE_MAP_ANCHORS: Record<
  1 | 2 | 3 | 4 | 5,
  { building: MapPoint; buttonOffset: MapPoint; size: number }
> = {
  1: { building: { top: 90, left: 8 }, buttonOffset: { top: 8, left: 10 }, size: 80 },
  2: { building: { top: 50, left: 68 }, buttonOffset: { top: -14, left: -12 }, size: 72 },
  3: { building: { top: 80, left: 30 }, buttonOffset: { top: 12, left: 13 }, size: 64 },
  4: { building: { top: 24, left: 74 }, buttonOffset: { top: -12, left: -13 }, size: 56 },
  5: { building: { top: 10, left: 36 }, buttonOffset: { top: 11, left: -14 }, size: 48 },
};

// 本道（Stage1→5の進行順そのものを表す蛇行ライン）の通過点。上のSTAGE_MAP_ANCHORSの
// building位置とは別物で、建物はここから少し外れた場所に立つ（roadmap-map.tsxが
// この2つを結ぶ短い線＝「スタブ」を描く）。道自体はfog of warの対象で、
// 実際に解放済み(＝到達済み)の区間までしか描画しない。
export const TRUNK_ROAD_POINTS: Record<1 | 2 | 3 | 4 | 5, MapPoint> = {
  1: { top: 94, left: 16 },
  2: { top: 58, left: 60 },
  3: { top: 74, left: 40 },
  4: { top: 32, left: 64 },
  5: { top: 10, left: 44 },
};

// ランドマーク（アイソメ都市アセット仕様書 Partsリスト D、#150）の5区画。本道上の
// 交差点(branchFrom)から分かれる枝道の先に立つ、という位置づけ。区画サイズは
// footprint:'1x2'＝横長の2区画、'tower'＝footprintは1区画のまま階数で魅せる高層棟
// （検討の詳細は_reference/speaking-roadmap-design.md参照）。
// どの達成イベントで解放するかというトリガー設計はまだ行っていないため、現状は
// Stage5と同じ「常に空き地として予約表示するだけ」の状態（roadmap-map.tsx参照）。
export const LANDMARK_MAP_ANCHORS: Record<
  "warehouse" | "broadcast" | "cafe" | "tower" | "skyscraper",
  { building: MapPoint; branchFrom: MapPoint; size: number; footprint: "1x2" | "tower" }
> = {
  warehouse: {
    building: { top: 70, left: 54 },
    branchFrom: { top: 76, left: 38 },
    size: 74,
    footprint: "1x2",
  },
  broadcast: {
    building: { top: 36, left: 8 },
    branchFrom: { top: 74, left: 40 },
    size: 74,
    footprint: "1x2",
  },
  cafe: {
    building: { top: 64, left: 90 },
    branchFrom: { top: 58, left: 60 },
    size: 74,
    footprint: "1x2",
  },
  tower: {
    building: { top: 4, left: 76 },
    branchFrom: { top: 10, left: 44 },
    size: 60,
    footprint: "tower",
  },
  skyscraper: {
    building: { top: 44, left: 32 },
    branchFrom: { top: 53, left: 52 },
    size: 82,
    footprint: "tower",
  },
};

// Stage0（使い分けパーツ）専用の配置。Stage1〜5は手前→奥の一本道（対角線上）に並ぶが、
// Stage0はその道のどこにも属さない独立エリアという扱いのため、あえて道から外れた
// 右下の余白に単独で置く（「資料館」のような、いつでも寄れるランドマーク）。
export const STAGE0_MAP_ANCHOR: { building: MapPoint; buttonOffset: MapPoint; size: number } = {
  building: { top: 90, left: 84 },
  buttonOffset: { top: 9, left: 4 },
  size: 62,
};

// 街の掲示板（タスク#153）専用の配置。2026-09-14変更：/roadmapページ全体を
// 全面マップ中心のレイアウトに再構築した際、それまで統計カード下に簡易カード
// リンクとして置いていた掲示板を、Stage0と同じ「一本道とは無関係の独立エリア」
// としてマップ上の建物マーカーに統合した。
export const BOARD_MAP_ANCHOR: { building: MapPoint; buttonOffset: MapPoint; size: number } = {
  building: { top: 62, left: 14 },
  buttonOffset: { top: -13, left: 12 },
  size: 64,
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
