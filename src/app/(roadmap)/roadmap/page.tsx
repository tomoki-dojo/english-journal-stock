import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import {
  getStreakStats,
  getRoadmapStageReadiness,
  getUserRoadmapState,
} from "@/lib/supabase/speaking-roadmap";
import { OnboardingQuiz } from "@/components/roadmap/onboarding-quiz";
import { RoadmapRoom } from "@/components/roadmap/roadmap-room";
import { RoomNoticeModal } from "@/components/roadmap/room-notice-modal";
import { getRoadmapNotices } from "@/lib/supabase/roadmap-notices";

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

  const streakStats = await getStreakStats(user.id);
  const stageReadiness = await getRoadmapStageReadiness(user.id);
  const plan = await getPlan(user.id);
  const notices = await getRoadmapNotices(user.id).catch(() => ({
    showAdvice: false,
    announcements: [],
    newEggs: [],
    newHatches: [],
  }));

  return (
    <>
      <RoomNoticeModal
        showAdvice={notices.showAdvice}
        announcements={notices.announcements}
        newEggs={notices.newEggs}
        newHatches={notices.newHatches}
      />
      <RoadmapRoom
        stageReadiness={stageReadiness}
        proSkipStartStage={state.proSkipStartStage}
        plan={plan}
        proSkipEnabled={state.proSkipEnabled}
        totalMasteredCount={state.totalMasteredCount}
        streakStats={streakStats}
      />
    </>
  );
}
