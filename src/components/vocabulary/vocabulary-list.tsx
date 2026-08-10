"use client";

import { useMemo, useState } from "react";
import { VocabularyCard } from "./vocabulary-card";
import { VocabularyFilters } from "./vocabulary-filters";
import type { Vocabulary, VocabLevelFilter } from "./types";
import type { Plan } from "@/lib/plan";

type VocabularyListProps = {
  vocabulary: Vocabulary[];
  loadError?: boolean;
  plan: Plan;
  learningVocabularyIds?: string[];
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
  learningVocabularyIds = [],
}: VocabularyListProps) {
  const learningIdSet = useMemo(() => new Set(learningVocabularyIds), [learningVocabularyIds]);
  const [keyword, setKeyword] = useState("");
  const [level, setLevel] = useState<VocabLevelFilter>("すべて");

  const filtered = useMemo(() => {
    return vocabulary.filter((vocab) => {
      const keywordMatch = matchesKeyword(vocab, keyword);
      const levelMatch = level === "すべて" || vocab.level === level;
      return keywordMatch && levelMatch;
    });
  }, [vocabulary, keyword, level]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">単語帳</h1>
        <p className="mt-2 text-sm text-zinc-500">
          ビジネスでよく使う英単語をキーワード・レベルで絞り込んで探せます。学習リストに追加すると、間隔反復で復習できます（Pro限定）。
        </p>
      </div>

      <VocabularyFilters
        keyword={keyword}
        level={level}
        onKeywordChange={setKeyword}
        onLevelChange={setLevel}
      />

      {loadError && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-6 py-4 text-sm text-red-700">
          単語一覧の取得に失敗しました。時間をおいて再度お試しください。
        </div>
      )}

      <div>
        <p className="mb-4 text-sm text-zinc-500">{filtered.length} 件の単語</p>

        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((vocab) => (
              <VocabularyCard
                key={vocab.id}
                vocabulary={vocab}
                plan={plan}
                initialAdded={learningIdSet.has(vocab.id)}
              />
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-100/30 px-6 py-16 text-center">
            <p className="text-sm text-zinc-500">
              {vocabulary.length === 0
                ? "まだ公開中の単語がありません。準備が整い次第、順次公開されます。"
                : "条件に一致する単語が見つかりませんでした。"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
