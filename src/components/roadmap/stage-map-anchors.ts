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
// 2026-09-14再修正：/roadmapを正方形〜縦長レイアウトに変更した際、下部HUD
// （習得フレーズ・ストリークをまとめた非白背景パネル、bottom-3 left-3）と
// Stage1・Stage0のボタンが画面最下部で重なってしまっていたため、両者を
// 上にずらして衝突を避けた（Stage1: building top 90→84・buttonOffset top 8→5、
// Stage0: building top 90→82・buttonOffset top 9→5、それぞれ下記STAGE0_MAP_ANCHOR参照）。
// 2026-09-17修正：#150向けに実際の建物画像（テストコンクリ打ちっぱなし）をStage1マーカーに
// 差し替えたのを機に、Stage1〜5すべての建物位置を「地面の参照グリッド」(roadmap-map.tsxの
// GROUND_GRID_TILES、7×7のひし形タイル)の実際のマス目に乗るよう設計し直した。
// 以前は「見た目の雰囲気だけ合わせた自由配置」だったため、実際の建物イラストを置くと
// マス目からズレて浮いて見えるリスクがあった。
//
// 設計の考え方：グリッドは(col,row)∈[0,6]の格子で、cx=600+(col-row)*100,
// cy=(col+row)*50（roadmap-map.tsxのbuildGroundGridTiles参照）というアイソメ座標を持つ。
// これをコンテナに対する%に変換する式は
//   left% = 50 + (col-row) * 6.5
//   top%  = 50.5 + (col+row) * 3.25
// （グリッド全体の表示幅をコンテナ幅の約78%と仮定して逆算した近似値。コンテナの実寸は
// 画面サイズで変わるため、この換算係数はあくまで目安。実機で見て建物がタイルからズレて
// いたら係数側を調整すること）。
//
// 配置した(col,row)は、Stage1を手前（sum=col+row が最大）に置き、Stageが進むごとに
// sumを2ずつ減らして奥（グリッド北側）へ向かわせつつ、diff=col-rowの符号を
// -2→+2→-2→+2→0と交互にして道を蛇行させた：
//   Stage1 (col=4,row=6) sum=10 diff=-2
//   Stage2 (col=5,row=3) sum=8  diff=+2
//   Stage3 (col=2,row=4) sum=6  diff=-2
//   Stage4 (col=3,row=1) sum=4  diff=+2
//   Stage5 (col=1,row=1) sum=2  diff=0（最奥・中央寄りで着地）
// 建物サイズは以前「奥に行くほど小さくなる遠近感」を出すため80→48pxと段階的に縮小していたが、
// 2026-09-17の建物幅調整で撤去した（下のSTAGE_MAP_ANCHORS参照）。アイソメ投影は元々
// 遠近法を使わない（奥でも同じ縮尺で描くのが決まりごと）ため、擬似遠近法による縮小は
// タイル幅とのズレを生むだけで、アイソメの流儀としても不要と判断した。
// 2026-09-17追加：building位置を「地面の参照グリッド」の実際のマス目に厳密に一致させる
// ため導入。roadmap-map.tsx側でこの(col,row)を、グリッド本体(GROUND_GRID_TILES)と全く
// 同じ計算式・同じ描画ボックスを使って%に変換するので、コンテナの実寸によらず必ずマス目に
// ぴったり乗る（下のSTAGE_MAP_ANCHORS.buildingは、ボタン位置の基準としてのみ引き続き
// 使う近似値。実際の建物画像の位置はこちらのSTAGE_GRID_CELLSが正）。
export const STAGE_GRID_CELLS: Record<1 | 2 | 3 | 4 | 5, { col: number; row: number }> = {
  1: { col: 4, row: 6 },
  2: { col: 5, row: 3 },
  3: { col: 2, row: 4 },
  4: { col: 3, row: 1 },
  5: { col: 1, row: 1 },
};

export const STAGE_MAP_ANCHORS: Record<
  1 | 2 | 3 | 4 | 5,
  { building: MapPoint; buttonOffset: MapPoint; size: number }
