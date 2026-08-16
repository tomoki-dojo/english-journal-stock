import { VocabularyList, ExamTagValues, type ExamTagFilter } from "@/components/vocabulary";
import { searchPublishedVocabulary } from "@/lib/supabase/vocabulary";
import { listLearningVocabularyIds } from "@/lib/supabase/word-review";
import { listSavedVocabularyIds } from "@/lib/supabase/saved-vocabulary";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import type { Plan } from "@/lib/plan";

// 単語帳の一覧画面。検索・レベル・資格試験タグ絞り込み・保存（マイリスト）はFreeでも使える。
// 学習を始める（間隔反復・小テストの対象にする）のみPro/Premium限定。
// 一覧はサーバー側検索・ページネーション（search_vocabulary RPC）で取得する
// （収録数が500件を超えたため、全件をクライアントに渡す方式から切り替えた）。
export default async function VocabularyPage({
  searchParams,
}: {
  searchParams: Promise<{ exam?: string }>;
}) {
  const { exam } = await searchParams;
  const initialExamTag: ExamTagFilter =
    exam && (ExamTagValues as readonly string[]).includes(exam) ? (exam as ExamTagFilter) : "すべて";

  let vocabulary: Awaited<ReturnType<typeof searchPublishedVocabulary>>["items"] = [];
  let totalCount = 0;
  let loadError = false;

  try {
    const result = await searchPublishedVocabulary({
      examTag: initialExamTag !== "すべて" ? initialExamTag : undefined,
      page: 1,
    });
    vocabulary = result.items;
    totalCount = result.totalCount;
  } catch (err) {
    console.error(err);
    loadError = true;
  }

  const user = await getCurrentUser();
  const plan: Plan = user ? await getPlan(user.id) : "free";

  let savedVocabularyIds: string[] = [];
  let learningVocabularyIds: string[] = [];
  if (user) {
    try {
      [savedVocabularyIds, learningVocabularyIds] = await Promise.all([
        listSavedVocabularyIds(user.id),
        listLearningVocabularyIds(user.id),
      ]);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <VocabularyList
      vocabulary={vocabulary}
      loadError={loadError}
      plan={plan}
      loggedIn={Boolean(user)}
      savedVocabularyIds={savedVocabularyIds}
      learningVocabularyIds={learningVocabularyIds}
      initialExamTag={initialExamTag}
      serverMode
      initialTotalCount={totalCount}
    />
  );
}
