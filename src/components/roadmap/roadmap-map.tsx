import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Lightbulb, Mic, PenLine, Radio, Coffee, RadioTower } from "lucide-react";
import { STAGE_COLORS, withAlpha } from "./stage-colors";
import { STAGE_MAP_ANCHORS, STAGE0_MAP_ANCHOR, markerSizeStyle } from "./stage-map-anchors";

type StageNumber = 1 | 2 | 3 | 4 | 5;

// 練習画面(/roadmap/stageN)が実際に存在するStageのみ、地図上でクリック可能にする。
// Stage4〜5は画面自体が未実装のため、進捗上「解放」されていてもリンクは張らない
// （実装が追いついたらここに追加するだけでよい）。
const IMPLEMENTED_STAGES: readonly StageNumber[] = [1, 2, 3];

const STAGE_META: Record<StageNumber, { label: string; caption: string; icon: LucideIcon; href: string }> = {
  1: { label: "Stage1", caption: "音読", icon: Mic, href: "/roadmap/stage1" },
  2: { label: "Stage2", caption: "英作文", icon: PenLine, href: "/roadmap/stage2" },
  3: { label: "Stage3", caption: "言い換え", icon: Radio, href: "/roadmap/stage3" },
  4: { label: "Stage4", caption: "会話", icon: Coffee, href: "/roadmap/stage4" },
  5: { label: "Stage5", caption: "実践", icon: RadioTower, href: "/roadmap/stage5" },
};

const STAGE_NUMBERS: StageNumber[] = [1, 2, 3, 4, 5];

type RoadmapMapProps = {
  // Stage1は常に解放。Stage2・3は各Stageの練習ページと同じ基準（アクティブセットが
  // 規定数に届いているか）でその場で動的に判定した値を渡す（2026-09-11
  // 修正：以前はuser_roadmap_state.current_stageという、オンボーディング時に1回だけ
  // 書かれて以後更新されない値で解放判定しており、Stage1を卒業してもStage2が
  // 永久に解放されないバグがあった。詳細は_reference/speaking-roadmap-design.md参照）。
  // Stage4・5は画面自体が未実装のため、この値に関わらずIMPLEMENTED_STAGESで常にロック表示にする。
  stageReadiness: { stage2Ready: boolean; stage3Ready: boolean };
};

// スピーキング・ロードマップのホーム＝「箱庭画面」本体。
// 1枚の画像ビジュアル(アイソメ都市)の上にStage1〜5の建物/ボタンを直接重ねて表示し、
// 下にボタン一覧を並べる構成にはしない。アイソメ都市の実イラストは別タスク（#150）で、
// ここでは「だいたいこの辺りに配置する」という座標・状態設計だけを先に作る。
// 建物同士は手前(Stage1)→奥(Stage5)の緩い奥行き進行を保ちつつ位置を軽くジグザグさせ、
// 各Stageのボタン(横長ピル)は建物の真上ではなく、そばに寄せた位置に浮かせて配置する。
export function RoadmapMap({ stageReadiness }: RoadmapMapProps) {
  const UNLOCKED: Record<StageNumber, boolean> = {
    1: true,
    2: stageReadiness.stage2Ready,
    3: stageReadiness.stage3Ready,
    // Stage4・5は解放条件そのものが未設計（Stage4以降は将来タスク）。IMPLEMENTED_STAGESにより
    // どのみち常にロック表示になるため、ここでは暫定でfalse固定にしておく。
    4: false,
    5: false,
  };
  // 「現在地」ハイライト＝実際に解放されている最後（一番奥）のStage。
  const currentStage = [...STAGE_NUMBERS].reverse().find((s) => UNLOCKED[s]) ?? 1;
  return (
    <div className="relative mb-6 aspect-[4/3] w-full overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-b from-sky-50 to-zinc-100 sm:aspect-[2/1]">
      {/* 地面のグリッド風の目印。実イラスト実装までの簡易背景。 */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(255,255,255,0.6),transparent_60%)]" />

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
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-2xl"
              style={{
                top: `${anchor.building.top}%`,
                left: `${anchor.building.left}%`,
                width: markerSize,
                height: markerSize,
                backgroundColor: withAlpha(color, "26"),
                border: `2px dashed ${color}`,
              }}
              aria-hidden="true"
            >
              <Lightbulb
                className="absolute left-1/2 top-1/2 h-[45%] w-[45%] -translate-x-1/2 -translate-y-1/2"
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

      {STAGE_NUMBERS.map((stage) => {
        const anchor = STAGE_MAP_ANCHORS[stage];
        const unlocked = UNLOCKED[stage];
        const interactive = unlocked && IMPLEMENTED_STAGES.includes(stage);
        const markerSize = markerSizeStyle(anchor.size);

        if (!interactive) {
          // 未解放（またはまだ画面が無いStage）は、輪郭だけのシルエット/空き地として見せる。
          // 「この先まだ何か建つ」という期待だけ残し、押せるボタンは出さない。
          return (
            <div
              key={stage}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ top: `${anchor.building.top}%`, left: `${anchor.building.left}%` }}
              aria-hidden="true"
            >
              <div
                className="rounded-2xl border-2 border-dashed border-zinc-300/70 bg-white/30"
                style={{ width: markerSize, height: markerSize }}
              />
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
                建物の位置そのものを表す。 */}
            <div
              className="absolute -translate-x-1/2 -translate-y-1/2 rounded-2xl"
              style={{
                top: `${anchor.building.top}%`,
                left: `${anchor.building.left}%`,
                width: markerSize,
                height: markerSize,
                backgroundColor: withAlpha(color, "26"),
                border: `2px solid ${color}`,
                boxShadow: isCurrent ? `0 0 0 4px ${withAlpha(color, "1a")}` : undefined,
              }}
              aria-hidden="true"
            >
              <Icon
                className="absolute left-1/2 top-1/2 h-[45%] w-[45%] -translate-x-1/2 -translate-y-1/2"
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
  );
}
