import Link from "next/link";
import { redirect } from "next/navigation";
import { ExpressionStockList } from "@/components/expressions";
import { VocabularyList } from "@/components/vocabulary";
import { applyPlanGating, listExpressionsByIds } from "@/lib/supabase/expressions";
import { listSavedExpressionIds } from "@/lib/supabase/saved-expressions";
import { listVocabularyByIds } from "@/lib/supabase/vocabulary";
import { listSavedVocabularyIds } from "@/lib/supabase/saved-vocabulary";
import { listLearningVocabularyIds } from "@/lib/supabase/word-review";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import { cn } from "@/lib/utils";

type MyListPageProps = {
  searchParams: Promise<{ tab?: string }>;
};

export default async function MyListPage({ searchParams }: MyListPageProps) {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=mylist");
  }

  const { tab } = await searchParams;
  const activeTab = tab === "vocabulary" ? "vocabulary" : "expressions";

  const plan = await getPlan(user.id);

  const tabs = (
    <div className="mb-6 flex items-center gap-1 border-b border-zinc-200">
      <Link
        href="/mylist"
        className={cn(
          "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
          activeTab === "expressions"
            ? "border-accent text-accent"
            : "border-transparent text-zinc-500 hover:text-zinc-900"
        )}
      >
        表現
      </Link>
      <Link
        href="/mylist?tab=vocabulary"
        className={cn(
          "border-b-2 px-3 py-2 text-sm font-medium transition-colors",
          activeTab === "vocabulary"
            ? "border-accent text-accent"
            : "border-transparent text-zinc-500 hover:text-zinc-900"
        )}
      >
        単語
      </Link>
    </div>
  );

  if (activeTab === "vocabulary") {
    let vocabulary: Awaited<ReturnType<typeof listVocabularyByIds>> = [];
    let learningVocabularyIds: string[] = [];
    let loadError = false;

    try {
      const savedIds = await listSavedVocabularyIds(user.id);
      [vocabulary, learningVocabularyIds] = await Promise.all([
        listVocabularyByIds(savedIds),
        listLearningVocabularyIds(user.id),
      ]);
    } catch (err) {
      console.error(err);
      loadError = true;
    }

    return (
      <div>
        {tabs}
        <VocabularyList
          vocabulary={vocabulary}
          loadError={loadError}
          plan={plan}
          savedVocabularyIds={vocabulary.map((v) => v.id)}
          learningVocabularyIds={learningVocabularyIds}
          title="マイリスト（単語）"
          description="保存した単語をキーワード・レベルで絞り込んで復習できます。「学習を始める」で間隔反復の対象にできます（Pro限定）。"
          emptyMessage="まだ保存した単語がありません。単語帳のブックマークアイコンから追加できます。"
        />
      </div>
    );
  }

  let expressions: Awaited<ReturnType<typeof listExpressionsByIds>> = [];
  let loadError = false;

  try {
    const savedIds = await listSavedExpressionIds(user.id);
    expressions = await listExpressionsByIds(savedIds);
  } catch (err) {
    console.error(err);
    loadError = true;
  }

  const gatedExpressions = applyPlanGating(expressions);

  return (
    <div>
      {tabs}
      <ExpressionStockList
        expressions={gatedExpressions}
        loadError={loadError}
        plan={plan}
        savedExpressionIds={gatedExpressions.map((e) => e.id)}
        title="マイリスト（表現）"
        description="保存した表現をシーン・フォーマル度・レベルで絞り込んで復習できます。"
        emptyMessage="まだ保存した表現がありません。表現ストックのブックマークアイコンから追加できます。"
      />
    </div>
  );
}
