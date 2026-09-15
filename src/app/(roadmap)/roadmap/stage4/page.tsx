import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, Hourglass } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getUserRoadmapState, isStage4Unlocked } from "@/lib/supabase/speaking-roadmap";
import { OnboardingQuiz } from "@/components/roadmap/onboarding-quiz";
import { Stage4Practice } from "@/components/roadmap/stage4-practice";

// Stage4（AIロールプレイ）の練習画面。箱庭画面（/roadmap）とは別ルートに分離。
// Stage1〜3の「表現プールから動的に出題」とは違い、固定シナリオの一覧から選んで会話する形式
// （_reference/speaking-roadmap-design.md参照）。
export default async function RoadmapStage4Page() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=roadmap&next=/roadmap/stage4");
  }

  const state = await getUserRoadmapState(user.id);
  if (!state || !state.onboardingQuizCompleted) {
    return <OnboardingQuiz />;
  }

  // バグ修正（2026-09-14）：箱庭地図の鍵アイコンだけがこの条件を見ていて、ページ自体は
  // ログイン・オンボーディング完了しかチェックしていなかったため、Stage3を1問も
  // クリアしていなくてもURL直打ちでStage4にフルアクセスできてしまっていた。
  // ここでも同じ条件をサーバー側で必ずチェックする（isStage4Unlockedは通常の卒業条件に
  // 加えて、#156 Pro限定Stageスキップが有効な場合も解放する）。
  const unlocked = await isStage4Unlocked(user.id);
  if (!unlocked) {
    return (
      <div className="max-w-xl">
        <Link
          href="/roadmap"
          className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
        >
          <ChevronLeft className="h-4 w-4" />
          街に戻る
        </Link>
        <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-100/30 px-6 py-10 text-center">
          <Hourglass className="mx-auto mb-3 h-6 w-6 text-zinc-400" />
          <p className="text-sm text-zinc-500">
            Stage4はStage3の表現を6つ卒業すると開きます。
          </p>
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
        href="/roadmap"
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
      >
        <ChevronLeft className="h-4 w-4" />
        街に戻る
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Stage4・会話</h1>
      </div>

      <Stage4Practice />
    </div>
  );
}
