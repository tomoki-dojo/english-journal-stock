import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getUserRoadmapState } from "@/lib/supabase/speaking-roadmap";
import { OnboardingQuiz } from "@/components/roadmap/onboarding-quiz";
import { NotebookQuiz } from "@/components/roadmap/notebook-quiz";

export default async function NotebookPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=roadmap&next=/roadmap/notebook");
  }

  const state = await getUserRoadmapState(user.id);
  if (!state || !state.onboardingQuizCompleted) {
    return <OnboardingQuiz />;
  }

  return (
    <div>
      <div className="mb-4">
        <Link
          href="/roadmap"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
        >
          <ChevronLeft className="h-4 w-4" />
          部屋に戻る
        </Link>
      </div>
      <h1 className="mb-5 text-lg font-bold text-zinc-800">単語ノート</h1>
      <NotebookQuiz />
    </div>
  );
}
