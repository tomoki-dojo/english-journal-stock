import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Mic, PenLine, Radio, Coffee, RadioTower } from "lucide-react";
import { STAGE_COLORS, withAlpha } from "./stage-colors";
import { STAGE_MAP_ANCHORS, markerSizeStyle } from "./stage-map-anchors";

type StageNumber = 1 | 2 | 3 | 4 | 5;

// 練習画面(/roadmap/stageN)が実際に存在するStageのみ、地図上でクリック可能にする。
// Stage3〜5は画面自体が未実装のため、進捗上「解放」されていてもリンクは張らない
// （実装が追いついたらここに追加するだけでよい）。
const IMPLEMENTED_STAGES: readonly StageNumber[] = [1, 2];

const STAGE_META: Record<StageNumber, { label: string; caption: string; icon: LucideIcon; href: string }> = {
  1: { label: "Stage1", caption: "音読", icon: Mic, href: "/roadmap/stage1" },
  2: { label: "Stage2", caption: "英作文", icon: PenLine, href: "/roadmap/stage2" },
  3: { label: "Stage3", caption: "言い換え", icon: Radio, href: "/roadmap/stage3" },
  4: { label: "Stage4", caption: "会話", icon: Coffee, href: "/roadmap/stage4" },
  5: { label: "Stage5", caption: "実践", icon: RadioTower, href: "/roadmap/stage5" },
};

const STAGE_NUMBERS: StageNumber[] = [1, 2, 3, 4, 5];

type RoadmapMapProps = {
  currentStage: StageNumber;
};

// スピーキング・ロードマップのホーム＝「箱庭画面」本体。
// 1枚の画像ビジュアル(アイソメ都市)の上にStage1〜5の建物/ボタンを直接重ねて表示し、
// 下にボタン一覧を並べる構成にはしない。アイソメ都市の実イラストは別タスク（#150）で、
// ここでは「だいたいこの辺りに配置する」という座標・状態設計だけを先に作る。
export function RoadmapMap({ currentStage }: RoadmapMapProps) {
  return (
    <div className="relative mb-6 aspect-[4/3] w-full overflow-hidden rounded-2xl border border-zinc-200 bg-gradient-to-b from-sky-50 to-zinc-100 sm:aspect-[2/1]">
      {/* 地面のグリッド風の目印。実イラスト実装までの簡易背景。 */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(255,255,255,0.6),transparent_60%)]" />

      {STAGE_NUMBERS.map((stage) => {
        const anchor = STAGE_MAP_ANCHORS[stage];
        const unlocked = stage <= currentStage;
        const interactive = unlocked && IMPLEMENTED_STAGES.includes(stage);
        const style = {
          top: `${anchor.top}%`,
          left: `${anchor.left}%`,
        };
        const markerSize = markerSizeStyle(anchor.size);

        if (!interactive) {
          // 未解放（またはまだ画面が無いStage）は、輪郭だけのシルエット/空き地として見せる。
          // 「この先まだ何か建つ」という期待だけ残し、押せるボタンは出さない。
          return (
            <div
              key={stage}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={style}
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

        return (
          <Link
            key={stage}
            href={meta.href}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1 transition-transform active:scale-95"
            style={style}
          >
            <div
              className="flex items-center justify-center rounded-2xl shadow-sm transition-shadow hover:shadow-md"
              style={{
                width: markerSize,
                height: markerSize,
                backgroundColor: withAlpha(color, "26"),
                border: `2px solid ${color}`,
                boxShadow: isCurrent ? `0 0 0 4px ${withAlpha(color, "1a")}` : undefined,
              }}
            >
              <Icon
                className="h-[45%] w-[45%]"
                style={{ color }}
                strokeWidth={2.25}
              />
            </div>
            <span
              className="whitespace-nowrap rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-semibold shadow-sm sm:text-xs"
              style={{ color }}
            >
              {meta.caption}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
