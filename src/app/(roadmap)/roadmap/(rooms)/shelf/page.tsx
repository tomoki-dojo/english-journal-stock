import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, BookOpen } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getUserRoadmapState } from "@/lib/supabase/speaking-roadmap";
import { getPlan } from "@/lib/supabase/profile";
import {
  getKuwagataShelfTanks,
  getPendingCatchState,
  getUncelebratedAreas,
  getUnlockedAreas,
  ANCIENT_AREA_CODE,
} from "@/lib/supabase/kuwagata";
import { ensureGuestRoadmapState } from "@/lib/supabase/guest";
import { GuestRegisterBanner } from "@/components/roadmap/guest-register-banner";
import { OnboardingQuiz } from "@/components/roadmap/onboarding-quiz";
import { KuwagataShelf } from "@/components/roadmap/kuwagata-shelf";
import { KuwagataCatchExpedition } from "@/components/roadmap/kuwagata-catch-expedition";
import { KuwagataAreaUnlockCelebration } from "@/components/roadmap/kuwagata-area-unlock-celebration";

export default async function KuwagataShelfPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=roadmap&next=/roadmap/shelf");
  }

  if (user.isAnonymous) await ensureGuestRoadmapState(user.id);

  const state = await getUserRoadmapState(user.id);
  if (!state || !state.onboardingQuizCompleted) {
    return <OnboardingQuiz />;
  }

  let tanks: Awaited<ReturnType<typeof getKuwagataShelfTanks>>["tanks"] = [];
  let knownTanks: Awaited<ReturnType<typeof getKuwagataShelfTanks>>["knownTanks"] = [];
  let hiddenNewSpeciesTankCount = 0;
  let pendingCatchCount = 0;
  let pendingGuaranteedCount = 0;
  let unlockedAreas: Awaited<ReturnType<typeof getUnlockedAreas>> = [];
  let newAreas: Awaited<ReturnType<typeof getUnlockedAreas>> = [];
  let proLockedAreas: (typeof ANCIENT_AREA_CODE)[] = [];
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
    pendingGuaranteedCount = Math.min(pending.pendingGuaranteedRareCatchCount, pending.pendingCatchCount);
    unlockedAreas = areas;
    if ((await getPlan(user.id)) === "free" && !areas.includes(ANCIENT_AREA_CODE)) {
      proLockedAreas = [ANCIENT_AREA_CODE];
    }
    // 解放の記録は getUnlockedAreas が行うので、その後で「まだ演出を見ていないエリア」を調べる。
    newAreas = (await getUncelebratedAreas(user.id)).filter((a) => areas.includes(a));
  } catch (err) {
    console.error(err);
    loadError = true;
  }

  return (
    <div>
      <div className={`mb-4 flex items-center ${user.isAnonymous ? "justify-between" : "justify-end"}`}>
        {user.isAnonymous && (
          <Link
            href="/roadmap/stage1"
            className="inline-flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
          >
            <ChevronLeft className="h-4 w-4" />
            練習に戻る
          </Link>
        )}
        {!user.isAnonymous && (
          <Link
            href="/roadmap/encyclopedia"
            className="inline-flex items-center gap-1.5 rounded-full bg-amber-900 px-4 py-2 text-sm font-black text-amber-50 shadow-md ring-2 ring-amber-900/20 transition-transform hover:bg-amber-800 active:scale-95"
          >
            <BookOpen className="h-4 w-4" />
            図鑑を見る
          </Link>
        )}
      </div>

      {user.isAnonymous && <GuestRegisterBanner source="shelf" />}

      <h1 className="mb-5 text-lg font-bold text-zinc-800">クワたんの棚</h1>

      {loadError ? (
        <p className="text-sm text-red-500">棚の読み込みに失敗しました。時間を置いて再度お試しください。</p>
      ) : (
        <>
          {newAreas.length > 0 && (
            <KuwagataAreaUnlockCelebration unlockedAreas={unlockedAreas} newAreas={newAreas} />
          )}
          <KuwagataCatchExpedition
            guest={user.isAnonymous}
            initialPendingCount={pendingCatchCount}
            initialGuaranteedCount={pendingGuaranteedCount}
            initialUnlockedAreas={unlockedAreas}
            proLockedAreas={proLockedAreas}
          />
          <KuwagataShelf tanks={tanks} knownTanks={knownTanks} lockedSpeciesCount={hiddenNewSpeciesTankCount} />
        </>
      )}
    </div>
  );
}
