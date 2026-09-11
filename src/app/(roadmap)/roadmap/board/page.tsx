import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import {
  getUserRoadmapState,
  listTouchedExpressionProgress,
  type ExpressionRoadmapProgress,
} from "@/lib/supabase/speaking-roadmap";
import { listExpressionsByIds } from "@/lib/supabase/expressions";
import { OnboardingQuiz } from "@/components/roadmap/onboarding-quiz";
import { ExpressionStockList, type RoadmapBoardInfo } from "@/components/expressions";

// 街の掲示板（タスク#153）。「習得した表現一覧（トロフィー棚）」として、
// スピーキング・ロードマップ（Stage1〜3）のいずれかのStageで習得済みになった表現だけを
// 集めて検索できるようにする（2026-09-10 設計見直し：当初は「触れた表現全部」だったが、
// 練習中のものはStage1〜3の通常のアクティブセット出題で自然に出てくるため、掲示板側は
// あえて「習得済みのものだけ」に絞り、達成の記録・復習の入口という役割に特化させた）。
// ゼロから作らず、既存の表現検索基盤（ExpressionStockList/ExpressionCard）をそのまま流用し、
// 各カードにStageごとの習得状況バッジと「復習する」ボタンを追加で乗せているだけ。
// 「復習する」はStage別の練習画面へは飛ばさず、ExpressionCard内で完結する軽量な
// 復習フロー（ReviewModal、タスク#154）を開くだけ。Stage0（usage_rules）は
// expressionsと別物のため対象外。

const STAGE_LABEL: Record<1 | 2 | 3, string> = {
  1: "Stage1",
  2: "Stage2",
  3: "Stage3",
};

// 生の進捗（stage1/2/3ごとの状態）を、カード表示用のバッジに変換する。
// 1つもStageを習得していなければ掲示板には出さない（null）。
function buildRoadmapBoardInfo(progress: ExpressionRoadmapProgress): RoadmapBoardInfo | null {
  const stages: (1 | 2 | 3)[] = [1, 2, 3];
  const touched = stages.filter((s) => progress[`stage${s}` as "stage1" | "stage2" | "stage3"]);
  const hasMastered = touched.some(
    (s) => progress[`stage${s}` as "stage1" | "stage2" | "stage3"]?.status === "習得済み"
  );

  if (!hasMastered) return null;

  const badges = touched.map((s) => ({
    label: STAGE_LABEL[s],
    mastered: progress[`stage${s}` as "stage1" | "stage2" | "stage3"]?.status === "習得済み",
  }));

  return { badges };
}

export default async function RoadmapBoardPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=roadmap&next=/roadmap/board");
  }

  const state = await getUserRoadmapState(user.id);
  if (!state || !state.onboardingQuizCompleted) {
    return <OnboardingQuiz />;
  }

  const plan = await getPlan(user.id);

  let expressions: Awaited<ReturnType<typeof listExpressionsByIds>> = [];
  let roadmapInfoByExpressionId = new Map<string, RoadmapBoardInfo>();
  let loadError = false;

  try {
    const progressMap = await listTouchedExpressionProgress(user.id);
    const masteredEntries = Array.from(progressMap.entries())
      .map(([id, progress]) => [id, buildRoadmapBoardInfo(progress)] as const)
      .filter((entry): entry is [string, RoadmapBoardInfo] => entry[1] !== null);

    roadmapInfoByExpressionId = new Map(masteredEntries);
    expressions = await listExpressionsByIds(masteredEntries.map(([id]) => id));
  } catch (err) {
    console.error(err);
    loadError = true;
  }

  return (
    <div>
      <Link
        href="/roadmap"
        className="mb-4 inline-flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
      >
        <ChevronLeft className="h-4 w-4" />
        街に戻る
      </Link>

      <ExpressionStockList
        expressions={expressions}
        loadError={loadError}
        plan={plan}
        title="街の掲示板"
        description="ロードマップで習得した表現だけを集めたトロフィー棚です。キーワードで検索し、いつでも復習できます。"
        emptyMessage="まだ習得した表現がありません。Stage1〜3で練習を重ねると、ここに表現が並んでいきます。"
        roadmapInfoByExpressionId={roadmapInfoByExpressionId}
      />
    </div>
  );
}
