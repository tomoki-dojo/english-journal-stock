"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ExpressionCard } from "./expression-card";
import { ExpressionFilters } from "./expression-filters";
import { AdUnit } from "@/components/ads/ad-unit";
import { Pagination } from "@/components/ui/pagination";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { EXPRESSION_PAGE_SIZE } from "@/lib/pagination-constants";
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

type SearchApiResponse = {
  items: Expression[];
  totalCount: number;
  page: number;
  pageSize: number;
};

type ExpressionStockListProps = {
  // serverMode=falseのときは全件配列（クライアント側で絞り込む）。
  // serverMode=trueのときは初回SSRで取得した1ページ目のみ（以降はAPI経由で取得）。
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
  // trueのとき、絞り込み・ページ送りをサーバー側検索API（/api/expressions/search）に委ねる。
  // カタログ全体を検索する/vocabulary, /libraryで使用。/mylistのような
  // 「渡された配列だけを絞り込む」用途ではfalse（デフォルト）のまま使う。
  serverMode?: boolean;
  // serverMode時、絞り込みなしでの公開件数（DB全体の総数）。空状態メッセージの出し分けに使う。
  initialTotalCount?: number;
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
  serverMode = false,
  initialTotalCount,
}: ExpressionStockListProps) {
  const savedIdSet = useMemo(() => new Set(savedExpressionIds), [savedExpressionIds]);
  const showAds = plan === "free";
  // シーン・機能タグの絞り込みはPro限定。Freeプランで指定された場合は適用せず、アップセル表示に回す。
  const sceneTagGated = plan === "free";
  const intentTagGated = plan === "free";
  const initialSceneTagBlocked = sceneTagGated && initialSceneTag !== "すべて";
  const initialIntentTagBlocked = intentTagGated && initialIntentTag !== "すべて";

  const [keyword, setKeywordRaw] = useState("");
  const [sceneTag, setSceneTagRaw] = useState<SceneTagFilter>(
    initialSceneTagBlocked ? "すべて" : initialSceneTag
  );
  const [formality, setFormalityRaw] = useState<FormalityFilter>("すべて");
  const [level, setLevelRaw] = useState<LevelFilter>("すべて");
  const [intentTag, setIntentTagRaw] = useState<IntentTagFilter>(
    initialIntentTagBlocked ? "すべて" : initialIntentTag
  );
  const [examTag, setExamTagRaw] = useState<ExamTagFilter>(initialExamTag);
  const [page, setPage] = useState(1);

  // 絞り込み条件を変更したときはページを1に戻す（サーバーモードのみ意味を持つ）。
  function setKeyword(value: string) {
    setKeywordRaw(value);
    if (serverMode) setPage(1);
  }
  function setSceneTag(value: SceneTagFilter) {
    setSceneTagRaw(value);
    if (serverMode) setPage(1);
  }
  function setFormality(value: FormalityFilter) {
    setFormalityRaw(value);
    if (serverMode) setPage(1);
  }
  function setLevel(value: LevelFilter) {
    setLevelRaw(value);
    if (serverMode) setPage(1);
  }
  function setIntentTag(value: IntentTagFilter) {
    setIntentTagRaw(value);
    if (serverMode) setPage(1);
  }
  function setExamTag(value: ExamTagFilter) {
    setExamTagRaw(value);
    if (serverMode) setPage(1);
  }

  const debouncedKeyword = useDebouncedValue(keyword, 350);

  // --- サーバーモード: API経由の検索・ページネーション ---
  const [serverItems, setServerItems] = useState(expressions);
  const [serverTotalCount, setServerTotalCount] = useState(initialTotalCount ?? expressions.length);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const didMountRef = useRef(false);

  useEffect(() => {
    if (!serverMode) return;
    // 初回はSSRで取得済みのデータ（現在のfilter初期値と一致する1ページ目）をそのまま使う。
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setFetchError(false);

    const params = new URLSearchParams();
    if (debouncedKeyword.trim()) params.set("keyword", debouncedKeyword.trim());
    if (sceneTag !== "すべて") params.set("scene", sceneTag);
    if (formality !== "すべて") params.set("formality", formality);
    if (level !== "すべて") params.set("level", level);
    if (intentTag !== "すべて") params.set("intent", intentTag);
    if (examTag !== "すべて") params.set("exam", examTag);
    params.set("page", String(page));

    fetch(`/api/expressions/search?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("表現検索に失敗しました");
        return res.json() as Promise<SearchApiResponse>;
      })
      .then((data) => {
        if (cancelled) return;
        setServerItems(data.items);
        setServerTotalCount(data.totalCount);
      })
      .catch(() => {
        if (!cancelled) setFetchError(true);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverMode, debouncedKeyword, sceneTag, formality, level, intentTag, examTag, page]);

  // --- 静的モード（/mylist等）: 渡された配列をそのままクライアント側で絞り込む ---
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

  const displayedItems = serverMode ? serverItems : filteredExpressions;
  const displayedCount = serverMode ? serverTotalCount : filteredExpressions.length;
  const catalogEmpty = serverMode ? (initialTotalCount ?? 0) === 0 : expressions.length === 0;

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

      {fetchError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-700">
          検索に失敗しました。時間をおいて再度お試しください。
        </div>
      )}

      <div>
        <p className="mb-4 text-sm text-zinc-500">{displayedCount} 件の表現</p>

        {displayedItems.length > 0 ? (
          <div
            className={
              isLoading
                ? "grid grid-cols-1 gap-5 opacity-60 transition-opacity md:grid-cols-2 xl:grid-cols-3"
                : "grid grid-cols-1 gap-5 transition-opacity md:grid-cols-2 xl:grid-cols-3"
            }
          >
            {displayedItems.map((expression, index) => (
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
              {catalogEmpty ? emptyMessage : "条件に一致する表現が見つかりませんでした。"}
            </p>
          </div>
        )}

        {serverMode && (
          <div className="mt-6">
            <Pagination
              page={page}
              pageSize={EXPRESSION_PAGE_SIZE}
              totalCount={serverTotalCount}
              onPageChange={setPage}
              isLoading={isLoading}
            />
          </div>
        )}
      </div>
    </div>
  );
}
