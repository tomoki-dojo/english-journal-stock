import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getUserRoadmapState } from "@/lib/supabase/speaking-roadmap";
import { getKuwagataEncyclopedia } from "@/lib/supabase/kuwagata";
import { OnboardingQuiz } from "@/components/roadmap/onboarding-quiz";
import { KuwagataEncyclopediaView } from "@/components/roadmap/kuwagata-encyclopedia";

// クワガタ育成機能：図鑑ページ（タスク#254）。棚（/roadmap/shelf）とは別の独立ページで、
// 役割は「見た目（棚）」ではなく「進捗管理（図鑑）」。エリアタブ＋そのエリアの新種
// コンプリート進捗を見せるアルバム型（設計doc「UI構成」参照）。
export default async function KuwagataEncyclopediaPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=roadmap&next=/roadmap/encyclopedia");
  }

  const state = await getUserRoadmapState(user.id);
  if (!state || !state.onboardingQuizCompleted) {
    return <OnboardingQuiz />;
  }

  let encyclopedia: Awaited<ReturnType<typeof getKuwagataEncyclopedia>> | null = null;
  let loadError = false;

  try {
    encyclopedia = await getKuwagataEncyclopedia(user.id);
  } catch (err) {
    console.error(err);
    loadError = true;
  }

  return (
    <div>
      <Link
        href="/roadmap/shelf"
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
      >
        <ChevronLeft className="h-4 w-4" />
        棚に戻る
      </Link>

      <h1 className="mb-1 text-lg font-bold text-zinc-800">図鑑</h1>
      <p className="mb-5 text-sm text-zinc-500">
        これまでに出会ったクワガタの記録です。エリアごとの新種コンプリート状況もここで確認できます。
      </p>

      {loadError || !encyclopedia ? (
        <p className="text-sm text-red-500">図鑑の読み込みに失敗しました。時間を置いて再度お試しください。</p>
      ) : (
        <KuwagataEncyclopediaView encyclopedia={encyclopedia} />
      )}
    </div>
  );
}
