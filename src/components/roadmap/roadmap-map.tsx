import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Lightbulb, Mic, PenLine, Radio, Coffee, RadioTower, ClipboardList, Sparkles, Flame } from "lucide-react";
import { STAGE_COLORS, withAlpha } from "./stage-colors";
import {
  STAGE_MAP_ANCHORS,
  STAGE0_MAP_ANCHOR,
  BOARD_MAP_ANCHOR,
  TRUNK_ROAD_POINTS,
  LANDMARK_MAP_ANCHORS,
  markerSizeStyle,
} from "./stage-map-anchors";
import { ProSkipButton } from "./pro-skip-button";
import type { Plan } from "@/lib/plan";
import type { StreakStats } from "@/lib/supabase/speaking-roadmap";

// 街の掲示板（タスク#153）専用色。Stage0のバイオレット、本道Stage1〜5の
// グラデーションのどちらとも被らないローズにする。
const BOARD_COLOR = "#e11d48";

type StageNumber = 1 | 2 | 3 | 4 | 5;

// 練習画面(/roadmap/stageN)が実際に存在するStageのみ、地図上でクリック可能にする。
// Stage5は画面自体が未実装のため、進捗上「解放」されていてもリンクは張らない
// （実装が追いついたらここに追加するだけでよい）。
const IMPLEMENTED_STAGES: readonly StageNumber[] = [1, 2, 3, 4];

const STAGE_META: Record<StageNumber, { label: string; caption: string; icon: LucideIcon; href: string }> = {
  1: { label: "Stage1", caption: "音読", icon: Mic, href: "/roadmap/stage1" },
  2: { label: "Stage2", caption: "英作文", icon: PenLine, href: "/roadmap/stage2" },
  3: { label: "Stage3", caption: "言い換え", icon: Radio, href: "/roadmap/stage3" },
  4: { label: "Stage4", caption: "会話", icon: Coffee, href: "/roadmap/stage4" },
  5: { label: "Stage5", caption: "実践", icon: RadioTower, href: "/roadmap/stage5" },
};

const STAGE_NUMBERS: StageNumber[] = [1, 2, 3, 4, 5];

// 区画の形。2026-09-14追加：それまでは建物・空き地を角丸の正方形で表現していたが、
// これだとアイソメ都市の「1区画＝ひし形」という区画感覚が全く伝わらないという指摘を受け、
// 実際のアイソメ投影(2:1)に沿ったひし形／横長六角形に変更した。
// DIAMOND=1区画（1×1）。viewBoxは0 0 100 50で、幅:高さ=2:1のひし形になる。
const DIAMOND_VIEWBOX = "0 0 100 50";
const DIAMOND_POINTS = "50,0 100,25 50,50 0,25";
// WIDE_HEX=横長ランドマーク用の2区画（1×2）。ひし形のS方向（奥行き軸）を伸ばした
// 六角形。viewBoxは0 0 100 100（実質、DIAMONDの奥行きを2倍にした形）。
const WIDE_HEX_VIEWBOX = "0 0 100 100";
const WIDE_HEX_POINTS = "50,0 100,25 100,75 50,100 0,75 0,25";

