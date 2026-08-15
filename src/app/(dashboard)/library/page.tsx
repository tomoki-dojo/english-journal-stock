import { ExpressionStockList, SceneTagValues, IntentTagValues, ExamTagValues } from "@/components/expressions";
import type { SceneTagFilter, IntentTagFilter, ExamTagFilter } from "@/components/expressions";
import { applyPlanGating, listPublishedExpressions } from "@/lib/supabase/expressions";
import { listSavedExpressionIds } from "@/lib/supabase/saved-expressions";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import type { Plan } from "@/lib/plan";

// 検索＋シーン・機能・フォーマル度・レベル・資格試験タグの絞り込みで全件を探せる画面。
// ホーム画面の棚から「すべて見る」で遷移してくる際は、?scene=会議 のようにシーンを指定できる
// （?intent=依頼 のように機能タグ、?exam=TOEIC のように資格試験タグの指定にも対応）。
export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ scene?: string; intent?: string; exam?: string }>;
}) {
  const { scene, intent, exam } = await searchParams;
  const initialSceneTag: SceneTagFilter =
    scene && (SceneTagValues as readonly string[]).includes(scene) ? (scene as SceneTagFilter) : "すべて";
  const initialIntentTag: IntentTagFilter =
    intent && (IntentTagValues as readonly string[]).includes(intent)
      ? (intent as IntentTagFilter)
      : "すべて";
  const initialExamTag: ExamTagFilter =
    exam && (ExamTagValues as readonly string[]).includes(exam) ? (exam as ExamTagFilter) : "すべて";

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
      loggedIn={Boolean(user)}
      savedExpressionIds={savedExpressionIds}
      initialSceneTag={initialSceneTag}
      initialIntentTag={initialIntentTag}
      initialExamTag={initialExamTag}
    />
  );
}
