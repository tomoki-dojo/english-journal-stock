import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getUserRoadmapState } from "@/lib/supabase/speaking-roadmap";
import { OnboardingQuiz } from "@/components/roadmap/onboarding-quiz";
import { Stage1Practice } from "@/components/roadmap/stage1-practice";

// スピーキング・ロードマップのエントリーポイント。
// 会話クイズ未回答ならクイズを表示し、回答済みならStage1の練習画面を表示する。
// アイソメ都市ビジュアル・Stage2以降の出題は別タスクで実装する。
export default async function RoadmapPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=roadmap");
  }

  const state = await getUserRoadmapState(user.id);

  if (!state || !state.onboardingQuizCompleted) {
    return <OnboardingQuiz />;
  }

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">スピーキング・ロードマップ</h1>
        <p className="mt-2 text-sm text-zinc-500">
          {state.onboardingTrack === "business" ? "ビジネス英語コース" : "日常会話コース"}・Stage1（音読・シャドーイング）
        </p>
      </div>

      <Stage1Practice />
    </div>
  );
}
