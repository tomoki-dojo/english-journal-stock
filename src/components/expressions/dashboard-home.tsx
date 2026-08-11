"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Check, ChevronRight, Sparkles } from "lucide-react";
import { ExpressionCard } from "./expression-card";
import { ShelfItemCard } from "./shelf-item-card";
import { pickShelfItems, pickTodaysHighlight, pickTodaysScenes } from "@/lib/daily-rotation";
import { PRO_FEATURE_HIGHLIGHTS, ProFeatureLabelText } from "@/lib/pro-features";
import type { Expression } from "./types";
import type { Plan } from "@/lib/plan";

type DashboardHomeProps = {
  expressions: Expression[];
  loadError?: boolean;
  plan: Plan;
  loggedIn?: boolean;
  savedExpressionIds?: string[];
  // JST基準の「今日」の日付キー（YYYY-MM-DD）。サーバー側で計算して渡すことで、
  // サーバー/クライアント間のハイドレーション不一致を避ける。
  dateKey: string;
};

// ダッシュボードのホーム画面。
// 「今日のピックアップ」1件と、シーン別の棚（日替わりで3シーン）を表示する。
// 棚は数件のティーザー表示のみで、シーン別の全件表示は引き続き/library（Pro限定）に委ねる。
export function DashboardHome({
  expressions,
  loadError = false,
  plan,
  loggedIn = true,
  savedExpressionIds = [],
  dateKey,
}: DashboardHomeProps) {
  const savedIdSet = useMemo(() => new Set(savedExpressionIds), [savedExpressionIds]);

  const highlight = useMemo(
    () => pickTodaysHighlight(expressions, dateKey),
    [expressions, dateKey]
  );

  const shelves = useMemo(() => {
    const scenes = pickTodaysScenes(dateKey);
    return scenes
      .map((scene) => ({ scene, items: pickShelfItems(expressions, scene, dateKey) }))
      .filter((shelf) => shelf.items.length > 0);
  }, [expressions, dateKey]);

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          今日のビジネス英語表現
        </h1>
        <p className="mt-2 text-sm text-zinc-500">
          今日のピックアップとシーン別の表現をお届けします。全件はいつでも検索から探せます。
        </p>
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-700">
          表現一覧の取得に失敗しました。時間をおいて再度お試しください。
        </div>
      )}

      {highlight && (
        <section>
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-accent">
            今日のピックアップ
          </p>
          <div className="max-w-xl">
            <ExpressionCard
              expression={highlight}
              plan={plan}
              loggedIn={loggedIn}
              initialSaved={savedIdSet.has(highlight.id)}
            />
          </div>
        </section>
      )}

      {shelves.map(({ scene, items }) => (
        <section key={scene}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900">{scene}で使える表現</h2>
            <Link
              href={`/library?scene=${encodeURIComponent(scene)}`}
              className="flex shrink-0 items-center gap-0.5 text-xs font-medium text-zinc-500 transition-colors hover:text-accent"
            >
              すべて見る
              <ChevronRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2">
            {items.map((expression) => (
              <ShelfItemCard
                key={expression.id}
                expression={expression}
                plan={plan}
                loggedIn={loggedIn}
              />
            ))}
          </div>
        </section>
      ))}

      {plan === "free" && (
        <section className="rounded-xl border border-accent/20 bg-accent/5 px-6 py-6">
          <div className="mb-3 flex items-center gap-1.5">
            <Sparkles className="h-4 w-4 text-accent" />
            <h2 className="text-sm font-semibold text-zinc-900">Proの便利機能</h2>
          </div>
          <ul className="mb-4 grid gap-2 sm:grid-cols-2">
            {PRO_FEATURE_HIGHLIGHTS.map((feature) => (
              <li key={feature.label} className="flex items-center gap-2 text-sm text-zinc-600">
                <Check className="h-3.5 w-3.5 shrink-0 text-accent" />
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
      )}

      <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-100/30 px-6 py-8 text-center">
        <p className="mb-3 text-sm text-zinc-500">
          {expressions.length}件の表現をキーワード・レベル・フォーマル度で検索できます。
        </p>
        <Link
          href="/library"
          className="inline-flex items-center gap-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
        >
          すべての表現を見る
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
