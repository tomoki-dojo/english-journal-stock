"use client";

import { Search } from "lucide-react";
import { VocabLevelValues, type VocabLevelFilter } from "./types";

const levelOptions: VocabLevelFilter[] = ["すべて", ...VocabLevelValues];

type VocabularyFiltersProps = {
  keyword: string;
  level: VocabLevelFilter;
  onKeywordChange: (value: string) => void;
  onLevelChange: (value: VocabLevelFilter) => void;
};

// 単語帳の絞り込みパネル。検索・レベル絞り込みはどちらもFreeで使える
// （表現一覧と同じ方針: Pro限定は「機能」であって「閲覧・検索」ではない）。
export function VocabularyFilters({
  keyword,
  level,
  onKeywordChange,
  onLevelChange,
}: VocabularyFiltersProps) {
  return (
    <section className="space-y-5 rounded-xl border border-zinc-200 bg-zinc-100/50 p-5 md:p-6">
      <div>
        <label htmlFor="vocabulary-search" className="sr-only">
          キーワード検索
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            id="vocabulary-search"
            type="search"
            value={keyword}
            onChange={(event) => onKeywordChange(event.target.value)}
            placeholder="leverage, 利益率 などで検索..."
            className="w-full rounded-xl border border-zinc-400 bg-zinc-300/60 py-2.5 pl-10 pr-4 text-sm text-zinc-900 placeholder:text-zinc-500 transition-colors focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">レベル</p>
        <select
          value={level}
          onChange={(event) => onLevelChange(event.target.value as VocabLevelFilter)}
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
