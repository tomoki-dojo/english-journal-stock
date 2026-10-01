import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getUserRoadmapState, listUsageRuleErrorTags } from "@/lib/supabase/speaking-roadmap";
import { OnboardingQuiz } from "@/components/roadmap/onboarding-quiz";
import { Stage0Practice } from "@/components/roadmap/stage0-practice";

// Stage0（使い分けパーツ）の練習画面。Stage1〜5の一本道とは別ルートで、ゲートにしない
// （currentStageに関係なく、オンボーディング完了後は常にアクセス可能）。
export default async function RoadmapStage0Page() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=roadmap&next=/roadmap/stage0");
  }

  const state = await getUserRoadmapState(user.id);
  if (!state || !state.onboardingQuizCompleted) {
    return <OnboardingQuiz />;
  }

  const errorTags = await listUsageRuleErrorTags();

  return (
    <div className="max-w-xl">
      <Link
        href="/roadmap"
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
      >
        <ChevronLeft className="h-4 w-4" />
        部屋に戻る
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Stage0・感覚</h1>
        <p className="mt-1 text-sm text-zinc-500">
          日本語の感覚のまま英語にすると事故りやすいポイントを、声に出しながら少しずつ体に入れます。
        </p>
      </div>

      <Stage0Practice availableErrorTags={errorTags} />
    </div>
  );
}
