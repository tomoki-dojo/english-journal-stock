"use client";

import { useState } from "react";
import Link from "next/link";
import { Lock, Search, Sparkles } from "lucide-react";
import {
  SceneTagValues,
  FormalityValues,
  LevelValues,
  IntentTagValues,
  type SceneTagFilter,
  type FormalityFilter,
  type LevelFilter,
  type IntentTagFilter,
} from "./types";
import type { Plan } from "@/lib/plan";
import { PRO_FEATURE_HIGHLIGHTS } from "@/lib/pro-features";
import { cn } from "@/lib/utils";

const sceneTagOptions: SceneTagFilter[] = ["すべて", ...SceneTagValues];
const formalityOptions: FormalityFilter[] = ["すべて", ...FormalityValues];
const levelOptions: LevelFilter[] = ["すべて", ...LevelValues];
const intentTagOptions: IntentTagFilter[] = ["すべて", ...IntentTagValues];

type ExpressionFiltersProps = {
  keyword: string;
  sceneTag: SceneTagFilter;
  formality: FormalityFilter;
  level: LevelFilter;
  intentTag: IntentTagFilter;
  plan: Plan;
  onKeywordChange: (value: string) => void;
  onSceneTagChange: (value: SceneTagFilter) => void;
  onFormalityChange: (value: FormalityFilter) => void;
  onLevelChange: (value: LevelFilter) => void;
  onIntentTagChange: (value: IntentTagFilter) => void;
  // ホームの棚や外部リンクから遷移してきた際、Freeプランでシーン・機能タグが
  // 指定されていた場合にアップセルを最初から表示しておくためのフラグ。
  initialSceneTagBlocked?: boolean;
  initialIntentTagBlocked?: boolean;
};

export function ExpressionFilters({
  keyword,
  sceneTag,
  formality,
  level,
  intentTag,
  plan,
  onKeywordChange,
  onSceneTagChange,
  onFormalityChange,
  onLevelChange,
  onIntentTagChange,
  initialSceneTagBlocked = false,
  initialIntentTagBlocked = false,
}: ExpressionFiltersProps) {
  const [showSceneTagUpsell, setShowSceneTagUpsell] = useState(initialSceneTagBlocked);
  const [showIntentTagUpsell, setShowIntentTagUpsell] = useState(initialIntentTagBlocked);
  // シーン・機能タグの絞り込みはPro/Premium限定（「シーン×機能」の掛け合わせがPro価値の核）。
  // 「すべて」は常に押せる。
  const sceneTagGated = plan === "free";
  const intentTagGated = plan === "free";

  function handleSceneTagClick(option: SceneTagFilter) {
    if (sceneTagGated && option !== "すべて") {
      setShowSceneTagUpsell(true);
      return;
    }
    setShowSceneTagUpsell(false);
    onSceneTagChange(option);
  }

  function handleIntentTagClick(option: IntentTagFilter) {
    if (intentTagGated && option !== "すべて") {
      setShowIntentTagUpsell(true);
      return;
    }
    setShowIntentTagUpsell(false);
    onIntentTagChange(option);
  }

  return (
    <section className="space-y-5 rounded-xl border border-zinc-200 bg-zinc-100/50 p-5 md:p-6">
      <div>
        <label htmlFor="expression-search" className="sr-only">
          キーワード検索
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            id="expression-search"
            type="search"
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder="circle back, 会議 などで検索..."
            className="w-full rounded-xl border border-zinc-400 bg-zinc-300/60 py-2.5 pl-10 pr-4 text-sm text-zinc-900 placeholder:text-zinc-500 transition-colors focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </div>
      </div>

      {plan === "free" && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-accent/5 px-3.5 py-2.5 text-xs text-zinc-600 ring-1 ring-accent/10">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-accent" />
          <span className="text-zinc-500">Proでできること:</span>
          <span>{PRO_FEATURE_HIGHLIGHTS.join(" ・ ")}</span>
          <Link
            href="/settings"
            className="ml-auto shrink-0 font-medium text-accent hover:underline"
          >
            詳しく見る
          </Link>
        </div>
      )}

      <div className="space-y-2.5">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          シーン
          {sceneTagGated && (
            <span className="ml-1.5 normal-case tracking-normal text-accent">
              （絞り込みはPro限定）
            </span>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {sceneTagOptions.map((option) => {
            const locked = sceneTagGated && option !== "すべて";
            return (
              <button
                key={option}
                type="button"
                onClick={() => handleSceneTagClick(option)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all",
                  locked
                    ? "cursor-pointer border-zinc-200 bg-zinc-200/40 text-zinc-400"
                    : sceneTag === option
                      ? "border-accent/50 bg-accent/10 text-accent"
                      : "border-zinc-400 bg-zinc-300/40 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900"
                )}
              >
                {locked && <Lock className="h-3 w-3" />}
                {option}
              </button>
            );
          })}
        </div>

        {showSceneTagUpsell && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent ring-1 ring-accent/20">
            <span>シーン別の絞り込みはPro会員限定機能です。</span>
            <Link href="/settings" className="font-medium underline underline-offset-2">
              プランを見る
            </Link>
          </div>
        )}
      </div>

      <div className="space-y-2.5">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          機能
          {intentTagGated && (
            <span className="ml-1.5 normal-case tracking-normal text-accent">
              （絞り込みはPro限定）
            </span>
          )}
        </p>
        <div className="flex flex-wrap gap-2">
          {intentTagOptions.map((option) => {
            const locked = intentTagGated && option !== "すべて";
            return (
              <button
                key={option}
                type="button"
                onClick={() => handleIntentTagClick(option)}
                className={cn(
                  "flex items-center gap-1 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all",
                  locked
                    ? "cursor-pointer border-zinc-200 bg-zinc-200/40 text-zinc-400"
                    : intentTag === option
                      ? "border-accent/50 bg-accent/10 text-accent"
                      : "border-zinc-400 bg-zinc-300/40 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900"
                )}
              >
                {locked && <Lock className="h-3 w-3" />}
                {option}
              </button>
            );
          })}
        </div>

        {showIntentTagUpsell && (
          <div className="flex flex-wrap items-center gap-2 rounded-lg bg-accent/10 px-3 py-2 text-xs text-accent ring-1 ring-accent/20">
            <span>機能タグの絞り込み（シーンとの掛け合わせ）はPro会員限定機能です。</span>
            <Link href="/settings" className="font-medium underline underline-offset-2">
              プランを見る
            </Link>
          </div>
        )}
      </div>

      <div className="space-y-2.5">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          フォーマル度
        </p>
        <div className="flex flex-wrap gap-2">
          {formalityOptions.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => onFormalityChange(option)}
              className={cn(
                "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all",
                formality === option
                  ? "border-accent/50 bg-accent/10 text-accent"
                  : "border-zinc-400 bg-zinc-300/40 text-zinc-600 hover:border-zinc-500 hover:text-zinc-900"
              )}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          レベル
        </p>
        <select
          value={level}
          onChange={(event) => onLevelChange(event.target.value as LevelFilter)}
          className="w-full rounded-lg border border-zinc-400 bg-zinc-300/60 px-3 py-2 text-sm text-zinc-800 transition-colors focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30 sm:w-44"
        >
          {levelOptions.map((option) => (
            <option key={option} value={option}>
              {option === "すべて" ? "すべてのレベル" : option}
            </option>
          ))}
        </select>
      </div>
    </section>
  );
}
