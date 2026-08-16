"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { VocabularyCard } from "./vocabulary-card";
import { VocabularyFilters } from "./vocabulary-filters";
import { Pagination } from "@/components/ui/pagination";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { VOCABULARY_PAGE_SIZE } from "@/lib/pagination-constants";
import type { Vocabulary, VocabLevelFilter, ExamTagFilter } from "./types";
import type { Plan } from "@/lib/plan";

type SearchApiResponse = {
  items: Vocabulary[];
  totalCount: number;
  page: number;
  pageSize: number;
};

type VocabularyListProps = {
  // serverMode=falseのときは全件配列（クライアント側で絞り込む）。
  // serverMode=trueのときは初回SSRで取得した1ページ目のみ（以降はAPI経由で取得）。
  vocabulary: Vocabulary[];
  loadError?: boolean;
  plan: Plan;
  loggedIn?: boolean;
  savedVocabularyIds?: string[];
  learningVocabularyIds?: string[];
  title?: string;
  description?: string;
  emptyMessage?: string;
  // 外部リンク（例: ホームのTOEIC導線）からあらかじめ選択しておく資格試験タグ。
  initialExamTag?: ExamTagFilter;
  // trueのとき、絞り込み・ページ送りをサーバー側検索API（/api/vocabulary/search）に委ねる。
  // カタログ全体を検索する/vocabulary, /libraryで使用。/mylistのような
  // 「渡された配列だけを絞り込む」用途ではfalse（デフォルト）のまま使う。
  serverMode?: boolean;
  // serverMode時、絞り込みなしでの公開件数（DB全体の総数）。「まだ公開中の単語がありません」
  // のような空状態メッセージの出し分けに使う。
  initialTotalCount?: number;
};

function matchesKeyword(vocab: Vocabulary, keyword: string) {
  const needle = keyword.trim().toLowerCase();
  if (needle === "") return true;

  const haystack = [
    vocab.wordEn,
    vocab.meaningJa,
    vocab.exampleEn,
    vocab.exampleJa,
    ...(vocab.synonyms ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(needle);
}

export function VocabularyList({
  vocabulary,
  loadError = false,
  plan,
  loggedIn = true,
  savedVocabularyIds = [],
  learningVocabularyIds = [],
  title = "単語帳",
  description = "ビジネスでよく使う英単語をキーワード・レベル・資格試験タグで絞り込んで探せます。保存するとマイリストから復習でき、「学習を始める」で効率よく復習できるようになります（Pro限定）。",
  emptyMessage,
  initialExamTag = "すべて",
  serverMode = false,
  initialTotalCount,
}: VocabularyListProps) {
  const savedIdSet = useMemo(() => new Set(savedVocabularyIds), [savedVocabularyIds]);
  const learningIdSet = useMemo(() => new Set(learningVocabularyIds), [learningVocabularyIds]);
  const [keyword, setKeywordRaw] = useState("");
  const [level, setLevelRaw] = useState<VocabLevelFilter>("すべて");
  const [examTag, setExamTagRaw] = useState<ExamTagFilter>(initialExamTag);
  const [page, setPage] = useState(1);

  // 絞り込み条件を変更したときはページを1に戻す（サーバーモードのみ意味を持つ）。
  function setKeyword(value: string) {
    setKeywordRaw(value);
    if (serverMode) setPage(1);
  }
  function setLevel(value: VocabLevelFilter) {
    setLevelRaw(value);
    if (serverMode) setPage(1);
  }
  function setExamTag(value: ExamTagFilter) {
    setExamTagRaw(value);
    if (serverMode) setPage(1);
  }

  const debouncedKeyword = useDebouncedValue(keyword, 350);

  // --- サーバーモード: API経由の検索・ページネーション ---
  const [serverItems, setServerItems] = useState(vocabulary);
  const [serverTotalCount, setServerTotalCount] = useState(initialTotalCount ?? vocabulary.length);
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
    if (level !== "すべて") params.set("level", level);
    if (examTag !== "すべて") params.set("exam", examTag);
    params.set("page", String(page));

    fetch(`/api/vocabulary/search?${params.toString()}`)
      .then((res) => {
        if (!res.ok) throw new Error("単語検索に失敗しました");
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
  }, [serverMode, debouncedKeyword, level, examTag, page]);

  // --- 静的モード（/mylist等）: 渡された配列をそのままクライアント側で絞り込む ---
  const filtered = useMemo(() => {
    return vocabulary.filter((vocab) => {
      const keywordMatch = matchesKeyword(vocab, keyword);
      const levelMatch = level === "すべて" || vocab.level === level;
      const examTagMatch = examTag === "すべて" || (vocab.examTags?.includes(examTag) ?? false);
      return keywordMatch && levelMatch && examTagMatch;
    });
  }, [vocabulary, keyword, level, examTag]);

  const displayedItems = serverMode ? serverItems : filtered;
  const displayedCount = serverMode ? serverTotalCount : filtered.length;
  const catalogEmpty = serverMode ? (initialTotalCount ?? 0) === 0 : vocabulary.length === 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
        <p className="mt-2 text-sm text-zinc-500">{description}</p>
      </div>

      <VocabularyFilters
        keyword={keyword}
        level={level}
        examTag={examTag}
        onKeywordChange={setKeyword}
        onLevelChange={setLevel}
        onExamTagChange={setExamTag}
      />

      {loadError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-700">
          単語一覧の取得に失敗しました。時間をおいて再度お試しください。
        </div>
      )}

      {fetchError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-700">
          検索に失敗しました。時間をおいて再度お試しください。
        </div>
      )}

      <div>
        <p className="mb-4 text-sm text-zinc-500">{displayedCount} 件の単語</p>

        {displayedItems.length > 0 ? (
          <div
            className={
              isLoading
                ? "grid grid-cols-1 gap-5 opacity-60 transition-opacity md:grid-cols-2 xl:grid-cols-3"
                : "grid grid-cols-1 gap-5 transition-opacity md:grid-cols-2 xl:grid-cols-3"
            }
          >
            {displayedItems.map((vocab) => (
              <VocabularyCard
                key={vocab.id}
                vocabulary={vocab}
                plan={plan}
                loggedIn={loggedIn}
                initialSaved={savedIdSet.has(vocab.id)}
                initialAdded={learningIdSet.has(vocab.id)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-100/30 px-6 py-16 text-center">
            <p className="text-sm text-zinc-500">
              {catalogEmpty
                ? (emptyMessage ?? "まだ公開中の単語がありません。準備が整い次第、順次公開されます。")
                : "条件に一致する単語が見つかりませんでした。"}
            </p>
          </div>
        )}

        {serverMode && (
          <div className="mt-6">
            <Pagination
              page={page}
              pageSize={VOCABULARY_PAGE_SIZE}
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
