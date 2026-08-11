import Link from "next/link";
import { redirect } from "next/navigation";
import { BrainCircuit, ChevronRight, Lock, Shuffle } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import { getProgressSummary } from "@/lib/supabase/word-review";

// 単語学習の練習ダッシュボード。ログインは必須（マイリストに基づく出題のため）。
// 「ランダム学習」は誰でも利用できる練習モード。「今日の復習」（間隔反復）のみPro/Premium限定。
export default async function VocabularyLearnPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login");
  }

  const plan = await getPlan(user.id);
  const summary = plan !== "free" ? await getProgressSummary(user.id) : null;

  return (
    <div className="max-w-xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">単語学習</h1>
        <p className="mt-2 text-sm text-zinc-500">
          マイリストに保存した単語を練習できます。単語自体の閲覧・検索・保存は
          <Link href="/vocabulary" className="text-accent hover:underline">
            単語帳
          </Link>
          からどなたでもできます。
        </p>
      </div>

      {/* ランダム学習：誰でも利用可能 */}
      <section className="rounded-xl border border-zinc-200 bg-zinc-100/50 p-6">
        <div className="mb-2 flex items-center gap-2">
          <Shuffle className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-zinc-900">ランダム学習</h2>
        </div>
        <p className="mb-4 text-sm text-zinc-500">
          マイリストの単語から何度でもランダムに出題する練習モードです。間隔反復の進捗（次回復習日）には影響しません。
        </p>
        <Link
          href="/vocabulary/learn/random"
          className="flex items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition-colors hover:bg-accent/90"
        >
          <Shuffle className="h-4 w-4" />
          ランダム学習を始める（10問）
        </Link>
        {plan === "free" && (
          <p className="mt-3 text-xs text-zinc-400">
            Proにアップグレードすると、間隔反復のデータをもとに苦手な単語を優先的に出題します。
          </p>
        )}
      </section>

      {/* 今日の復習：Pro/Premium限定 */}
      {plan === "free" ? (
        <section className="rounded-xl border border-zinc-200 bg-zinc-100/50 p-6">
          <div className="mb-2 flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-zinc-400" />
            <h2 className="text-sm font-semibold text-zinc-900">今日の復習</h2>
            <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold text-accent">
              Pro限定
            </span>
          </div>
          <p className="mb-4 text-sm text-zinc-500">
            間隔反復（Leitner箱方式）はPro限定です。忘れかけた頃に自動で復習が来る学習エンジンです。
          </p>
          <Link
            href="/settings"
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-zinc-200/40 px-4 py-2 text-sm font-medium text-zinc-400"
          >
            <Lock className="h-3.5 w-3.5" />
            今日の復習はPro限定です
          </Link>
        </section>
      ) : (
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <BrainCircuit className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-zinc-900">今日の復習</h2>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-zinc-200 bg-zinc-100/50 p-4 text-center">
              <p className="text-2xl font-semibold text-accent">{summary!.dueToday}</p>
              <p className="mt-1 text-xs text-zinc-500">今日の復習</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-100/50 p-4 text-center">
              <p className="text-2xl font-semibold text-zinc-900">{summary!.learning}</p>
              <p className="mt-1 text-xs text-zinc-500">学習中</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-100/50 p-4 text-center">
              <p className="text-2xl font-semibold text-zinc-900">{summary!.mastered}</p>
              <p className="mt-1 text-xs text-zinc-500">覚えた単語</p>
            </div>
          </div>

          {summary!.total === 0 ? (
            <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-100/30 px-6 py-10 text-center">
              <p className="mb-3 text-sm text-zinc-500">
                まだ学習中の単語がありません。単語帳から「学習を始める」を押すと、ここに復習スケジュールが表示されます。
              </p>
              <Link
                href="/vocabulary"
                className="inline-flex items-center gap-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
              >
                単語帳を見る
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          ) : summary!.dueToday > 0 ? (
            <Link
              href="/vocabulary/learn/quiz"
              className="flex items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition-colors hover:bg-accent/90"
            >
              <BrainCircuit className="h-4 w-4" />
              今日の復習を始める（{summary!.dueToday}問）
            </Link>
          ) : (
            <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-100/30 px-6 py-10 text-center">
              <p className="text-sm text-zinc-500">今日の復習はすべて完了しています。おつかれさまでした。</p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
