import { DashboardHome } from "@/components/expressions";
import { applyPlanGating, listPublishedExpressions } from "@/lib/supabase/expressions";
import { getPublishedVocabularyCount } from "@/lib/supabase/vocabulary";
import { getToeicContentCounts } from "@/lib/supabase/toeic-questions";
import { listSavedExpressionIds } from "@/lib/supabase/saved-expressions";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import { getTodayDateKey } from "@/lib/daily-rotation";
import type { Plan } from "@/lib/plan";

export default async function DashboardHomePage() {
  let expressions: Awaited<ReturnType<typeof listPublishedExpressions>> = [];
  let loadError = false;

  try {
    expressions = await listPublishedExpressions();
  } catch (err) {
    // expressionsテーブル未作成 or 未接続などでも一覧表示自体は継続する
    console.error(err);
    loadError = true;
  }

  // TOEIC対策カードに「◯語・◯選・◯問収録」とさりげなく出すための件数。
  // 取得に失敗してもホーム全体の表示は止めない。
  let vocabularyCount = 0;
  let toeicCounts: Awaited<ReturnType<typeof getToeicContentCounts>> | null = null;
  try {
    [vocabularyCount, toeicCounts] = await Promise.all([
      getPublishedVocabularyCount(),
      getToeicContentCounts(),
    ]);
  } catch (err) {
    console.error(err);
  }

  // 未ログインはfree扱い。ログイン済みならprofiles.planを見る。
  const user = await getCurrentUser();
  const plan: Plan = user ? await getPlan(user.id) : "free";

  const gatedExpressions = applyPlanGating(expressions);

  let savedExpressionIds: string[] = [];
  if (user) {
    try {
      savedExpressionIds = await listSavedExpressionIds(user.id);
    } catch (err) {
      // 保存済み状態が引けなくても一覧表示自体は継続する
      console.error(err);
    }
  }

  return (
    <DashboardHome
      expressions={gatedExpressions}
      loadError={loadError}
      plan={plan}
      loggedIn={Boolean(user)}
      savedExpressionIds={savedExpressionIds}
      dateKey={getTodayDateKey()}
      vocabularyCount={vocabularyCount}
      toeicCounts={toeicCounts}
    />
  );
}
