import { ExpressionStockList } from "@/components/expressions";
import { applyPlanGating, listPublishedExpressions } from "@/lib/supabase/expressions";
import { listSavedExpressionIds } from "@/lib/supabase/saved-expressions";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
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

  // 未ログインはfree扱い。ログイン済みならprofiles.planを見る。
  const user = await getCurrentUser();
  const plan: Plan = user ? await getPlan(user.id) : "free";

  const gatedExpressions = applyPlanGating(expressions, plan);

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
    <ExpressionStockList
      expressions={gatedExpressions}
      loadError={loadError}
      plan={plan}
      savedExpressionIds={savedExpressionIds}
    />
  );
}
