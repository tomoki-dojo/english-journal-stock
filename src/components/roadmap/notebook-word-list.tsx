"use client";

import { useCallback, useEffect, useState } from "react";
import { Flag } from "lucide-react";
import { DIFFICULTY_STYLE, NOTEBOOK_DIFFICULTIES_UI } from "./notebook-levels";

type Status = "mastered" | "weak" | "learning" | "unseen";
type Item = {
  id: string;
  word: string;
  pos: string | null;
  meaning: string;
  difficulty: number;
  status: Status;
  flagged: boolean;
  exampleEn: string | null;
  exampleJa: string | null;
  otherMeanings: string[];
  note: string | null;
};
type ListResponse = { items: Item[]; total: number; page: number; pageSize: number };

const STATUS_OPTIONS: { value: Status; label: string; className: string }[] = [
  { value: "weak", label: "苦手", className: "bg-red-100 text-red-600" },
  { value: "mastered", label: "覚えた", className: "bg-emerald-100 text-emerald-700" },
  { value: "learning", label: "学習中", className: "bg-sky-100 text-sky-700" },
  { value: "unseen", label: "未学習", className: "bg-zinc-100 text-zinc-500" },
];
const POS_OPTIONS = ["名詞", "動詞", "形容詞", "副詞", "その他"];

function Chip({
  active,
  onClick,
  children,
  danger = false,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  danger?: boolean;
}) {
  const style = danger
    ? active
      ? "border-red-500 bg-red-500 text-white"
      : "border-red-300 bg-red-50 text-red-600"
    : active
      ? "border-amber-500 bg-amber-500 text-white"
      : "border-zinc-300 bg-white text-zinc-600";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-bold transition-colors ${style}`}
    >
      {children}
    </button>
  );
}

export function NotebookWordList() {
  const [difficulty, setDifficulty] = useState<number | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [pos, setPos] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page) });
    if (difficulty) params.set("difficulty", String(difficulty));
    if (status) params.set("status", status);
    if (pos) params.set("pos", pos);
    try {
      const res = await fetch(`/api/roadmap/notebook/words?${params}`);
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "取得できませんでした");
        return;
      }
      setData(json as ListResponse);
    } catch {
      setError("取得できませんでした。時間を置いて再度お試しください。");
    } finally {
      setLoading(false);
    }
  }, [difficulty, status, pos, page]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleFlag(item: Item) {
    const next = !item.flagged;
    try {
      const res = await fetch("/api/roadmap/weak-words", {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wordId: item.id }),
      });
      if (res.status === 429) {
        setError("苦手登録は10語までです（Proで無制限）");
        return;
      }
      if (!res.ok) throw new Error("toggle failed");
      // 手動の入れ外しは、その場で状態に反映する（外したら元の状態に戻すため再取得する）
      await load();
    } catch {
      setError("更新できませんでした。時間を置いて再度お試しください。");
    }
  }

  function pick<T>(setter: (v: T | null) => void, current: T | null, value: T) {
    setter(current === value ? null : value);
    setPage(1);
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {NOTEBOOK_DIFFICULTIES_UI.map((d) => (
            <Chip key={d} active={difficulty === d} onClick={() => pick(setDifficulty, difficulty, d)}>
              難易度{d}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((s) => (
            <Chip
              key={s.value}
              active={status === s.value}
              danger={s.value === "weak"}
              onClick={() => pick(setStatus, status, s.value)}
            >
              {s.value === "weak" && <Flag className="h-3 w-3" />}
              {s.label}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {POS_OPTIONS.map((p) => (
            <Chip key={p} active={pos === p} onClick={() => pick(setPos, pos, p)}>
              {p}
            </Chip>
          ))}
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
      {data && <p className="text-xs font-semibold text-zinc-500">{data.total}語</p>}

      <div className={`overflow-hidden rounded-xl border border-zinc-200 bg-white ${loading ? "opacity-60" : ""}`}>
        <div className="grid grid-cols-[1fr_1.4fr_1fr] gap-x-3 border-b border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] font-bold text-zinc-400">
          <span>単語・意味</span>
          <span>例文</span>
          <span>補足</span>
        </div>
        {data?.items.map((item) => {
          const st = STATUS_OPTIONS.find((s) => s.value === item.status)!;
          const diff = DIFFICULTY_STYLE[item.difficulty as 1 | 2 | 3 | 4 | 5];
          return (
            <div
              key={item.id}
              className="grid grid-cols-[1fr_1.4fr_1fr] gap-x-3 border-b border-zinc-100 px-3 py-2.5 text-sm last:border-b-0"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-baseline gap-x-1.5">
                  <span className="text-base font-bold text-zinc-800">{item.word}</span>
                  {item.pos && <span className="text-[10px] text-zinc-400">{item.pos}</span>}
                </p>
                <p className="text-zinc-600">{item.meaning}</p>
                <p className="mt-1 flex gap-1">
                  <span className={`rounded-full border px-1.5 py-px text-[10px] font-bold ${diff.className}`}>{item.difficulty}</span>
                  <span className={`rounded-full px-1.5 py-px text-[10px] font-bold ${st.className}`}>{st.label}</span>
                  <button
                    type="button"
                    onClick={() => void toggleFlag(item)}
                    aria-label={item.flagged ? "苦手から外す" : "苦手に入れる"}
                    className={`rounded-full border px-1.5 py-px ${
                      item.flagged
                        ? "border-red-300 bg-red-50 text-red-600"
                        : "border-zinc-300 bg-white text-zinc-400 hover:text-red-600"
                    }`}
                  >
                    <Flag className="h-3 w-3" />
                  </button>
                </p>
              </div>
              <div className="min-w-0 text-zinc-600">
                {item.exampleEn && <p>{item.exampleEn}</p>}
                {item.exampleJa && <p className="text-zinc-400">{item.exampleJa}</p>}
              </div>
              <div className="min-w-0 text-xs text-zinc-500">
                {item.otherMeanings.length > 0 && <p>他の意味: {item.otherMeanings.join("、")}</p>}
                {item.note && <p className="mt-1">{item.note}</p>}
              </div>
            </div>
          );
        })}
      </div>

      {data && totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 text-sm">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage(page - 1)}
            className="rounded-full border border-zinc-300 px-4 py-1.5 font-bold text-zinc-600 disabled:opacity-40"
          >
            前へ
          </button>
          <span className="text-xs font-semibold text-zinc-500">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage(page + 1)}
            className="rounded-full border border-zinc-300 px-4 py-1.5 font-bold text-zinc-600 disabled:opacity-40"
          >
            次へ
          </button>
        </div>
      )}
    </div>
  );
}