// 地面の参照グリッド（2026-09-14追加、一時的なデバッグ用）。
// 建物や道を仮配置するときの基準がなく置きづらい、という指摘を受けて追加した。
// 実際のアイソメ地面イラスト（#150）ができたら、この`GROUND_GRID_TILES`関連の
// 定義・描画ブロックごと削除してよい。
//
// 2026-09-14再修正(1)：最初の実装はコンテナ全面を覆うSVG(viewBox 0 0 100 100,
// preserveAspectRatio="none")の中にひし形を描いていたが、コンテナ自体が
// 正方形ではない(4:3や2:1)ため、縦横で別々の倍率で引き伸ばされてひし形の
// 比率が2:1から大きく崩れてしまっていた（他の建物マーカーは個別のSVGを
// width指定・height auto(＝内在的なaspect ratioを保持)で描画しているため
// この問題を起こさない）。同じ「単体SVGをwidth指定・height autoで描く」
// 方式に変更し、常に正確な2:1を保つようにした。
// 2026-09-14再修正(2)：ブロック全体の表示幅を「コンテナ幅の78%」という
// 決め方にしていたところ、逆算すると1区画が約110px相当になり、実際の
// 建物マーカー(36〜62px)の倍近いサイズになっていた。1区画の実寸を
// GROUND_GRID_TILE_TARGET_PXで指定し、そこからブロック全体のpx幅を
// 逆算する方式に変更。あわせて、5×5=25区画だとマップの一部しか埋まらない
// ため、実寸を保ったまま7×7=49区画に増やしてマップ全体に対するカバー率を
// 上げた（区画予算22〜24より多いが、これはあくまで置き場所を試すための
// 参照グリッドなので、実際の区画確定数と一致している必要はない）。
// 2026-09-14再修正(3)：マップを正方形〜縦長に変更し表示枠が広がったのに合わせて、
// 1区画の実寸目標も64→78pxに底上げした（マップ全面化で生まれた余白を活用する）。
const GROUND_GRID_COLS = 7;
const GROUND_GRID_ROWS = 7;
const GROUND_GRID_TILE_TARGET_PX = 78; // 1区画の実寸目標(px)。Stage3マーカー相当（2026-09-14: 全体のサイズ底上げに合わせて48→64→78）
const GROUND_GRID_TILE_HALF_H = 50; // viewBox単位。半幅はこの2倍(=2:1投影を厳密に維持)
const GROUND_GRID_TILE_HALF_W = GROUND_GRID_TILE_HALF_H * 2;
// 7x7グリッド全体の外形も、個々のタイルと同じく必ず2:1になる（アイソメの性質上）。
const GROUND_GRID_VIEWBOX_H = (GROUND_GRID_COLS + GROUND_GRID_ROWS - 2) * GROUND_GRID_TILE_HALF_H;
const GROUND_GRID_VIEWBOX_W = GROUND_GRID_VIEWBOX_H * 2;
const GROUND_GRID_VIEWBOX = `0 0 ${GROUND_GRID_VIEWBOX_W} ${GROUND_GRID_VIEWBOX_H}`;
// 1区画=GROUND_GRID_TILE_TARGET_PXになるよう、ブロック全体のpx幅を逆算する
// （viewBox上で1タイル幅は2:1グリッド全体の幅の (2/(cols+rows-2)) を占める）。
const GROUND_GRID_BLOCK_PX = Math.round(
  (GROUND_GRID_TILE_TARGET_PX * (GROUND_GRID_COLS + GROUND_GRID_ROWS - 2)) / 2
);

function buildGroundGridTiles(): { key: string; points: string }[] {
  const tiles: { key: string; points: string }[] = [];
  const offsetX = (GROUND_GRID_ROWS - 1) * GROUND_GRID_TILE_HALF_W;
  for (let col = 0; col < GROUND_GRID_COLS; col++) {
    for (let row = 0; row < GROUND_GRID_ROWS; row++) {
      const cx = offsetX + (col - row) * GROUND_GRID_TILE_HALF_W;
      const cy = (col + row) * GROUND_GRID_TILE_HALF_H;
      const n = `${cx},${cy - GROUND_GRID_TILE_HALF_H}`;
      const e = `${cx + GROUND_GRID_TILE_HALF_W},${cy}`;
      const s = `${cx},${cy + GROUND_GRID_TILE_HALF_H}`;
      const w = `${cx - GROUND_GRID_TILE_HALF_W},${cy}`;
      tiles.push({ key: `${col}_${row}`, points: `${n} ${e} ${s} ${w}` });
    }
  }
  return tiles;
}

const GROUND_GRID_TILES = buildGroundGridTiles();

