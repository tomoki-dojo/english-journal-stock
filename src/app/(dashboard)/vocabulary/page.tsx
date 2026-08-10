import { VocabularyList } from "@/components/vocabulary";
import { listPublishedVocabulary } from "@/lib/supabase/vocabulary";
import { listLearningVocabularyIds } from "@/lib/supabase/word-review";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import type { Plan } from "@/lib/plan";

// 単語帳の一覧画面。検索・レベル絞り込みはFreeでも使える。
// 学習リストへの追加（間隔反復・小テストの対象にする）はPro/Premium限定。
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

  let learningVocabularyIds: string[] = [];
  if (user) {
    try {
      learningVocabularyIds = await listLearningVocabularyIds(user.id);
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <VocabularyList
      vocabulary={vocabulary}
      loadError={loadError}
      plan={plan}
      learningVocabularyIds={learningVocabularyIds}
    />
  );
}
