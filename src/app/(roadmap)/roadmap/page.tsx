import Link from "next/link";
import { redirect } from "next/navigation";
import { Flame, Lightbulb, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import {
  getCurrentStreak,
  getUserRoadmapState,
} from "@/lib/supabase/speaking-roadmap";
import { OnboardingQuiz } from "@/components/roadmap/onboarding-quiz";
import { RoadmapMap } from "@/components/roadmap/roadmap-map";
import { STAGE_COLORS, withAlpha } from "@/components/roadmap/stage-colors";

// スピーキング・ロードマップのホーム（「箱庭画面」）。
// 練習画面（クイズ）とは別画面に分離し、ここは箱庭ビジュアル＋各Stageへの入り口だけを持つ拠点画面にする。
// 各Stageへの入り口はRoadmapMap内に直接埋め込まれており、ページ側に別途リンク一覧は置かない。
export default async function RoadmapPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=roadmap&next=/roadmap");
  }

  const state = await getUserRoadmapState(user.id);

  if (!state || !state.onboardingQuizCompleted) {
    return <OnboardingQuiz />;
  }

  const streak = await getCurrentStreak(user.id);

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">スピーキング・ロードマップ</h1>
        <p className="mt-2 text-sm text-zinc-500">
          街を育てながら、話す力を少しずつ積み上げていきます。
        </p>
      </div>

      {/*
        箱庭ビジュアル本体。Stage1〜5の建物/ボタンを1枚のマップ上に直接重ねる構成
        （下にボタン一覧は並べない）。実イラスト（brand/isometric-city-asset-spec.md）は
        別タスク（#150）で差し替える前提で、ここでは配置・解放状態のロジックだけ実装している。
      */}
      <RoadmapMap currentStage={state.currentStage} />

      {/*
        Stage0（使い分けパーツ）はStage1〜5の一本道とは別の、いつでも寄れる独立エリア（ゲートにしない
        方針。_reference/speaking-roadmap-design.md参照）。マップ上の建物とは連動させず、
        「資料館」のような立ち位置の入り口として、マップの外に常設で置く。
        アイソメ都市ビジュアル実装（タスク#150）で見た目は差し替える前提の暫定表示。
      */}
      <Link
        href="/roadmap/stage0"
        className="mb-6 flex items-center gap-3 rounded-xl border p-4 transition-colors"
        style={{ borderColor: withAlpha(STAGE_COLORS[0], "33"), backgroundColor: withAlpha(STAGE_COLORS[0], "0a") }}
      >
        <span
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full"
          style={{ backgroundColor: withAlpha(STAGE_COLORS[0], "1a") }}
        >
          <Lightbulb className="h-5 w-5" style={{ color: STAGE_COLORS[0] }} />
        </span>
        <div>
          <p className="text-sm font-semibold text-zinc-900">使い分けパーツ</p>
          <p className="text-xs text-zinc-500">
            日本語にない英語の感覚を、いつでも寄って練習できます（Stageの進み具合とは関係ありません）
          </p>
        </div>
      </Link>

      <div className="mb-6 grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-zinc-200 bg-zinc-100/50 p-4 text-center">
          <div className="flex items-center justify-center gap-1.5">
            <Sparkles className="h-4 w-4 text-accent" />
            <p className="text-2xl font-semibold text-accent">{state.totalMasteredCount}</p>
          </div>
          <p className="mt-1 text-xs text-zinc-500">累計習得フレーズ</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-100/50 p-4 text-center">
          <div className="flex items-center justify-center gap-1.5">
            <Flame className="h-4 w-4 text-accent" />
            <p className="text-2xl font-semibold text-accent">{streak}</p>
          </div>
          <p className="mt-1 text-xs text-zinc-500">連続practice日数</p>
        </div>
      </div>
    </div>
  );
}