type RoadmapMapProps = {
  // Stage1は常に解放。Stage2・3は各Stageの練習ページと同じ基準（アクティブセットが
  // 規定数に届いているか）でその場で動的に判定した値を渡す（2026-09-11
  // 修正：以前はuser_roadmap_state.current_stageという、オンボーディング時に1回だけ
  // 書かれて以後更新されない値で解放判定しており、Stage1を卒業してもStage2が
  // 永久に解放されないバグがあった。詳細は_reference/speaking-roadmap-design.md参照）。
  // Stage4はStage3の卒業実績（何か1つでも習得済みか）で判定する（詳細はspeaking-roadmap.tsの
  // getRoadmapStageReadiness参照）。Stage5は画面自体が未実装のため、この値に関わらず
  // IMPLEMENTED_STAGESで常にロック表示にする。
  // stageReadinessはStageスキップ（#156）が有効な間、対応するStageのReadyがtrueになる
  // （getRoadmapStageReadiness側でOR済み）ため、ここでは追加の分岐は不要。
  stageReadiness: { stage2Ready: boolean; stage3Ready: boolean; stage4Ready: boolean };
  // Stageスキップで選んだ開始Stage。「現在地」ハイライトをここに合わせる（未使用時はnull）。
  proSkipStartStage?: 2 | 3 | 4 | null;
  // 2026-09-14追加：/roadmapページを全面マップ中心のレイアウトに再構築した際、
  // それまでページ側に個別に置いていたStageスキップボタン・統計表示（累計習得
  // フレーズ・連続practice日数）をマップ内のフローティングHUDとして統合した
  // ため、必要な値をそのままpropsで受け取る。「今日の賑わい度」は「街を見れば
  // 賑わいはわかる」という理由で表示自体を廃止した（ユーザー指摘、2026-09-14）。
  plan: Plan;
  proSkipEnabled: boolean;
  totalMasteredCount: number;
  // 2026-09-14修正：それまでは「現在の連続日数」だけを受け取り、streak>0なら
  // 「◯日連続で練習中！」、0なら「今日から練習を始めよう」の二択で表示していたが、
  // 「1年続けても1日休んだだけで新規ユーザーと同じ『今日から始めよう』表示に
  // 戻ってしまうのは違和感がある」というユーザー指摘を受け、現在の連続日数に加えて
  // 累計練習日数・過去最長記録も渡し、積み上げが常に見える表示に変更した
  // （表示ロジックの詳細はこのファイル内のstreakHeadline算出部分を参照）。
  streakStats: StreakStats;
};

