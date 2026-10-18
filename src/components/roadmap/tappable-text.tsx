"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Flag, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Sense = { pos: string | null; meaning: string; others: string[]; note: string | null };
type Entry = {
  wordId: string;
  quizEnabled: boolean;
  flagged: boolean;
  word: string;
  lemma: string | null;
  derived?: boolean;
  senses: Sense[];
};
type LookupState = { status: "loading" } | { status: "done"; entry: Entry | null } | { status: "error" };
type Anchor = { left: number; width: number; arrowLeft: number; top?: number; bottom?: number };

// 同じ単語を何度もタップしても通信しないよう、モジュール内でキャッシュする（苦手の入れ外しも反映する）。
const cache = new Map<string, Entry | null>();

const TOKEN_RE = /([A-Za-z]+(?:['’-][A-Za-z]+)*)/;
const POPOVER_MAX_WIDTH = 288;
const MARGIN = 8;
// この高さ分の余白が単語の下に無ければ、吹き出しを上に出す。
const POPOVER_ESTIMATED_HEIGHT = 190;

// 英文の単語をタップすると、その単語のそばに吹き出しで単語ノートの意味を出す（Stage4/5のAI発言用）。
export function TappableText({
  text,
  accentColor,
  className,
}: {
  text: string;
  accentColor: string;
  className?: string;
}) {
  const [selected, setSelected] = useState<{ index: number; word: string } | null>(null);
  const [lookup, setLookup] = useState<LookupState | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  const [saving, setSaving] = useState(false);
  const [limitHit, setLimitHit] = useState(false);
  const currentIndex = useRef<number | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  function close() {
    currentIndex.current = null;
    setSelected(null);
    setLookup(null);
    setAnchor(null);
    setLimitHit(false);
  }

  // 吹き出しの外をタップ・スクロール・リサイズ・Escで閉じる。
  useEffect(() => {
    if (!selected) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (popoverRef.current?.contains(target)) return;
      if (target?.closest("[data-tap-word]")) return; // 別の単語のタップは、その単語側の処理に任せる
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
    // closeは毎回作り直されるが、中身はstateのセッターと ref だけなので依存に入れなくてよい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  const select = async (index: number, word: string, el: HTMLElement) => {
    if (selected?.index === index) {
      close();
      return;
    }
    // 単語の位置から、吹き出しの置き場所(画面からはみ出さない横位置、下か上か)を決める。
    const rect = el.getBoundingClientRect();
    const width = Math.min(POPOVER_MAX_WIDTH, window.innerWidth - MARGIN * 2);
    const center = rect.left + rect.width / 2;
    const left = Math.min(Math.max(center - width / 2, MARGIN), window.innerWidth - width - MARGIN);
    const placeAbove = rect.bottom + POPOVER_ESTIMATED_HEIGHT > window.innerHeight && rect.top > POPOVER_ESTIMATED_HEIGHT;
    setAnchor({
      left,
      width,
      arrowLeft: Math.min(Math.max(center - left, 16), width - 16),
      ...(placeAbove ? { bottom: window.innerHeight - rect.top + 8 } : { top: rect.bottom + 8 }),
    });

    currentIndex.current = index;
    setSelected({ index, word });
    const key = word.toLowerCase();
    if (cache.has(key)) {
      setLookup({ status: "done", entry: cache.get(key) ?? null });
      return;
    }
    setLookup({ status: "loading" });
    try {
      const res = await fetch(`/api/roadmap/word-lookup?w=${encodeURIComponent(word)}`);
      if (!res.ok) throw new Error("lookup failed");
      const json = (await res.json()) as { entry: Entry | null };
      cache.set(key, json.entry);
      // 取得中に別の単語へ切り替えられていたら、結果は捨てる
      if (currentIndex.current === index) setLookup({ status: "done", entry: json.entry });
    } catch {
      if (currentIndex.current === index) setLookup({ status: "error" });
    }
  };

  const toggleFlag = async (entry: Entry, cacheKey: string) => {
    if (saving) return;
    setSaving(true);
    const next = !entry.flagged;
    try {
      const res = await fetch("/api/roadmap/weak-words", {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ wordId: entry.wordId }),
      });
      if (res.status === 429) {
        setLimitHit(true);
        return;
      }
      if (!res.ok) throw new Error("toggle failed");
      setLimitHit(false);
      const updated = { ...entry, flagged: next };
      cache.set(cacheKey, updated);
      setLookup({ status: "done", entry: updated });
    } catch {
      setLookup({ status: "error" });
    } finally {
      setSaving(false);
    }
  };

  const parts = text.split(TOKEN_RE);

  return (
    <>
      <p className={className}>
        {parts.map((part, i) =>
          i % 2 === 1 ? (
            <span
              key={i}
              data-tap-word
              role="button"
              tabIndex={0}
              onClick={(e) => select(i, part, e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  select(i, part, e.currentTarget);
                }
              }}
              className={cn(
                "cursor-pointer rounded-sm transition-colors hover:bg-amber-100",
                selected?.index === i && "bg-amber-200"
              )}
            >
              {part}
            </span>
          ) : (
            part
          )
        )}
      </p>
      {selected &&
        lookup &&
        anchor &&
        createPortal(
          <div
            ref={popoverRef}
            className="fixed z-50 rounded-xl border-2 bg-white p-3 text-left text-sm font-normal text-zinc-800 shadow-xl"
            style={{
              borderColor: accentColor,
              left: anchor.left,
              width: anchor.width,
              top: anchor.top,
              bottom: anchor.bottom,
            }}
          >
            {/* 吹き出しのしっぽ(単語の方を指す)。下に出すときは上辺、上に出すときは下辺に付く */}
            <span
              aria-hidden
              className="absolute h-3 w-3 rotate-45 bg-white"
              style={{
                left: anchor.arrowLeft - 6,
                borderColor: accentColor,
                ...(anchor.top !== undefined
                  ? { top: -8, borderTopWidth: 2, borderLeftWidth: 2, borderStyle: "solid" }
                  : { bottom: -8, borderBottomWidth: 2, borderRightWidth: 2, borderStyle: "solid" }),
              }}
            />
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-zinc-900">
                {lookup.status === "done" && lookup.entry ? lookup.entry.word : selected.word}
                {lookup.status === "done" && lookup.entry?.lemma && (
                  <span className="ml-1.5 text-xs font-normal text-zinc-400">
                    {selected.word}
                    {lookup.entry.derived && "（派生）"}
                  </span>
                )}
              </p>
              <button
                type="button"
                onClick={close}
                aria-label="閉じる"
                className="shrink-0 rounded p-0.5 text-zinc-400 hover:text-zinc-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {lookup.status === "loading" && <p className="mt-1 text-xs text-zinc-400">...</p>}
            {lookup.status === "error" && <p className="mt-1 text-xs text-red-600">取得できませんでした</p>}
            {lookup.status === "done" && !lookup.entry && (
              <p className="mt-1 text-xs text-zinc-400">単語ノートに載っていません</p>
            )}
            {lookup.status === "done" &&
              lookup.entry?.senses.map((s, k) => (
                <div key={k} className="mt-1">
                  <p>
                    {s.pos && <span className="mr-1.5 text-[10px] text-zinc-400">{s.pos}</span>}
                    {s.meaning}
                  </p>
                  {s.others.length > 0 && <p className="text-xs text-zinc-500">他：{s.others.join("、")}</p>}
                  {s.note && <p className="text-xs text-zinc-500">{s.note}</p>}
                </div>
              ))}
            {lookup.status === "done" && lookup.entry && lookup.entry.quizEnabled && (
              <button
                type="button"
                disabled={saving}
                onClick={() => toggleFlag(lookup.entry as Entry, selected.word.toLowerCase())}
                className={cn(
                  "mt-2 inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold transition-colors disabled:opacity-50",
                  lookup.entry.flagged
                    ? "border-red-300 bg-red-50 text-red-600"
                    : "border-zinc-300 bg-white text-zinc-600 hover:border-red-300 hover:text-red-600"
                )}
              >
                <Flag className="h-3.5 w-3.5" />
                {lookup.entry.flagged ? "苦手に入れた" : "苦手に入れる"}
              </button>
            )}
            {limitHit && (
              <p className="mt-1.5 text-xs text-red-600">
                苦手登録は10語まで。<Link href="/roadmap/pro" className="font-bold underline">Proで無制限</Link>
              </p>
            )}
          </div>,
          document.body
        )}
    </>
  );
}
