import { redirect } from "next/navigation";
import { ExpressionStockList } from "@/components/expressions";
import { applyPlanGating, listExpressionsByIds } from "@/lib/supabase/expressions";
import { listSavedExpressionIds } from "@/lib/supabase/saved-expressions";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";

export default async function MyListPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const plan = await getPlan(user.id);

  let expressions: Awaited<ReturnType<typeof listExpressionsByIds>> = [];
  let loadError = false;

  try {
    const savedIds = await listSavedExpressionIds(user.id);
    expressions = await listExpressionsByIds(savedIds);
  } catch (err) {
    console.error(err);
    loadError = true;
  }

  const gatedExpressions = applyPlanGating(expressions, plan);

  return (
    <ExpressionStockList
      expressions={gatedExpressions}
      loadError={loadError}
      plan={plan}
      savedExpressionIds={gatedExpressions.map((e) => e.id)}
      title="マイリスト（復習）"
      description="保存した表現をシーン・フォーマル度・レベルで絞り込んで復習できます。"
      emptyMessage="まだ保存した表現がありません。表現ストックのブックマークアイコンから追加できます。"
    />
  );
}