// スピーキング・ロードマップのホーム＝「箱庭画面」本体。
// 1枚の画像ビジュアル(アイソメ都市)の上にStage1〜5の建物/ボタンを直接重ねて表示し、
// 下にボタン一覧を並べる構成にはしない。アイソメ都市の実イラストは別タスク（#150）で、
// ここでは「だいたいこの辺りに配置する」という座標・状態設計だけを先に作る。
// 建物同士は手前(Stage1)→奥(Stage5)という大枠の進行方向を保ちつつ、道筋が予測できて
// しまわないよう位置を大きく蛇行させ、各Stageのボタン(横長ピル)は建物の真上ではなく、
// そばに寄せた位置に浮かせて配置する（詳細はstage-map-anchors.ts参照）。
// 2026-09-14修正：未解放のStageは実座標にプレースホルダーを出さず完全に隠すようにした
// （fog of war）。蛇行させても位置が最初から見えていては「次はこの辺に建つ」と分かって
// しまい意味が薄いため。ただし「解放済みだが画面が未実装」なStage（Stage5）は、既に
// 実績として得ているものなので引き続きプレースホルダーで見せる（隠すのは未解放分のみ）。
export function RoadmapMap({
  stageReadiness,
  proSkipStartStage = null,
  plan,
  proSkipEnabled,
  totalMasteredCount,
  streakStats,
}: RoadmapMapProps) {
  // ストリーク表示メッセージの合成。
  // ・累計練習日数が0（＝完全な新規ユーザー）のときだけ「今日から練習を始めよう」。
  // ・現在の連続日数が1以上なら「◯日練習して、△日連続練習中！」（累計＋現在の連続）。
  // ・累計はあるが現在の連続が0（＝ストリークが途切れている）なら、積み上げは
  //   消さずに見せつつ「今日から始めよう」の再スタート感だけを添える。
  // 「連続記録更新中！」は、現在の連続日数が過去最長と並んでいる＝今まさに自己ベストを
  // 更新中のときだけ表示する。ただし初めての連続記録（累計＝現在の連続、比較対象となる
  // 過去の記録がまだ無い）ではただの初回達成であって「更新」ではないため、
  // totalDays > current（＝今回の連続以外にも練習日がある）も条件に加えている。
  const hasAnyRecord = streakStats.totalDays > 0;
  const hasCurrentStreak = streakStats.current > 0;
  const isRecordTying =
    hasCurrentStreak &&
    streakStats.current >= 2 &&
    streakStats.current === streakStats.longest &&
    streakStats.totalDays > streakStats.current;
  const streakHeadline = !hasAnyRecord
    ? "今日から練習を始めよう"
    : hasCurrentStreak
      ? `${streakStats.totalDays}日練習して、${streakStats.current}日連続練習中！`
      : `${streakStats.totalDays}日練習しています、今日から再開しよう！`;

  const UNLOCKED: Record<StageNumber, boolean> = {
    1: true,
    2: stageReadiness.stage2Ready,
    3: stageReadiness.stage3Ready,
    4: stageReadiness.stage4Ready,
    // Stage5は解放条件そのものが未設計（将来タスク）。IMPLEMENTED_STAGESにより
    // どのみち常にロック表示になるため、ここでは暫定でfalse固定にしておく。
    5: false,
  };
  // 「現在地」ハイライト＝実際に解放されている最後（一番奥）のStage。
  // ただしStageスキップ（#156）が有効な間は、選んだ開始Stageを優先して現在地として見せる
  // （進捗の実態ではなく「今どこから始めたか」というユーザーの意思決定を反映するため）。
  const currentStage = proSkipStartStage ?? [...STAGE_NUMBERS].reverse().find((s) => UNLOCKED[s]) ?? 1;
  return (
    // 2026-09-14修正：以前は横長(4:3〜2:1)だったが、全面マップ化に伴い表示枠が
    // 狭く感じるという指摘を受け、正方形〜縦長（モバイルでは縦長寄り、画面が
    // 広がるにつれ正方形に近づく）に変更した。
    <div className="relative aspect-[4/5] w-full sm:aspect-square">
      {/*
        地図の絵柄レイヤー。ここだけoverflow-hiddenで角丸にクリップする。
        2026-09-14追加：フローティングHUD（下のレイヤー）は意図的にこの外側に置く。
        Stageスキップボタンの展開パネルがここでクリップされて見切れるのを防ぐため
        （以前はページ側でマップの外に置くことで同じ問題を回避していたが、
        マップ全面化に伴いHUD自体をマップ内に持ち込む必要が生じたための構成）。
      */}
      <div className="absolute inset-0 overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-b from-sky-50 to-zinc-100">
      {/* 地面のグリッド風の目印。実イラスト実装までの簡易背景。 */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(255,255,255,0.6),transparent_60%)]" />

      {/*
        地面の参照グリッド（一時的なデバッグ用、削除方法は上のGROUND_GRID_TILES
        定義部分のコメント参照）。1区画≈実際の建物マーカーと同じ実寸を
        保ったまま7×7=49区画を敷き、建物・道を仮配置するときの広さの基準にする。
        個別マーカーと同じ「width指定・height auto」方式なので、コンテナの
        縦横比に関わらず常に正確な2:1のひし形になる。
        2026-09-14再修正：マップを正方形〜縦長に変更して表示枠が広がったのに
        合わせ、位置をtop:78%→70%に上げてグリッドの実寸拡大分の余白を確保した。
      */}
      <div
        className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
        style={{ top: "70%", left: "50%", width: markerSizeStyle(GROUND_GRID_BLOCK_PX) }}
        aria-hidden="true"
      >
        <svg viewBox={GROUND_GRID_VIEWBOX} className="block w-full">
          {GROUND_GRID_TILES.map((tile) => (
            <polygon
              key={tile.key}
              points={tile.points}
              fill="rgba(255,255,255,0.2)"
              stroke="#d4d4d8"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </svg>
      </div>

      {/*
        道（本道＋ランドマークへの枝道）。preserveAspectRatio="none"でviewBoxを
        0-100に合わせているので、top/left%の値をそのままSVG座標として使える。
        本道はfog of warの対象＝到達済み(currentStageまで)の区間しか描画しない。
        ランドマークへの枝道は、ランドマーク自体がまだ常設プレースホルダー
        （#150、トリガー未設計）なので常に描画する。
      */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {currentStage > 1 && (
          <polyline
            points={STAGE_NUMBERS.slice(0, currentStage)
              .map((s) => `${TRUNK_ROAD_POINTS[s].left},${TRUNK_ROAD_POINTS[s].top}`)
              .join(" ")}
            fill="none"
            stroke="#a1a1aa"
            strokeWidth="0.6"
            strokeDasharray="2.2 1.4"
            vectorEffect="non-scaling-stroke"
          />
        )}

        {STAGE_NUMBERS.map((stage) => {
          const showStub = UNLOCKED[stage] || !IMPLEMENTED_STAGES.includes(stage);
          if (!showStub) return null;
          const rt = TRUNK_ROAD_POINTS[stage];
          const b = STAGE_MAP_ANCHORS[stage].building;
          return (
            <line
              key={stage}
              x1={rt.left}
              y1={rt.top}
              x2={b.left}
              y2={b.top}
              stroke="#a1a1aa"
              strokeWidth="0.4"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}

        {Object.values(LANDMARK_MAP_ANCHORS).map((lm, i) => (
          <line
            key={i}
            x1={lm.branchFrom.left}
            y1={lm.branchFrom.top}
            x2={lm.building.left}
            y2={lm.building.top}
            stroke="#a1a1aa"
            strokeWidth="0.35"
            strokeDasharray="1.5 1.2"
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>

      {/*
        ランドマーク5区画（#150、アイソメ都市アセット仕様書Partsリスト D）。
        どの達成イベントで解放するかのトリガー設計がまだ無いため、現状はStage5と
        同じ「常に空き地として予約表示するだけ」の状態。区画の広さ(footprint)は
        まだ絵に反映できていない（サイズだけ大きめにして特別感を出している）。
      */}
      {Object.entries(LANDMARK_MAP_ANCHORS).map(([key, lm]) => {
        const markerSize = markerSizeStyle(lm.size);
        const isWide = lm.footprint === "1x2";
        return (
          <div
            key={key}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ top: `${lm.building.top}%`, left: `${lm.building.left}%`, width: markerSize }}
            aria-hidden="true"
          >
            <svg
              viewBox={isWide ? WIDE_HEX_VIEWBOX : DIAMOND_VIEWBOX}
              className="block w-full"
            >
              <polygon
                points={isWide ? WIDE_HEX_POINTS : DIAMOND_POINTS}
                fill="rgba(255,255,255,0.35)"
                stroke="#d4d4d8"
                strokeWidth="3"
                strokeDasharray="6 5"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>
        );
      })}

      {/*
        Stage0（使い分けパーツ）。Stage1〜5の一本道（対角線）とは別の独立エリアのため、
        currentStageによる解放判定はせず常にクリック可能。道から外れた場所に単独で置くことで、
        「一本道の一部ではない」ことを視覚的にも示す。
      */}
      {(() => {
        const anchor = STAGE0_MAP_ANCHOR;
        const markerSize = markerSizeStyle(anchor.size);
        const color = STAGE_COLORS[0];
        const buttonTop = anchor.building.top + anchor.buttonOffset.top;
        const buttonLeft = anchor.building.left + anchor.buttonOffset.left;

        return (
          <div>
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                top: `${anchor.building.top}%`,
                left: `${anchor.building.left}%`,
                width: markerSize,
              }}
              aria-hidden="true"
            >
              <svg viewBox={DIAMOND_VIEWBOX} className="block w-full">
                <polygon
                  points={DIAMOND_POINTS}
                  fill={withAlpha(color, "26")}
                  stroke={color}
                  strokeWidth="3"
                  strokeDasharray="5 4"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <Lightbulb
                className="absolute left-1/2 top-1/2 h-[85%] w-[85%] -translate-x-1/2 -translate-y-1/2"
                style={{ color }}
                strokeWidth={2.25}
              />
            </div>

            <Link
              href="/roadmap/stage0"
              className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/95 px-3 py-1.5 shadow-sm transition-transform hover:shadow-md active:scale-95"
              style={{
                top: `${buttonTop}%`,
                left: `${buttonLeft}%`,
                border: `1.5px solid ${color}`,
              }}
            >
              <Lightbulb className="h-3.5 w-3.5 flex-shrink-0" style={{ color }} strokeWidth={2.25} />
              <span className="text-xs font-semibold" style={{ color }}>
                Stage0
              </span>
              <span className="text-[10px] text-zinc-500">感覚</span>
            </Link>
          </div>
        );
      })()}

      {/*
        街の掲示板（タスク#153）。2026-09-14追加：それまで統計カード下に簡易カード
        リンクとして置いていたものを、Stage0と同じ「一本道とは無関係の独立エリア」
        としてマップ上の建物マーカーに統合した。常にクリック可能。
      */}
      {(() => {
        const anchor = BOARD_MAP_ANCHOR;
        const markerSize = markerSizeStyle(anchor.size);
        const color = BOARD_COLOR;
        const buttonTop = anchor.building.top + anchor.buttonOffset.top;
        const buttonLeft = anchor.building.left + anchor.buttonOffset.left;

        return (
          <div>
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                top: `${anchor.building.top}%`,
                left: `${anchor.building.left}%`,
                width: markerSize,
              }}
              aria-hidden="true"
            >
              <svg viewBox={DIAMOND_VIEWBOX} className="block w-full">
                <polygon
                  points={DIAMOND_POINTS}
                  fill={withAlpha(color, "26")}
                  stroke={color}
                  strokeWidth="3"
                  strokeDasharray="5 4"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <ClipboardList
                className="absolute left-1/2 top-1/2 h-[85%] w-[85%] -translate-x-1/2 -translate-y-1/2"
                style={{ color }}
                strokeWidth={2.25}
              />
            </div>

            <Link
              href="/roadmap/board"
              className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/95 px-3 py-1.5 shadow-sm transition-transform hover:shadow-md active:scale-95"
              style={{
                top: `${buttonTop}%`,
                left: `${buttonLeft}%`,
                border: `1.5px solid ${color}`,
              }}
            >
              <ClipboardList className="h-3.5 w-3.5 flex-shrink-0" style={{ color }} strokeWidth={2.25} />
              <span className="text-xs font-semibold" style={{ color }}>
                掲示板
              </span>
              <span className="text-[10px] text-zinc-500">習得済み一覧</span>
            </Link>
          </div>
        );
      })()}

      {STAGE_NUMBERS.map((stage) => {
        const anchor = STAGE_MAP_ANCHORS[stage];
        const unlocked = UNLOCKED[stage];
        const interactive = unlocked && IMPLEMENTED_STAGES.includes(stage);
        const markerSize = markerSizeStyle(anchor.size);

        if (!unlocked && IMPLEMENTED_STAGES.includes(stage)) {
          // 未解放のStageは完全に非表示（fog of war）。実座標を見せてしまうと
          // 「次はここに建つ」と分かってワクワク感が失われるため、何も描画しない。
          // 2026-09-14修正：以前は`!unlocked`だけで判定しており、Stage5は
          // UNLOCKED[5]が常にfalse固定のためこの分岐に入って完全に消えてしまって
          // いた（本来は下のプレースホルダー表示を維持すべきバグ）。Stage5のように
          // 「まだ画面が無いだけで解放条件自体は未設計」なStageは、IMPLEMENTED_STAGES
          // に含まれないことを見て区別し、こちらの分岐には入らないようにした。
          return null;
        }

        if (!interactive) {
          // ここに来るのは「解放済みだが、まだ練習画面が実装されていない」Stage、
          // または「画面自体が未実装で解放条件も未設計」なStage（現状はどちらも
          // Stage5のみ）。既に得た実績、または将来必ず来るものなので隠さず、
          // 輪郭だけのシルエット/空き地として見せる。「この先まだ何か建つ」という
          // 期待だけ残し、押せるボタンは出さない。
          return (
            <div
              key={stage}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ top: `${anchor.building.top}%`, left: `${anchor.building.left}%`, width: markerSize }}
              aria-hidden="true"
            >
              <svg viewBox={DIAMOND_VIEWBOX} className="block w-full">
                <polygon
                  points={DIAMOND_POINTS}
                  fill="rgba(255,255,255,0.35)"
                  stroke="#d4d4d8"
                  strokeWidth="3"
                  strokeDasharray="6 5"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
            </div>
          );
        }

        const meta = STAGE_META[stage];
        const Icon = meta.icon;
        const color = STAGE_COLORS[stage];
        const isCurrent = stage === currentStage;
        const buttonTop = anchor.building.top + anchor.buttonOffset.top;
        const buttonLeft = anchor.building.left + anchor.buttonOffset.left;

        return (
          <div key={stage}>
            {/* 建物マーカー本体（実イラスト実装までのプレースホルダー）。ボタンとは別要素として、
                建物の位置そのものを表す。1区画＝ひし形（アイソメ2:1投影）で表現する。 */}
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{
                top: `${anchor.building.top}%`,
                left: `${anchor.building.left}%`,
                width: markerSize,
                filter: isCurrent ? `drop-shadow(0 0 5px ${withAlpha(color, "80")})` : undefined,
              }}
              aria-hidden="true"
            >
              <svg viewBox={DIAMOND_VIEWBOX} className="block w-full">
                <polygon
                  points={DIAMOND_POINTS}
                  fill={withAlpha(color, "26")}
                  stroke={color}
                  strokeWidth="3"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <Icon
                className="absolute left-1/2 top-1/2 h-[85%] w-[85%] -translate-x-1/2 -translate-y-1/2"
                style={{ color }}
                strokeWidth={2.25}
              />
            </div>

            {/* Stageの入口ボタン。建物の真上ではなく、そばに寄せた位置に浮かせる横長ピル。 */}
            <Link
              href={meta.href}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/95 px-3 py-1.5 shadow-sm transition-transform hover:shadow-md active:scale-95"
              style={{
                top: `${buttonTop}%`,
                left: `${buttonLeft}%`,
                border: `1.5px solid ${color}`,
              }}
            >
              <Icon className="h-3.5 w-3.5 flex-shrink-0" style={{ color }} strokeWidth={2.25} />
              <span className="text-xs font-semibold" style={{ color }}>
                {meta.label}
              </span>
              <span className="text-[10px] text-zinc-500">{meta.caption}</span>
            </Link>
          </div>
        );
      })}
      </div>

      {/*
        フローティングHUD。2026-09-14追加：/roadmapページの全面マップ化に伴い、
        タイトル・Stageスキップボタン・統計表示（累計習得フレーズ→「習得フレーズ」、
        連続practice日数→合成メッセージに文言変更）をページ本体から撤去し、
        地図の上に浮かせる形に統合した。「今日の賑わい度」は「街を見ればわかる」ため
        廃止。地図の絵柄レイヤー（overflow-hidden）の外に置くことで、Stageスキップの
        展開パネルが見切れないようにしている。
        2026-09-14再修正：HUDの4要素とStage/掲示板の建物入口ボタン（rounded-full・
        枠線・shadow-smのピル）がデザイン的に被っているという指摘を受け、
        「被っていいのは掲示板だけ」という方針のもと、建物ボタンとは明確に違う
        見た目に描き分けた。
        ①タイトル：ピル/枠線を廃し、テキストそのものに縁取り(text-shadow)を
          付けて地図の上でも読める形にした（建物ボタンとは形状が根本的に違う）。
        ②Stageスキップ：rounded-full→rounded-lg・実線枠→破線枠・shadow無し・
          背景を半透明に弱め、「押せるが主役ではない」トーンダウンをした
          （スタイル自体はpro-skip-button.tsx側で変更、詳細はそちらのコメント参照）。
        ③統計表示（習得フレーズ・ストリーク）：枠線・shadowを完全に排し、
          rounded-mdの薄い背景だけにすることで「表示専用でボタンではない」ことを
          一目で区別できるようにした。
      */}
      <div className="pointer-events-none absolute inset-0 z-10">
        <div className="pointer-events-auto absolute left-3 top-3">
          <h1 className="text-sm font-bold tracking-wide text-zinc-700 [text-shadow:0_1px_3px_rgba(255,255,255,0.9),0_0px_1px_rgba(255,255,255,0.9)] sm:text-base">
            英語が話せるようになる街
          </h1>
        </div>

        <div className="pointer-events-auto absolute right-3 top-3">
          <ProSkipButton plan={plan} proSkipEnabled={proSkipEnabled} proSkipStartStage={proSkipStartStage} />
        </div>

        {/*
          2026-09-14再修正：習得フレーズ・ストリークの2つは別々のバッジだと
          Stage/掲示板ボタンの白ピルと紛らわしいという指摘を受け、1つの非白背景
          パネルにまとめた。白背景のボタン群とは色そのものが違うため、
          一目で「表示専用パネル」と区別できる。
          2026-09-14再々修正：灰色が濃すぎるという指摘を受け、不透明度を下げつつ
          backdrop-blurを強め、縁に薄い白いring（ガラスのハイライト）を足して
          グラスモーフィズム寄りの見た目に調整した。
        */}
        <div className="pointer-events-auto absolute bottom-3 left-3 flex flex-col gap-1 rounded-md bg-zinc-900/35 px-2.5 py-1.5 text-white shadow-sm shadow-black/10 ring-1 ring-inset ring-white/25 backdrop-blur-md">
          <div className="flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-amber-300" />
            <span className="text-xs font-semibold">{totalMasteredCount}</span>
            <span className="text-[10px] text-zinc-300">習得フレーズ</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Flame className="h-3.5 w-3.5 text-amber-300" />
            <span className="text-xs font-semibold">{streakHeadline}</span>
          </div>
          {isRecordTying && <span className="text-[10px] font-bold text-amber-300">連続記録更新中！</span>}
        </div>
      </div>
    </div>
  );
}
