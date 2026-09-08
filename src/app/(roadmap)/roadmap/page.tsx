import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, ChevronRight, Flame, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import {
  getCurrentStreak,
  getUserRoadmapState,
} from "@/lib/supabase/speaking-roadmap";
import { OnboardingQuiz } from "@/components/roadmap/onboarding-quiz";

// スピーキング・ロードマップのホーム（「箱庭画面」）。
// 練習画面（クイズ）とは別画面に分離し、ここは箱庭ビジュアル＋各Stageへの入り口だけを持つ拠点画面にする。
// 箱庭ビジュアル本体（アイソメ都市）は別タスクで実装するため、ここでは実装予定エリアを
// プレースホルダーとして確保するだけにとどめる（詳細は brand/isometric-city-asset-spec.md 参照）。
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
        箱庭ビジュアル実装予定エリア。
        今後ここに以下の3層を重ねて描画する想定（brand/isometric-city-asset-spec.md参照）：
        1. 密度：既存ビルが習得量に応じてフロアを増やす（継続増築）
        2. 拡張：大きな節目ごとに新種の建物が新区画に建つ（倉庫・放送局・カフェ・電波塔など）
        3. 質感：自転車・植木鉢・配達ボックスなどの小物パーツが蓄積する
        アイソメタイル比率（2:1）に合わせてaspect-[2/1]にしてある。
      */}
      <div className="mb-6 flex aspect-[2/1] items-center justify-center overflow-hidden rounded-2xl border border-dashed border-zinc-300 bg-gradient-to-b from-sky-50 to-zinc-100">
        <div className="px-6 text-center">
          <Building2 className="mx-auto mb-2 h-8 w-8 text-zinc-300" />
          <p className="text-sm text-zinc-400">箱庭ビジュアル実装予定エリア</p>
          <p className="mt-1 text-xs text-zinc-400">
            密度（増築）・拡張（新築）・質感（小物パーツ）の3層をここに重ねていきます
          </p>
        </div>
      </div>

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

      <div className="space-y-4">
        <Link
          href="/roadmap/stage1"
          className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-100/50 p-6 transition-colors hover:border-accent/40"
        >
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Stage1・音読/シャドーイング</h2>
            <p className="mt-1 text-sm text-zinc-500">短いフレーズを声に出して、耳と口を慣らします。</p>
          </div>
          <ChevronRight className="h-5 w-5 flex-shrink-0 text-zinc-400" />
        </Link>

        <Link
          href="/roadmap/stage2"
          className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-100/50 p-6 transition-colors hover:border-accent/40"
        >
          <div>
            <h2 className="text-sm font-semibold text-zinc-900">Stage2・瞬間英作文</h2>
            <p className="mt-1 text-sm text-zinc-500">
              Stage1で覚えたフレーズを、見ずに組み立てられるようにします。
            </p>
          </div>
          <ChevronRight className="h-5 w-5 flex-shrink-0 text-zinc-400" />
        </Link>
      </div>
    </div>
  );
}
