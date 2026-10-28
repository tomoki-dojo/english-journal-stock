import Link from "next/link";
import { ChevronLeft, BookOpen } from "lucide-react";
import type { CurrentUser } from "@/lib/supabase/server-auth";
import {
  getKuwagataShelfTanks,
  getPendingCatchState,
  getUncelebratedAreas,
  getUnlockedAreas,
  ANCIENT_AREA_CODE,
} from "@/lib/supabase/kuwagata";
import { GuestRegisterBanner } from "@/components/roadmap/guest-register-banner";
import { KuwagataShelf } from "@/components/roadmap/kuwagata-shelf";
import { KuwagataCatchExpedition } from "@/components/roadmap/kuwagata-catch-expedition";
import { KuwagataAreaUnlockCelebration } from "@/components/roadmap/kuwagata-area-unlock-celebration";
import { getPlan } from "@/lib/supabase/profile";
import { getProOfferState } from "@/lib/pro-offer-server";
import { getStreakStats, getRoadmapStageReadiness, type getUserRoadmapState } from "@/lib/supabase/speaking-roadmap";
import { RoadmapRoom } from "@/components/roadmap/roadmap-room";
import { RoomNoticeModal } from "@/components/roadmap/room-notice-modal";
import { RoomPaneGate } from "@/components/roadmap/room-carousel";
import { getRoadmapNotices } from "@/lib/supabase/roadmap-notices";
import { recordStageClearCatch } from "@/lib/supabase/kuwagata";
import { isNotebookBoostCapped } from "@/lib/quiz-notebook";

export type RoadmapState = NonNullable<Awaited<ReturnType<typeof getUserRoadmapState>>>;

// 飼育部屋(スピーキング・ロードマップのホーム)の中身。部屋の並び(RoomCarousel)の1枚として描かれる。
// 以前は /roadmap のページそのものだった。
export async function RoomHomeView({ user, state }: { user: { id: string }; state: RoadmapState }) {
  // 安全網：エークワたんのタマゴは新規登録時にDBトリガーが渡すが、何かの理由で持っていない場合に備えて、
  // 部屋に入るたびに「未所持なら渡す」(べき等)。失敗しても部屋の表示は続ける。
  // 互いに依存しない取得は同時に走らせて、待ち時間を重ねない(部屋の表示が遅くなるため)。
  // お知らせの系列(タマゴ安全網→お知らせ)だけが直列で、それ以外とは同時に走らせる。
  const streakP = getStreakStats(user.id);
  const planP = getPlan(user.id);
  const noticesP = recordStageClearCatch(user.id, 1)
    .catch(() => {})
    .then(async () =>
      getRoadmapNotices(user.id, { state, totalDays: (await streakP).totalDays }).catch(() => ({
        showAdvice: false,
        announcements: [],
        newEggs: [],
        newHatches: [],
        newShizuku: [],
        stageUps: [],
        trivia: null,
        rareChance: null,
      }))
    );
  // Free会員にだけ、先行者価格・無料お試しの案内ボタンを出す（判定に失敗したら出さないだけ）。
  const offerP = planP.then((p) => (p === "free" ? getProOfferState(user.id).catch(() => null) : null));
  const [streakStats, stageReadiness, plan, notebookCapped, notices, offer] = await Promise.all([
    streakP,
    getRoadmapStageReadiness(user.id, state),
    planP,
    planP.then((p) => isNotebookBoostCapped(user.id, p).catch(() => false)),
    noticesP,
    offerP,
  ]);

  return (
    <>
      {/* queueは初回表示時のpropsで作られるため、スキップ直後のrefreshで新しいタマゴが届いたときも
          すぐ演出が出るよう、未読タマゴ・羽化が変わったらkeyで作り直す。 */}
      <RoomPaneGate room="room">
      <RoomNoticeModal
        key={`${notices.newEggs.map((e) => e.id).join(",")}|${notices.newHatches.map((h) => h.id).join(",")}|${notices.newShizuku.map((z) => `${z.sceneKey}:${z.count}`).join(",")}`}
        showAdvice={notices.showAdvice}
        announcements={notices.announcements}
        newEggs={notices.newEggs}
        newHatches={notices.newHatches}
        newShizuku={notices.newShizuku}
        stageUps={notices.stageUps}
        trivia={notices.trivia}
        rareChance={notices.rareChance}
      />
      </RoomPaneGate>
      <RoadmapRoom
        stageReadiness={stageReadiness}
        proSkipStartStage={state.proSkipStartStage}
        plan={plan}
        proSkipEnabled={state.proSkipEnabled}
        proSkipAllowed={state.proSkipAllowed}
        proOffer={offer ? { founderActive: offer.founderActive, trialEligible: offer.trialEligible } : null}
        totalMasteredCount={state.totalMasteredCount}
        streakStats={streakStats}
        notebookCapped={notebookCapped}
      />
    </>
  );
}

// 棚の部屋(クワたんの棚)の中身。部屋の並び(RoomCarousel)の1枚として描かれる。
// 以前は /roadmap/shelf のページそのものだった。
export async function ShelfRoomView({ user }: { user: CurrentUser }) {
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
            <RoomPaneGate room="shelf">
              <KuwagataAreaUnlockCelebration unlockedAreas={unlockedAreas} newAreas={newAreas} />
            </RoomPaneGate>
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
