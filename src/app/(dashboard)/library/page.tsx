import { ExpressionStockList, SceneTagValues, IntentTagValues, ExamTagValues } from "@/components/expressions";
import type { SceneTagFilter, IntentTagFilter, ExamTagFilter } from "@/components/expressions";
import { applyPlanGating, searchPublishedExpressions } from "@/lib/supabase/expressions";
import { listSavedExpressionIds } from "@/lib/supabase/saved-expressions";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import type { Plan } from "@/lib/plan";

// 検索＋シーン・機能・フォーマル度・レベル・資格試験タグの絞り込みで全件を探せる画面。
// ホーム画面の棚から「すべて見る」で遷移してくる際は、?scene=会議 のようにシーンを指定できる
// （?intent=依頼 のように機能タグ、?exam=TOEIC のように資格試験タグの指定にも対応）。
// 一覧はサーバー側検索・ページネーション（search_expressions RPC）で取得する
// （収録数が500件を超えたため、全件をクライアントに渡す方式から切り替えた）。
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

  // Freeプランはシーン・機能タグ絞り込みが使えないため、初期値をURLで指定されていてもサーバー側の
  // 検索条件には含めない（クライアント側でアップセル表示のみ行う）。
  const user = await getCurrentUser();
  const plan: Plan = user ? await getPlan(user.id) : "free";
  const sceneTagGated = plan === "free";
  const intentTagGated = plan === "free";

  let expressions: Awaited<ReturnType<typeof searchPublishedExpressions>>["items"] = [];
  let totalCount = 0;
  let loadError = false;

  try {
    const result = await searchPublishedExpressions({
      sceneTag: !sceneTagGated && initialSceneTag !== "すべて" ? initialSceneTag : undefined,
      intentTag: !intentTagGated && initialIntentTag !== "すべて" ? initialIntentTag : undefined,
      examTag: initialExamTag !== "すべて" ? initialExamTag : undefined,
      page: 1,
    });
    expressions = result.items;
    totalCount = result.totalCount;
  } catch (err) {
    console.error(err);
    loadError = true;
  }

  const gatedExpressions = applyPlanGating(expressions);

  let savedExpressionIds: string[] = [];
  if (user) {
    try {
      savedExpressionIds = await listSavedExpressionIds(user.id);
    } catch (err) {
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
      serverMode
      initialTotalCount={totalCount}
    />
  );
}
