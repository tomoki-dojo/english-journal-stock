import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import { getProOfferState } from "@/lib/pro-offer-server";
import {
  getStreakStats,
  getRoadmapStageReadiness,
  getUserRoadmapState,
} from "@/lib/supabase/speaking-roadmap";
import { OnboardingQuiz } from "@/components/roadmap/onboarding-quiz";
import { RoadmapRoom } from "@/components/roadmap/roadmap-room";
import { RoomNoticeModal } from "@/components/roadmap/room-notice-modal";
import { getRoadmapNotices } from "@/lib/supabase/roadmap-notices";
import { recordStageClearCatch } from "@/lib/supabase/kuwagata";
import { isNotebookBoostCapped } from "@/lib/quiz-notebook";

// スピーキング・ロードマップのホーム（「アーサーの飼育部屋」）。
// アイソメ都市マップ（RoadmapMap）は2026-10-01廃止し、探索不要の固定グリッドである
// RoadmapRoomに置き換えた（経緯は_reference/kuwagata-motif-exploration.md参照）。
// 各Stageへの入り口はRoadmapRoom内に直接埋め込まれており、ページ側に別途リンク一覧は置かない。
export default async function RoadmapPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=roadmap&next=/roadmap");
  }

  const state = await getUserRoadmapState(user.id);

  if (!state || !state.onboardingQuizCompleted) {
    return <OnboardingQuiz />;
  }

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
      <RoomNoticeModal
        key={`${notices.newEggs.map((e) => e.id).join(",")}|${notices.newHatches.map((h) => h.id).join(",")}`}
        showAdvice={notices.showAdvice}
        announcements={notices.announcements}
        newEggs={notices.newEggs}
        newHatches={notices.newHatches}
        stageUps={notices.stageUps}
        trivia={notices.trivia}
        rareChance={notices.rareChance}
      />
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
