"use client";

import { Fragment, useMemo, useState } from "react";
import { ExpressionCard } from "./expression-card";
import { ExpressionFilters } from "./expression-filters";
import { AdUnit } from "@/components/ads/ad-unit";
import type {
  Expression,
  SceneTagFilter,
  FormalityFilter,
  LevelFilter,
  IntentTagFilter,
  ExamTagFilter,
} from "./types";
import type { Plan } from "@/lib/plan";

// 何件のカードごとに広告を1枚挟むか（Freeプランのみ）
const AD_INTERVAL = 6;

type ExpressionStockListProps = {
  expressions: Expression[];
  loadError?: boolean;
  plan: Plan;
  loggedIn?: boolean;
  savedExpressionIds?: string[];
  title?: string;
  description?: string;
  emptyMessage?: string;
  // ホームの棚から「すべて見る」で遷移してきた際に、あらかじめ選択しておくシーン。
  // Freeプランの場合は絞り込みを適用せず、代わりにアップセルを表示する。
  initialSceneTag?: SceneTagFilter;
  // 同様に、外部リンクからあらかじめ選択しておく機能タグ。
  initialIntentTag?: IntentTagFilter;
  // 同様に、外部リンク（例: ホームのTOEIC導線）からあらかじめ選択しておく資格試験タグ。
  initialExamTag?: ExamTagFilter;
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
  loggedIn = true,
  savedExpressionIds = [],
  title = "表現ストック",
  description = "キーワード・シーン・機能・フォーマル度・レベルで絞り込み、ビジネス英語表現を探せます。",
  emptyMessage = "まだ公開中の表現がありません。準備が整い次第、順次公開されます。",
  initialSceneTag = "すべて",
  initialIntentTag = "すべて",
  initialExamTag = "すべて",
}: ExpressionStockListProps) {
  const savedIdSet = useMemo(() => new Set(savedExpressionIds), [savedExpressionIds]);
  const showAds = plan === "free";
  // シーン・機能タグの絞り込みはPro限定。Freeプランで指定された場合は適用せず、アップセル表示に回す。
  const sceneTagGated = plan === "free";
  const intentTagGated = plan === "free";
  const initialSceneTagBlocked = sceneTagGated && initialSceneTag !== "すべて";
  const initialIntentTagBlocked = intentTagGated && initialIntentTag !== "すべて";
  const [keyword, setKeyword] = useState("");
  const [sceneTag, setSceneTag] = useState<SceneTagFilter>(
    initialSceneTagBlocked ? "すべて" : initialSceneTag
  );
  const [formality, setFormality] = useState<FormalityFilter>("すべて");
  const [level, setLevel] = useState<LevelFilter>("すべて");
  const [intentTag, setIntentTag] = useState<IntentTagFilter>(
    initialIntentTagBlocked ? "すべて" : initialIntentTag
  );
  const [examTag, setExamTag] = useState<ExamTagFilter>(initialExamTag);

  const filteredExpressions = useMemo(() => {
    return expressions.filter((expression) => {
      const keywordMatch = matchesKeyword(expression, keyword);
      const sceneTagMatch = sceneTag === "すべて" || expression.sceneTags.includes(sceneTag);
      const formalityMatch = formality === "すべて" || expression.formality.includes(formality);
      const levelMatch = level === "すべて" || expression.level === level;
      const intentTagMatch =
        intentTag === "すべて" || (expression.intentTags?.includes(intentTag) ?? false);
      const examTagMatch =
        examTag === "すべて" || (expression.examTags?.includes(examTag) ?? false);

      return (
        keywordMatch && sceneTagMatch && formalityMatch && levelMatch && intentTagMatch && examTagMatch
      );
    });
  }, [expressions, keyword, sceneTag, formality, level, intentTag, examTag]);

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
        intentTag={intentTag}
        examTag={examTag}
        plan={plan}
        onKeywordChange={setKeyword}
        onSceneTagChange={setSceneTag}
        onFormalityChange={setFormality}
        onLevelChange={setLevel}
        onIntentTagChange={setIntentTag}
        onExamTagChange={setExamTag}
        initialSceneTagBlocked={initialSceneTagBlocked}
        initialIntentTagBlocked={initialIntentTagBlocked}
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
            {filteredExpressions.map((expression, index) => (
              <Fragment key={expression.id}>
                <ExpressionCard
                  expression={expression}
                  plan={plan}
                  loggedIn={loggedIn}
                  initialSaved={savedIdSet.has(expression.id)}
                />
                {showAds && index > 0 && (index + 1) % AD_INTERVAL === 0 && (
                  <div className="flex items-center justify-center rounded-xl border border-zinc-200 bg-zinc-100/30 p-3">
                    <AdUnit slot="3294476196" layoutKey="-fb+5w+4e-db+86" className="w-full" />
                  </div>
                )}
              </Fragment>
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
