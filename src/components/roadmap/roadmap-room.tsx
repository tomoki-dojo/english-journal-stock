import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Search,
  Container,
  SprayCan,
  Thermometer,
  Pipette,
  Microscope,
  StickyNote,
  Bug,
  Lock,
  Sparkles,
  Flame,
} from "lucide-react";
import { STAGE_COLORS, withAlpha } from "./stage-colors";
import { ProSkipButton } from "./pro-skip-button";
import { ArthurAvatar } from "./arthur";
import type { Plan } from "@/lib/plan";
import type { StreakStats } from "@/lib/supabase/speaking-roadmap";

const BOARD_COLOR = "#e11d48";
const SHELF_COLOR = "#92400e";

type StageNumber = 1 | 2 | 3 | 4 | 5;

// アイコンは「アーサーの飼育部屋」にある道具（初級→上級の飼育レベル準拠）に対応させている
// （Search=虫眼鏡、Container=虫カゴ、SprayCan=霧吹き、Thermometer=温度湿度計、
// Pipette=ピンセット、Microscope=顕微鏡。経緯は_reference/kuwagata-motif-exploration.md参照）。
const STAGE_META: Record<StageNumber, { label: string; caption: string; icon: LucideIcon; href: string }> = {
  1: { label: "Stage1", caption: "音読", icon: Container, href: "/roadmap/stage1" },
  2: { label: "Stage2", caption: "英作文", icon: SprayCan, href: "/roadmap/stage2" },
  3: { label: "Stage3", caption: "言い換え", icon: Thermometer, href: "/roadmap/stage3" },
  4: { label: "Stage4", caption: "会話", icon: Pipette, href: "/roadmap/stage4" },
  5: { label: "Stage5", caption: "実践", icon: Microscope, href: "/roadmap/stage5" },
};

const STAGE_NUMBERS: StageNumber[] = [1, 2, 3, 4, 5];

type RoadmapRoomProps = {
  stageReadiness: {
    stage2Ready: boolean;
    stage3Ready: boolean;
    stage4Ready: boolean;
    stage5DailyReady: boolean;
    stage5BusinessReady: boolean;
  };
  proSkipStartStage?: 2 | 3 | 4 | null;
  plan: Plan;
  proSkipEnabled: boolean;
  totalMasteredCount: number;
  streakStats: StreakStats;
};

function StageCase({
  color,
  icon: Icon,
  label,
  caption,
  href,
  locked,
  current,
}: {
  color: string;
  icon: LucideIcon;
  label: string;
  caption: string;
  href: string;
  locked: boolean;
  current: boolean;
}) {
  const content = (
    <div
      className={`flex flex-col items-center gap-1.5 rounded-xl border px-2 py-4 transition-transform ${
        locked
          ? "border-dashed border-zinc-200 bg-zinc-50"
          : "border-solid bg-gradient-to-b from-white to-white shadow-sm hover:scale-[1.03] hover:shadow-md active:scale-95"
      }`}
      style={
        locked
          ? undefined
          : {
              borderColor: color,
              boxShadow: current ? `0 0 0 3px ${withAlpha(color, "33")}` : undefined,
            }
      }
    >
      {locked ? (
        <Lock className="h-6 w-6 text-zinc-300" strokeWidth={1.75} />
      ) : (
        <Icon className="h-6 w-6" style={{ color }} strokeWidth={2} />
      )}
      <span className={`text-xs font-semibold ${locked ? "text-zinc-400" : ""}`} style={locked ? undefined : { color }}>
        {label}
      </span>
      <span className="text-[10px] text-zinc-400">{locked ? "未解放" : caption}</span>
    </div>
  );

  if (locked) {
    return content;
  }

  return (
    <Link href={href} className="block">
      {content}
    </Link>
  );
}

// スピーキング・ロードマップのホーム。
// アイソメ都市マップ（RoadmapMap）に代わる新しい入口。マップはカメラズーム・グリッドロックで
// 「探して見つける」操作を要求していたが、Stage0〜5への直接アプローチができない問題が
// 起きていたため、探索不要の固定グリッド（アーサーの飼育部屋）に置き換えた
// （検討の経緯は_reference/kuwagata-motif-exploration.md参照）。
// アート未制作のため、各Stageは色付きアイコンのケースで暫定表示。専用イラストが
// 揃い次第、StageCaseの中身だけ差し替えればよい構造にしてある。
export function RoadmapRoom({
  stageReadiness,
  proSkipStartStage = null,
  plan,
  proSkipEnabled,
  totalMasteredCount,
  streakStats,
}: RoadmapRoomProps) {
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
    5: stageReadiness.stage5DailyReady || stageReadiness.stage5BusinessReady,
  };
  const currentStage = proSkipStartStage ?? [...STAGE_NUMBERS].reverse().find((s) => UNLOCKED[s]) ?? 1;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 rounded-md bg-zinc-900/90 px-2.5 py-1.5 text-white shadow-sm">
          <ArthurAvatar size={22} animated />
          <div className="flex flex-col leading-tight">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              <span className="text-xs font-semibold">{totalMasteredCount}</span>
              <span className="text-[10px] text-zinc-300">習得フレーズ</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Flame className="h-3.5 w-3.5 text-amber-300" />
              <span className="text-xs font-semibold">{streakHeadline}</span>
            </div>
          </div>
        </div>
      </div>

      {isRecordTying && <p className="mb-2 text-right text-[10px] font-bold text-amber-600">連続記録更新中！</p>}

      <ProSkipButton plan={plan} proSkipEnabled={proSkipEnabled} proSkipStartStage={proSkipStartStage} />

      <div className="rounded-2xl border border-amber-200 bg-gradient-to-b from-amber-50 to-white p-4">
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StageCase
            color={STAGE_COLORS[0]}
            icon={Search}
            label="Stage0"
            caption="感覚"
            href="/roadmap/stage0"
            locked={false}
            current={false}
          />
          {STAGE_NUMBERS.map((stage) => {
            const meta = STAGE_META[stage];
            return (
              <StageCase
                key={stage}
                color={STAGE_COLORS[stage]}
                icon={meta.icon}
                label={meta.label}
                caption={meta.caption}
                href={meta.href}
                locked={!UNLOCKED[stage]}
                current={stage === currentStage}
              />
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <StageCase
            color={BOARD_COLOR}
            icon={StickyNote}
            label="コルクボード"
            caption="表現一覧"
            href="/roadmap/board"
            locked={false}
            current={false}
          />
          <StageCase
            color={SHELF_COLOR}
            icon={Bug}
            label="棚"
            caption="クワたん一覧"
            href="/roadmap/shelf"
            locked={false}
            current={false}
          />
        </div>
      </div>
    </div>
  );
}
