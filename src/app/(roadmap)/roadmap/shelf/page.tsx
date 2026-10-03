import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, BookOpen } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getUserRoadmapState } from "@/lib/supabase/speaking-roadmap";
import { getKuwagataShelfTanks, getPendingCatchState, getUnlockedAreas } from "@/lib/supabase/kuwagata";
import { OnboardingQuiz } from "@/components/roadmap/onboarding-quiz";
import { KuwagataShelf } from "@/components/roadmap/kuwagata-shelf";
import { KuwagataCatchExpedition } from "@/components/roadmap/kuwagata-catch-expedition";

export default async function KuwagataShelfPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=roadmap&next=/roadmap/shelf");
  }

  const state = await getUserRoadmapState(user.id);
  if (!state || !state.onboardingQuizCompleted) {
    return <OnboardingQuiz />;
  }

  let tanks: Awaited<ReturnType<typeof getKuwagataShelfTanks>>["tanks"] = [];
  let knownTanks: Awaited<ReturnType<typeof getKuwagataShelfTanks>>["knownTanks"] = [];
  let hiddenNewSpeciesTankCount = 0;
  let pendingCatchCount = 0;
  let unlockedAreas: Awaited<ReturnType<typeof getUnlockedAreas>> = [];
  let loadError = false;

  try {
    const [shelfResult, pending, areas] = await Promise.all([
      getKuwagataShelfTanks(user.id),
      getPendingCatchState(user.id),
      getUnlockedAreas(user.id),
    ]);
    tanks = shelfResult.tanks;
    knownTanks = shelfResult.knownTanks;
    hiddenNewSpeciesTankCount = shelfResult.hiddenNewSpeciesTankCount;
    pendingCatchCount = pending.pendingCatchCount;
    unlockedAreas = areas;
  } catch (err) {
    console.error(err);
    loadError = true;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/roadmap"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
        >
          <ChevronLeft className="h-4 w-4" />
          部屋に戻る
        </Link>
        <Link
          href="/roadmap/encyclopedia"
          className="inline-flex items-center gap-1 text-sm text-amber-700 transition-colors hover:text-amber-900"
        >
          <BookOpen className="h-4 w-4" />
          図鑑を見る
        </Link>
      </div>

      <h1 className="mb-5 text-lg font-bold text-zinc-800">クワたんの棚</h1>

      {loadError ? (
        <p className="text-sm text-red-500">棚の読み込みに失敗しました。時間を置いて再度お試しください。</p>
      ) : (
        <>
          <KuwagataCatchExpedition initialPendingCount={pendingCatchCount} initialUnlockedAreas={unlockedAreas} />
          <KuwagataShelf tanks={tanks} knownTanks={knownTanks} />
          {hiddenNewSpeciesTankCount > 0 && (
            <p className="mt-4 text-center text-xs text-amber-700">
              他にも{hiddenNewSpeciesTankCount}種類の水槽がありますが、Freeプランでは表示枠の都合で隠れています。Proにすると全部見られます。
            </p>
          )}
        </>
      )}
    </div>
  );
}
