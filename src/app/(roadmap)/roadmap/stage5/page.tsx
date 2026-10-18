import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Hourglass, MessageCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getUserRoadmapState, isStage5TrackUnlocked } from "@/lib/supabase/speaking-roadmap";
import { OnboardingQuiz } from "@/components/roadmap/onboarding-quiz";
import { STAGE_COLORS } from "@/components/roadmap/stage-colors";

// Stage5（上級ロールプレイ）のハブページ。日常編・ビジネス編は完全に独立したトラックで、
// それぞれ対応するドメインのStage4シナリオを一定数卒業して初めて解放される
// （_reference/speaking-roadmap-design.md参照）。#150の箱庭ビジュアルはまだ2トラックの
// 分岐表現を持たないため、暫定的にこのハブページで2枚のカードとして選ばせる形にしている。
export default async function RoadmapStage5Page() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=roadmap&next=/roadmap/stage5");
  }

  const state = await getUserRoadmapState(user.id);
  if (!state || !state.onboardingQuizCompleted) {
    return <OnboardingQuiz />;
  }

  const [dailyUnlocked, businessUnlocked] = await Promise.all([
    isStage5TrackUnlocked(user.id, "daily"),
    isStage5TrackUnlocked(user.id, "business"),
  ]);

  const tracks = [
    {
      key: "daily",
      label: "日常編",
      description: "不動産屋でアパートを借りる、市役所で手続きをするなど、難しめの日常シーンを話す。",
      href: "/roadmap/stage5/daily",
      unlocked: dailyUnlocked,
      lockedMessage: "Stage4（日常シーン）のシナリオを5つ卒業すると開きます。",
    },
    {
      key: "business",
      label: "ビジネス編",
      description: "契約交渉や経営陣へのプレゼンなど、難しめのビジネスシーンを話す。",
      href: "/roadmap/stage5/business",
      unlocked: businessUnlocked,
      lockedMessage: "Stage4（ビジネスシーン）のシナリオを5つ卒業すると開きます。",
    },
  ] as const;

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
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900 sm:text-2xl">Stage5・実践会話</h1>
        <p className="mt-1 text-sm text-zinc-500">
          日常だけ、ビジネスだけ、どちらか極めたい方から選べます。
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {tracks.map((t) =>
          t.unlocked ? (
            <Link
              key={t.key}
              href={t.href}
              className="flex items-start gap-3 rounded-xl border border-zinc-200 bg-zinc-100/50 p-4 transition-colors hover:border-accent/50"
            >
              <MessageCircle className="mt-0.5 h-5 w-5 shrink-0" style={{ color: STAGE_COLORS[5] }} />
              <div>
                <p className="text-sm font-semibold text-zinc-900">{t.label}</p>
                <p className="mt-1 text-xs text-zinc-500">{t.description}</p>
              </div>
            </Link>
          ) : (
            <div
              key={t.key}
              className="flex items-start gap-3 rounded-xl border border-dashed border-zinc-200 bg-zinc-100/30 p-4"
            >
              <Hourglass className="mt-0.5 h-5 w-5 shrink-0 text-zinc-400" />
              <div>
                <p className="text-sm font-semibold text-zinc-500">{t.label}</p>
                <p className="mt-1 text-xs text-zinc-400">{t.lockedMessage}</p>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
}
