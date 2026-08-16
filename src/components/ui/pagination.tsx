"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type PaginationProps = {
  page: number;
  pageSize: number;
  totalCount: number;
  onPageChange: (page: number) => void;
  isLoading?: boolean;
};

// サーバー側ページネーション用の共通コントロール。件数がpageSize以下なら何も表示しない。
export function Pagination({ page, pageSize, totalCount, onPageChange, isLoading = false }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  if (totalPages <= 1) return null;

  const canPrev = page > 1 && !isLoading;
  const canNext = page < totalPages && !isLoading;

  return (
    <div className="flex items-center justify-center gap-3 pt-2">
      <button
        type="button"
        onClick={() => canPrev && onPageChange(page - 1)}
        disabled={!canPrev}
        className={cn(
          "flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition-colors",
          canPrev
            ? "text-zinc-700 hover:border-zinc-400 hover:bg-zinc-100"
            : "cursor-not-allowed text-zinc-300"
        )}
      >
        <ChevronLeft className="h-4 w-4" />
        前へ
      </button>
      <span className="text-sm text-zinc-500">
        {page} / {totalPages}ページ
      </span>
      <button
        type="button"
        onClick={() => canNext && onPageChange(page + 1)}
        disabled={!canNext}
        className={cn(
          "flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition-colors",
          canNext
            ? "text-zinc-700 hover:border-zinc-400 hover:bg-zinc-100"
            : "cursor-not-allowed text-zinc-300"
        )}
      >
        次へ
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
