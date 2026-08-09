"use client";

import { useMemo, useState } from "react";
import { ExpressionCard } from "./expression-card";
import { ExpressionFilters } from "./expression-filters";
import type { Expression, SceneTagFilter, FormalityFilter, LevelFilter } from "./types";
import type { Plan } from "@/lib/plan";

type ExpressionStockListProps = {
  expressions: Expression[];
  loadError?: boolean;
  plan: Plan;
  savedExpressionIds?: string[];
  title?: string;
  description?: string;
  emptyMessage?: string;
  // ホームの棚から「すべて見る」で遷移してきた際に、あらかじめ選択しておくシーン。
  // Freeプランの場合は絞り込みを適用せず、代わりにアップセルを表示する。
  initialSceneTag?: SceneTagFilter;
};

function matchesKeyword(expression: Expression, keyword: string) {
  const needle = keyword.trim().toLowerCase();
  if (needle === "") return true;

  const haystack = [
    expression.expressionEn,
    expression.meaningJa,
    expression.example1En,
    expression.example1Ja,
    expression.example2En,
    expression.example2Ja,
    ...(expression.similarExpressions ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(needle);
}

export function ExpressionStockList({
  expressions,
  loadError = false,
  plan,
  savedExpressionIds = [],
  title = "表現ストック",
  description = "キーワード・シーン・フォーマル度・レベルで絞り込み、ビジネス英語表現を探せます。",
  emptyMessage = "まだ公開中の表現がありません。準備が整い次第、順次公開されます。",
  initialSceneTag = "すべて",
}: ExpressionStockListProps) {
  const savedIdSet = useMemo(() => new Set(savedExpressionIds), [savedExpressionIds]);
  // シーン絞り込みはPro限定。Freeプランで指定された場合は適用せず、アップセル表示に回す。
  const sceneTagGated = plan === "free";
  const initialSceneTagBlocked = sceneTagGated && initialSceneTag !== "すべて";
  const [keyword, setKeyword] = useState("");
  const [sceneTag, setSceneTag] = useState<SceneTagFilter>(
    initialSceneTagBlocked ? "すべて" : initialSceneTag
  );
  const [formality, setFormality] = useState<FormalityFilter>("すべて");
  const [level, setLevel] = useState<LevelFilter>("すべて");

  const filteredExpressions = useMemo(() => {
    return expressions.filter((expression) => {
      const keywordMatch = matchesKeyword(expression, keyword);
      const sceneTagMatch = sceneTag === "すべて" || expression.sceneTags.includes(sceneTag);
      const formalityMatch = formality === "すべて" || expression.formality.includes(formality);
      const levelMatch = level === "すべて" || expression.level === level;

      return keywordMatch && sceneTagMatch && formalityMatch && levelMatch;
    });
  }, [expressions, keyword, sceneTag, formality, level]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
        <p className="mt-2 text-sm text-zinc-500">{description}</p>
      </div>

      <ExpressionFilters
        keyword={keyword}
        sceneTag={sceneTag}
        formality={formality}
        level={level}
        plan={plan}
        onKeywordChange={setKeyword}
        onSceneTagChange={setSceneTag}
        onFormalityChange={setFormality}
        onLevelChange={setLevel}
        initialSceneTagBlocked={initialSceneTagBlocked}
      />

      {loadError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-700">
          表現一覧の取得に失敗しました。時間をおいて再度お試しください。
        </div>
      )}

      <div>
        <p className="mb-4 text-sm text-zinc-500">{filteredExpressions.length} 件の表現</p>

        {filteredExpressions.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filteredExpressions.map((expression) => (
              <ExpressionCard
                key={expression.id}
                expression={expression}
                plan={plan}
                initialSaved={savedIdSet.has(expression.id)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-100/30 px-6 py-16 text-center">
            <p className="text-sm text-zinc-500">
              {expressions.length === 0 ? emptyMessage : "条件に一致する表現が見つかりませんでした。"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
