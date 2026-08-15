import Link from "next/link";
import { ExpressionStockList } from "@/components/expressions";
import { VocabularyList } from "@/components/vocabulary";
import { applyPlanGating, listPublishedExpressionsByCategory } from "@/lib/supabase/expressions";
import { listPublishedVocabularyByCategory } from "@/lib/supabase/vocabulary";
import { listSavedExpressionIds } from "@/lib/supabase/saved-expressions";
import { listSavedVocabularyIds } from "@/lib/supabase/saved-vocabulary";
import { listLearningVocabularyIds } from "@/lib/supabase/word-review";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import type { Plan } from "@/lib/plan";

const TOEIC_VOCAB_CATEGORY = "TOEIC単語";
const TOEIC_EXPRESSION_CATEGORY = "TOEIC表現";

// TOEIC対策の入口ページ。シーン別のビジネス表現（既存ホーム）とは別枠で、
// 「TOEICのスコアだけでなく、そのまま実務で使える」実務接続を訴求する。
// 単語帳・表現ストックのコンポーネントをcategory絞り込みで再利用しているだけなので、
// マイリスト・単語復習（間隔反復）は既存の/vocabulary, /practiceとデータを共有する。
export default async function ToeicPage() {
  let vocabulary: Awaited<ReturnType<typeof listPublishedVocabularyByCategory>> = [];
  let expressions: Awaited<ReturnType<typeof listPublishedExpressionsByCategory>> = [];
  let loadError = false;

  try {
    [vocabulary, expressions] = await Promise.all([
      listPublishedVocabularyByCategory(TOEIC_VOCAB_CATEGORY),
      listPublishedExpressionsByCategory(TOEIC_EXPRESSION_CATEGORY),
    ]);
  } catch (err) {
    console.error(err);
    loadError = true;
  }

  const user = await getCurrentUser();
  const plan: Plan = user ? await getPlan(user.id) : "free";
  const gatedExpressions = applyPlanGating(expressions);

  let savedVocabularyIds: string[] = [];
  let learningVocabularyIds: string[] = [];
  let savedExpressionIds: string[] = [];
  if (user) {
    try {
      [savedVocabularyIds, learningVocabularyIds, savedExpressionIds] = await Promise.all([
        listSavedVocabularyIds(user.id),
        listLearningVocabularyIds(user.id),
        listSavedExpressionIds(user.id),
      ]);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="space-y-12">
      <section className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">TOEIC対策</h1>
        <p className="max-w-2xl text-sm text-zinc-500">
          TOEICのスコアだけでなく、そのまま実務のメール・会議・商談で使える形で単語と表現を身につけられます。
        </p>

        {loadError && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-700">
            TOEICコンテンツの取得に失敗しました。時間をおいて再度お試しください。
          </div>
        )}
      </section>

      <VocabularyList
        vocabulary={vocabulary}
        plan={plan}
        loggedIn={Boolean(user)}
        savedVocabularyIds={savedVocabularyIds}
        learningVocabularyIds={learningVocabularyIds}
        title="TOEIC頻出単語"
        description="実務メールや会議でそのまま使える例文つきで掲載しています。"
        emptyMessage="準備中です。近日公開予定です。"
      />

      <ExpressionStockList
        expressions={gatedExpressions}
        plan={plan}
        loggedIn={Boolean(user)}
        savedExpressionIds={savedExpressionIds}
        title="TOEIC×実務で使える表現"
        description="Part5・7などで狙われるコロケーションを、実務での使い方が分かる例文2本つきで掲載しています。"
        emptyMessage="準備中です。近日公開予定です。"
      />

      <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-100/30 px-6 py-8 text-center">
        <p className="text-sm text-zinc-600">
          単語の復習やAIによるライティング添削は「演習」からご利用いただけます。
          <Link href="/practice" className="ml-1 underline">
            演習はこちら
          </Link>
        </p>
      </div>
    </div>
  );
}
