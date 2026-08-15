import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { buildRandomPracticeQuestions } from "@/lib/supabase/word-review";
import { VocabularyQuiz } from "@/components/vocabulary";

// ランダム学習：マイリストの単語から出題する練習モード。誰でも利用可能。
// 回答結果は間隔反復の状態（word_review_progress）には反映しない。
export default async function VocabularyRandomPracticePage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=vocabulary-learn-random");
  }

  const questions = await buildRandomPracticeQuestions(user.id);

  if (questions.length === 0) {
    return (
      <div className="max-w-xl space-y-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">ランダム学習</h1>
          <p className="mt-2 text-sm text-zinc-500">
            出題できる単語が見つかりませんでした。公開中の単語数がまだ少ない可能性があります。
          </p>
        </div>
        <Link
          href="/practice"
          className="inline-flex items-center gap-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
        >
          演習に戻る
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <VocabularyQuiz
      questions={questions}
      persistResults={false}
      backHref="/practice"
      backLabel="演習に戻る"
    />
  );
}
