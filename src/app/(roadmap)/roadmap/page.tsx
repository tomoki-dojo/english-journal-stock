import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import { getStreakStats, getRoadmapStageReadiness, getUserRoadmapState } from "@/lib/supabase/speaking-roadmap";
import { OnboardingQuiz } from "@/components/roadmap/onboarding-quiz";
import { RoadmapMap } from "@/components/roadmap/roadmap-map";

// スピーキング・ロードマップのホーム（「箱庭画面」）。
// 練習画面（クイズ）とは別画面に分離し、ここは箱庭ビジュアル＋各Stageへの入り口だけを持つ拠点画面にする。
// 各Stageへの入り口はRoadmapMap内に直接埋め込まれており、ページ側に別途リンク一覧は置かない。
// 2026-09-14修正：それまでページ側に個別に置いていたタイトル・説明文・統計カード・
// Stageスキップボタン・街の掲示板リンクをすべて撤去し、全面マップ中心のレイアウトに
// 再構築した。タイトル・統計・Stageスキップはマップ内のフローティングHUDへ、掲示板は
// マップ上の建物マーカーへ統合したため、ページ側はRoadmapMapに必要な値を渡すだけになる
// （詳細は_reference/speaking-roadmap-design.md参照）。
// 「今日の賑わい度」（旧・タスク#154の日次指標）は「街を見れば賑わいはわかる」という
// ユーザー指摘を受けて表示自体を廃止したため、getTodayActivityCountの呼び出しも削除した。
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

  return (
    <RoadmapMap
      stageReadiness={stageReadiness}
      proSkipStartStage={state.proSkipStartStage}
      plan={plan}
      proSkipEnabled={state.proSkipEnabled}
      totalMasteredCount={state.totalMasteredCount}
      streakStats={streakStats}
    />
  );
}
