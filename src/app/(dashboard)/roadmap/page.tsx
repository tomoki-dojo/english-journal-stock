import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getUserRoadmapState } from "@/lib/supabase/speaking-roadmap";
import { OnboardingQuiz } from "@/components/roadmap/onboarding-quiz";

// スピーキング・ロードマップのエントリーポイント。
// 会話クイズ未回答ならクイズを表示し、回答済みならロードマップ本体を表示する。
// ロードマップ本体（アイソメ都市ビジュアル・Stage1以降の出題）は別タスクで実装するため、
// 現時点では最低限の現在地表示のみのプレースホルダー。
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
          {state.onboardingTrack === "business" ? "ビジネス英語コース" : "日常会話コース"}・現在Stage
          {state.currentStage}
        </p>
      </div>

      <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-100/30 px-6 py-10 text-center">
        <Building2 className="mx-auto mb-3 h-6 w-6 text-zinc-400" />
        <p className="text-sm text-zinc-500">
          街のビジュアルと出題は準備中です。もうしばらくお待ちください。
        </p>
      </div>
    </div>
  );
}
