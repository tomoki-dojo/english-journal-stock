import { ExpressionStockList, SceneTagValues } from "@/components/expressions";
import type { SceneTagFilter } from "@/components/expressions";
import { applyPlanGating, listPublishedExpressions } from "@/lib/supabase/expressions";
import { listSavedExpressionIds } from "@/lib/supabase/saved-expressions";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import type { Plan } from "@/lib/plan";

// 検索＋シーン・フォーマル度・レベルの絞り込みで全件を探せる画面。
// ホーム画面の棚から「すべて見る」で遷移してくる際は、?scene=会議 のようにシーンを指定できる。
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ scene?: string }>;
}) {
  const { scene } = await searchParams;
  const initialSceneTag: SceneTagFilter =
    scene && (SceneTagValues as readonly string[]).includes(scene) ? (scene as SceneTagFilter) : "すべて";

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
    <ExpressionStockList
      expressions={gatedExpressions}
      loadError={loadError}
      plan={plan}
      savedExpressionIds={savedExpressionIds}
      initialSceneTag={initialSceneTag}
    />
  );
}
