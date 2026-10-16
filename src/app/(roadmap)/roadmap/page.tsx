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
import { recordStageClearCatch } from "@/lib/supabase/kuwagata";

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
  await recordStageClearCatch(user.id, 1).catch(() => {});

  const streakStats = await getStreakStats(user.id);
  const stageReadiness = await getRoadmapStageReadiness(user.id);
  const plan = await getPlan(user.id);
  const notices = await getRoadmapNotices(user.id).catch(() => ({
    showAdvice: false,
    announcements: [],
    newEggs: [],
    newHatches: [],
    stageUps: [],
    trivia: null,
  }));

  return (
    <>
      <RoomNoticeModal
        showAdvice={notices.showAdvice}
        announcements={notices.announcements}
        newEggs={notices.newEggs}
        newHatches={notices.newHatches}
        stageUps={notices.stageUps}
        trivia={notices.trivia}
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
