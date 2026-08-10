import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import { buildQuizQuestions } from "@/lib/supabase/word-review";
import { VocabularyQuiz } from "@/components/vocabulary";

// 今日の復習を4択クイズ形式で消化するページ。Pro/Premium限定機能。
export default async function VocabularyQuizPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const plan = await getPlan(user.id);
  if (plan === "free") {
    redirect("/vocabulary/learn");
  }

  const questions = await buildQuizQuestions(user.id);

  if (questions.length === 0) {
    return (
      <div className="max-w-xl space-y-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">今日の復習</h1>
          <p className="mt-2 text-sm text-zinc-500">
            今日復習すべき単語が見つかりませんでした。学習リストが空か、公開中の単語数がまだ少ない可能性があります。
          </p>
        </div>
        <Link
          href="/vocabulary/learn"
          className="inline-flex items-center gap-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
        >
          学習ダッシュボードに戻る
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return <VocabularyQuiz questions={questions} />;
}