> = {
  1: { building: { top: 83, left: 37 }, buttonOffset: { top: 6, left: -11 }, size: 92 },
  2: { building: { top: 77, left: 63 }, buttonOffset: { top: -4, left: 12 }, size: 92 },
  3: { building: { top: 70, left: 37 }, buttonOffset: { top: 9, left: -12 }, size: 92 },
  4: { building: { top: 64, left: 63 }, buttonOffset: { top: -10, left: 11 }, size: 92 },
  5: { building: { top: 57, left: 50 }, buttonOffset: { top: -11, left: 0 }, size: 92 },
};

// 本道（Stage1→5の進行順そのものを表す蛇行ライン）の通過点。上のSTAGE_MAP_ANCHORSの
// building位置とは別物で、建物はここから少し外れた場所に立つ（roadmap-map.tsxが
// この2つを結ぶ短い線＝「スタブ」を描く）。道自体はfog of warの対象で、
// 実際に解放済み(＝到達済み)の区間までしか描画しない。
// 2026-09-17修正：上のSTAGE_MAP_ANCHORS刷新に合わせ、各建物のすぐそばを通るよう再調整。
export const TRUNK_ROAD_POINTS: Record<1 | 2 | 3 | 4 | 5, MapPoint> = {
  1: { top: 87, left: 41 },
  2: { top: 73, left: 59 },
  3: { top: 66, left: 41 },
  4: { top: 60, left: 57 },
  5: { top: 52, left: 50 },
};

// ランドマーク（アイソメ都市アセット仕様書 Partsリスト D、#150）の5区画。本道上の
// 交差点(branchFrom)から分かれる枝道の先に立つ、という位置づけ。区画サイズは
// footprint:'1x2'＝横長の2区画、'tower'＝footprintは1区画のまま階数で魅せる高層棟
// （検討の詳細は_reference/speaking-roadmap-design.md参照）。
// どの達成イベントで解放するかというトリガー設計はまだ行っていないため、現状は
// Stage5と同じ「常に空き地として予約表示するだけ」の状態（roadmap-map.tsx参照）。
// 2026-09-17修正：上のTRUNK_ROAD_POINTS刷新に合わせ、branchFromを新しい本道の
// 通過点（またはその中間点）に追従させた。建物位置(building)自体は未調整のため、
// 枝道の長さ・向きが変わっている可能性がある（実機で見て要調整）。
export const LANDMARK_MAP_ANCHORS: Record<
  "warehouse" | "broadcast" | "cafe" | "tower" | "skyscraper",
  { building: MapPoint; branchFrom: MapPoint; size: number; footprint: "1x2" | "tower" }
> = {
  warehouse: {
    building: { top: 70, left: 54 },
    branchFrom: { top: 66, left: 41 }, // 新TRUNK3
    size: 74,
    footprint: "1x2",
  },
  broadcast: {
    building: { top: 36, left: 8 },
    branchFrom: { top: 66, left: 41 }, // 新TRUNK3
    size: 74,
    footprint: "1x2",
  },
  cafe: {
    building: { top: 64, left: 90 },
    branchFrom: { top: 73, left: 59 }, // 新TRUNK2
    size: 74,
    footprint: "1x2",
  },
  tower: {
    building: { top: 4, left: 76 },
    branchFrom: { top: 52, left: 50 }, // 新TRUNK5
    size: 60,
    footprint: "tower",
  },
  skyscraper: {
    building: { top: 44, left: 32 },
    branchFrom: { top: 63, left: 49 }, // 新TRUNK3・TRUNK4の中間点
    size: 82,
    footprint: "tower",
  },
};

// Stage0（使い分けパーツ）専用の配置。Stage1〜5は手前→奥の一本道（対角線上）に並ぶが、
// Stage0はその道のどこにも属さない独立エリアという扱いのため、あえて道から外れた
// 右下の余白に単独で置く（「資料館」のような、いつでも寄れるランドマーク）。
export const STAGE0_MAP_ANCHOR: { building: MapPoint; buttonOffset: MapPoint; size: number } = {
  building: { top: 82, left: 84 },
  buttonOffset: { top: 5, left: 4 },
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
