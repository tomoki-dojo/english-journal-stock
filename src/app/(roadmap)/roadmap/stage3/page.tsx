import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getUserRoadmapState } from "@/lib/supabase/speaking-roadmap";
import { OnboardingQuiz } from "@/components/roadmap/onboarding-quiz";
import { Stage3Practice } from "@/components/roadmap/stage3-practice";

// Stage3（型を崩して自分の言葉で言う）の練習画面。箱庭画面（/roadmap）とは別ルートに分離。
// Stage1・2と違い「声に出す→AIが意味の一致を判定する」形式で、ラウンドという単位は持たない
// （_reference/speaking-roadmap-design.md参照）。
export default async function RoadmapStage3Page() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=roadmap&next=/roadmap/stage3");
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
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Stage3・自分の言葉で言う</h1>
      </div>

      <Stage3Practice />
    </div>
  );
}
