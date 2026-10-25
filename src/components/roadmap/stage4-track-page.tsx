import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Hourglass } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getUserRoadmapState, isStage4Unlocked } from "@/lib/supabase/speaking-roadmap";
import { OnboardingQuiz } from "./onboarding-quiz";
import { Stage4Practice } from "./stage4-practice";

// Stage4・日常編/ビジネス編の練習画面(Stage5と同じ、ハブ→トラックの構造)。
// ハブの表示だけに頼るとURL直打ちで抜けられるので、ここでもサーバー側で解放条件を必ずチェックする。
export async function Stage4TrackPage({ track }: { track: "daily" | "business" }) {
  const path = `/roadmap/stage4/${track}`;
  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?reason=roadmap&next=${path}`);
  }

  const state = await getUserRoadmapState(user.id);
  if (!state || !state.onboardingQuizCompleted) {
    return <OnboardingQuiz />;
  }

  const unlocked = await isStage4Unlocked(user.id);
  if (!unlocked) {
    return (
      <div className="max-w-xl">
        <Link
          href="/roadmap/stage4"
          className="mb-1 inline-flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-900 sm:mb-4 sm:text-sm"
        >
          <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          Stage4に戻る
        </Link>
        <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-100/30 px-6 py-10 text-center">
          <Hourglass className="mx-auto mb-3 h-6 w-6 text-zinc-400" />
          <p className="text-sm text-zinc-500">Stage4はStage3の表現を6つ習得すると開きます。</p>
          <Link
            href="/roadmap/stage3"
            className="mt-4 inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400"
          >
            Stage3に進む
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-xl">
      <Link
        href="/roadmap/stage4"
        className="mb-1 inline-flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-900 sm:mb-4 sm:text-sm"
      >
        <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
        Stage4に戻る
      </Link>

      <div className="mb-3 sm:mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">
          Stage4・会話（{track === "daily" ? "日常編" : "ビジネス編"}）
        </h1>
      </div>

      <Stage4Practice track={track} />
    </div>
  );
}
