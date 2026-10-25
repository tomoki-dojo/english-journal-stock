import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Hourglass, MessageCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getUserRoadmapState, isStage4Unlocked } from "@/lib/supabase/speaking-roadmap";
import { OnboardingQuiz } from "@/components/roadmap/onboarding-quiz";
import { STAGE_COLORS } from "@/components/roadmap/stage-colors";

// Stage4（AIロールプレイ）のハブページ。Stage5と同じく、日常編・ビジネス編を選んでから
// シナリオ一覧に進む(シナリオが増えても一覧が縦に長くなりすぎないように)。
// 箱庭画面（/roadmap）とは別ルート。
export default async function RoadmapStage4Page() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=roadmap&next=/roadmap/stage4");
  }

  const state = await getUserRoadmapState(user.id);
  if (!state || !state.onboardingQuizCompleted) {
    return <OnboardingQuiz />;
  }

  // 解放条件はハブ・各トラックのページ・APIのすべてでサーバー側で必ずチェックする
  // (isStage4Unlockedは通常の卒業条件に加えて、#156 Pro限定Stageスキップが有効な場合も解放する)。
  const unlocked = await isStage4Unlocked(user.id);

  const backLink = (
    <Link
      href="/roadmap"
      className="mb-1 inline-flex items-center gap-1 text-xs text-zinc-500 transition-colors hover:text-zinc-900 sm:mb-4 sm:text-sm"
    >
      <ChevronLeft className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
      部屋に戻る
    </Link>
  );

  if (!unlocked) {
    return (
      <div className="max-w-xl">
        {backLink}
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

  const tracks = [
    {
      key: "daily",
      label: "日常編",
      description: "買い物、外食、旅行、友人との会話、体調の相談など、身近なシーンを話す。",
      href: "/roadmap/stage4/daily",
    },
    {
      key: "business",
      label: "ビジネス編",
      description: "会議、電話、メール、交渉、プレゼンなど、仕事のシーンを話す。",
      href: "/roadmap/stage4/business",
    },
  ] as const;

  return (
    <div className="max-w-xl">
      {backLink}

      <div className="mb-3 sm:mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">Stage4・会話</h1>
      </div>

      <div className="flex flex-col gap-3">
        {tracks.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-100/50 p-4 transition-colors hover:border-accent/50"
          >
            <MessageCircle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: STAGE_COLORS[4] }} />
            <div>
              <p className="text-sm font-semibold text-zinc-900">{t.label}</p>
              <p className="mt-1 text-xs text-zinc-500">{t.description}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
