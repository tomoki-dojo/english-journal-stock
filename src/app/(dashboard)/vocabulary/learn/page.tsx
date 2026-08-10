import Link from "next/link";
import { redirect } from "next/navigation";
import { BrainCircuit, ChevronRight, Sparkles } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import { getProgressSummary } from "@/lib/supabase/word-review";
import { PRO_FEATURE_HIGHLIGHTS, ProFeatureLabelText } from "@/lib/pro-features";

// 単語学習（間隔反復・小テスト）のダッシュボード。Pro/Premium限定機能。
// Freeユーザー・未ログインには、シーン/機能タグ絞り込みと同じ「機能をゲートする」方針で
// アップセル表示にする（単語自体の閲覧は/vocabularyで誰でもできる）。
export default async function VocabularyLearnPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const plan = await getPlan(user.id);

  if (plan === "free") {
    return (
      <div className="max-w-xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">単語学習</h1>
          <p className="mt-2 text-sm text-zinc-500">
            間隔反復（Leitner箱方式）で、忘れかけた頃に自動で復習が来る学習エンジンです。
          </p>
        </div>

        <section className="rounded-xl border border-accent/20 bg-accent/5 px-6 py-6">
          <div className="mb-3 flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-zinc-900">Proの便利機能</h2>
          </div>
          <ul className="mb-4 grid gap-2 sm:grid-cols-2">
            {PRO_FEATURE_HIGHLIGHTS.map((feature) => (
              <li key={feature.label} className="flex items-center gap-2 text-sm text-zinc-600">
                <BrainCircuit className="h-3.5 w-3.5 shrink-0 text-accent" />
                <ProFeatureLabelText highlight={feature} />
              </li>
            ))}
          </ul>
          <Link
            href="/settings"
            className="inline-flex items-center gap-0.5 text-sm font-medium text-accent hover:underline"
          >
            プランを見る
            <ChevronRight className="h-4 w-4" />
          </Link>
        </section>

        <p className="text-sm text-zinc-500">
          単語自体の閲覧・検索は
          <Link href="/vocabulary" className="text-accent hover:underline">
            単語帳
          </Link>
          からFreeでもできます。
        </p>
      </div>
    );
  }

  const summary = await getProgressSummary(user.id);

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">単語学習</h1>
        <p className="mt-2 text-sm text-zinc-500">
          学習リストに追加した単語を、間隔反復で忘れかけた頃に復習できます。
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-zinc-200 bg-zinc-100/50 p-4 text-center">
          <p className="text-2xl font-semibold text-accent">{summary.dueToday}</p>
          <p className="mt-1 text-xs text-zinc-500">今日の復習</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-100/50 p-4 text-center">
          <p className="text-2xl font-semibold text-zinc-900">{summary.learning}</p>
          <p className="mt-1 text-xs text-zinc-500">学習中</p>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-zinc-100/50 p-4 text-center">
          <p className="text-2xl font-semibold text-zinc-900">{summary.mastered}</p>
          <p className="mt-1 text-xs text-zinc-500">覚えた単語</p>
        </div>
      </div>

      {summary.total === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-100/30 px-6 py-10 text-center">
          <p className="mb-3 text-sm text-zinc-500">
            まだ学習リストに単語がありません。単語帳から「学習リストに追加」すると、ここに復習スケジュールが表示されます。
          </p>
          <Link
            href="/vocabulary"
            className="inline-flex items-center gap-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
          >
            単語帳を見る
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      ) : summary.dueToday > 0 ? (
        <Link
          href="/vocabulary/learn/quiz"
          className="flex items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition-colors hover:bg-accent/90"
        >
          <BrainCircuit className="h-4 w-4" />
          今日の復習を始める（{summary.dueToday}問）
        </Link>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-100/30 px-6 py-10 text-center">
          <p className="text-sm text-zinc-500">今日の復習はすべて完了しています。おつかれさまでした。</p>
        </div>
      )}
    </div>
  );
}
