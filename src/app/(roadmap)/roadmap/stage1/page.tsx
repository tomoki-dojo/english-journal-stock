import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getUserRoadmapState } from "@/lib/supabase/speaking-roadmap";
import { ensureGuestRoadmapState } from "@/lib/supabase/guest";
import { OnboardingQuiz } from "@/components/roadmap/onboarding-quiz";
import { Stage1Practice } from "@/components/roadmap/stage1-practice";

// Stage1（音読・シャドーイング）の練習画面。箱庭画面（/roadmap）とは別ルートに分離。
export default async function RoadmapStage1Page() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=roadmap&next=/roadmap/stage1");
  }

  // ゲストは会話クイズを飛ばして、Stage1から始める
  if (user.isAnonymous) await ensureGuestRoadmapState(user.id);

  const state = await getUserRoadmapState(user.id);
  if (!state || !state.onboardingQuizCompleted) {
    return <OnboardingQuiz />;
  }

  return (
    <div className="max-w-xl">
      <Link
        href={user.isAnonymous ? "/roadmap/shelf" : "/roadmap"}
        className="mb-1 inline-flex items-center gap-1 text-xs text-zinc-500 sm:mb-4 sm:text-sm transition-colors hover:text-zinc-900"
      >
        <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        {user.isAnonymous ? "棚を見る" : "部屋に戻る"}
      </Link>

      <div className="mb-3 sm:mb-6">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl text-zinc-900">Stage1・音読/シャドーイング</h1>
      </div>

      <Stage1Practice guest={user.isAnonymous} />
    </div>
  );
}
