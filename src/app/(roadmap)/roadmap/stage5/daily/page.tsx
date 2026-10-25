import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Hourglass } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getUserRoadmapState, isStage5TrackUnlocked } from "@/lib/supabase/speaking-roadmap";
import { OnboardingQuiz } from "@/components/roadmap/onboarding-quiz";
import { Stage5Practice } from "@/components/roadmap/stage5-practice";

// Stage5・日常編の練習画面。Stage4ページと同じく、ここでもサーバー側で解放条件を必ず
// チェックする（ハブページの表示だけに頼るとURL直打ちで抜けられてしまうため）。
export default async function RoadmapStage5DailyPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=roadmap&next=/roadmap/stage5/daily");
  }

  const state = await getUserRoadmapState(user.id);
  if (!state || !state.onboardingQuizCompleted) {
    return <OnboardingQuiz />;
  }

  const unlocked = await isStage5TrackUnlocked(user.id, "daily");
  if (!unlocked) {
    return (
      <div className="max-w-xl">
        <Link
          href="/roadmap/stage5"
          className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
        >
          <ChevronLeft className="h-4 w-4" />
          Stage5に戻る
        </Link>
        <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-100/30 px-6 py-10 text-center">
          <Hourglass className="mx-auto mb-3 h-6 w-6 text-zinc-400" />
          <p className="text-sm text-zinc-500">
            Stage5日常編はStage4（日常シーン）のシナリオを5つ習得すると開きます。
          </p>
          <Link
            href="/roadmap/stage4"
            className="mt-4 inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400"
          >
            Stage4に進む
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <Link
        href="/roadmap/stage5"
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
      >
        <ChevronLeft className="h-4 w-4" />
        Stage5に戻る
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Stage5・実践会話（日常編）</h1>
      </div>

      <Stage5Practice track="daily" />
    </div>
  );
}
