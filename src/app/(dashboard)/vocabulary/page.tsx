import { VocabularyList } from "@/components/vocabulary";
import { listPublishedVocabulary } from "@/lib/supabase/vocabulary";
import { listLearningVocabularyIds } from "@/lib/supabase/word-review";
import { listSavedVocabularyIds } from "@/lib/supabase/saved-vocabulary";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import type { Plan } from "@/lib/plan";

// 単語帳の一覧画面。検索・レベル絞り込み・保存（マイリスト）はFreeでも使える。
// 学習を始める（間隔反復・小テストの対象にする）のみPro/Premium限定。
export default async function VocabularyPage() {
  let vocabulary: Awaited<ReturnType<typeof listPublishedVocabulary>> = [];
  let loadError = false;

  try {
    vocabulary = await listPublishedVocabulary();
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
    />
  );
}
