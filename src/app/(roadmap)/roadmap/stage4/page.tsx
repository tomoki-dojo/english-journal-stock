import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getUserRoadmapState } from "@/lib/supabase/speaking-roadmap";
import { OnboardingQuiz } from "@/components/roadmap/onboarding-quiz";
import { Stage4Practice } from "@/components/roadmap/stage4-practice";

// Stage4（AIロールプレイ）の練習画面。箱庭画面（/roadmap）とは別ルートに分離。
// Stage1〜3の「表現プールから動的に出題」とは違い、固定シナリオの一覧から選んで会話する形式
// （_reference/speaking-roadmap-design.md参照）。
export default async function RoadmapStage4Page() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=roadmap&next=/roadmap/stage4");
  }

  const state = await getUserRoadmapState(user.id);
  if (!state || !state.onboardingQuizCompleted) {
    return <OnboardingQuiz />;
  }

  return (
    <div className="max-w-xl">
      <Link
        href="/roadmap"
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
      >
        <ChevronLeft className="h-4 w-4" />
        街に戻る
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Stage4・会話</h1>
      </div>

      <Stage4Practice />
    </div>
  );
}
