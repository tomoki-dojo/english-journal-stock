import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getUserRoadmapState } from "@/lib/supabase/speaking-roadmap";
import { OnboardingQuiz } from "@/components/roadmap/onboarding-quiz";
import { Stage1Practice } from "@/components/roadmap/stage1-practice";
import { Stage2Practice } from "@/components/roadmap/stage2-practice";
import { cn } from "@/lib/utils";

type RoadmapPageProps = {
  searchParams: Promise<{ stage?: string }>;
};

// スピーキング・ロードマップのエントリーポイント。
// 会話クイズ未回答ならクイズを表示し、回答済みならStage1・Stage2の練習画面をタブで切り替える。
// アイソメ都市ビジュアル・Stage3以降の出題は別タスクで実装する。
export default async function RoadmapPage({ searchParams }: RoadmapPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=roadmap&next=/roadmap");
  }

  const state = await getUserRoadmapState(user.id);

  if (!state || !state.onboardingQuizCompleted) {
    return <OnboardingQuiz />;
  }

  const { stage } = await searchParams;
  const activeStage = stage === "2" ? 2 : 1;

  return (
    <div className="max-w-xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">スピーキング・ロードマップ</h1>
        <p className="mt-2 text-sm text-zinc-500">
          {state.onboardingTrack === "business" ? "ビジネス英語コース" : "日常会話コース"}
        </p>
      </div>

      <div className="mb-6 flex items-center gap-1 border-b border-zinc-200">
        <Link
          href="/roadmap"
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            activeStage === 1
              ? "border-accent text-accent"
              : "border-transparent text-zinc-500 hover:text-zinc-900"
          )}
        >
          Stage1・音読/シャドーイング
        </Link>
        <Link
          href="/roadmap?stage=2"
          className={cn(
            "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
            activeStage === 2
              ? "border-accent text-accent"
              : "border-transparent text-zinc-500 hover:text-zinc-900"
          )}
        >
          Stage2・瞬間英作文
        </Link>
      </div>

      {activeStage === 1 ? <Stage1Practice /> : <Stage2Practice />}
    </div>
  );
}
