import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getUserRoadmapState } from "@/lib/supabase/speaking-roadmap";
import { OnboardingQuiz } from "@/components/roadmap/onboarding-quiz";
import { Stage2Practice } from "@/components/roadmap/stage2-practice";

// Stage2（瞬間英作文）の練習画面。箱庭画面（/roadmap）とは別ルートに分離。
// 中身は既存のStage2Practiceのまま（ラウンド対応はStage1の実装・検証後に横展開する）。
export default async function RoadmapStage2Page() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=roadmap&next=/roadmap/stage2");
  }

  const state = await getUserRoadmapState(user.id);
  if (!state || !state.onboardingQuizCompleted) {
    return <OnboardingQuiz />;
  }

  return (
    <div className="max-w-xl">
      <Link
        href="/roadmap"
        className="mb-1 inline-flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-900 sm:mb-4 sm:text-sm"
      >
        <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        部屋に戻る
      </Link>

      <div className="mb-3 sm:mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">Stage2・瞬間英作文</h1>
      </div>

      <Stage2Practice />
    </div>
  );
}
