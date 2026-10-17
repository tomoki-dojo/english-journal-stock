"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { AdUnit } from "@/components/ads/ad-unit";
import {
  AD_BREAK_MIN_INTERVAL_MS,
  AD_BREAK_PATHS,
  AD_BREAK_SLOT,
  AD_BREAK_STORAGE_KEY,
} from "@/lib/roadmap-ad-break";

type AdBreakContextValue = {
  // 区切りのいい場面で呼ぶ。前回から一定時間たっていれば広告枠を出す。
  notifyBreak: () => void;
};

const AdBreakContext = createContext<AdBreakContextValue>({ notifyBreak: () => {} });

export function useRoadmapAdBreak() {
  return useContext(AdBreakContext);
}

function readLastAt(): number | null {
  try {
    const v = window.localStorage.getItem(AD_BREAK_STORAGE_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

function writeLastAt(t: number) {
  try {
    window.localStorage.setItem(AD_BREAK_STORAGE_KEY, String(t));
  } catch {
    // 保存できない環境では、このタブの間だけ覚えておく
  }
}

export function RoadmapAdBreakProvider({
  enabled,
  children,
}: {
  enabled: boolean;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const lastAtRef = useRef<number | null>(null);
  const prevPathRef = useRef<string | null>(null);
  const [showKey, setShowKey] = useState<number | null>(null);

  // 遊び始めの時刻を起点にする（開いた直後には出さない）。前回の記録が間隔内ならそれを引き継ぐ。
  useEffect(() => {
    if (!enabled) return;
    const saved = readLastAt();
    const now = Date.now();
    const start = saved && now - saved < AD_BREAK_MIN_INTERVAL_MS ? saved : now;
    lastAtRef.current = start;
    writeLastAt(start);
  }, [enabled]);

  const notifyBreak = useCallback(() => {
    if (!enabled || lastAtRef.current === null) return;
    const now = Date.now();
    if (now - lastAtRef.current < AD_BREAK_MIN_INTERVAL_MS) return;
    lastAtRef.current = now;
    writeLastAt(now);
    setShowKey(now);
  }, [enabled]);

  // 練習などの画面から、部屋・棚・図鑑に戻ってきたときを区切りとみなす
  useEffect(() => {
    const prev = prevPathRef.current;
    prevPathRef.current = pathname;
    if (prev === null || prev === pathname) return;
    if (AD_BREAK_PATHS.has(pathname) && !AD_BREAK_PATHS.has(prev)) notifyBreak();
  }, [pathname, notifyBreak]);

  // 練習画面へ移ったら閉じる
  useEffect(() => {
    if (!AD_BREAK_PATHS.has(pathname)) setShowKey(null);
  }, [pathname]);

  return (
    <AdBreakContext.Provider value={{ notifyBreak }}>
      {enabled && showKey !== null && AD_BREAK_PATHS.has(pathname) && (
        <div className="relative mb-6 rounded-2xl border border-amber-100 bg-white/80 p-3 pt-7 shadow-sm">
          <span className="absolute left-3 top-2 text-[10px] font-medium tracking-wide text-zinc-400">広告</span>
          <button
            type="button"
            onClick={() => setShowKey(null)}
            aria-label="閉じる"
            className="absolute right-2 top-1.5 rounded-full p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            <X className="h-4 w-4" />
          </button>
          <AdUnit key={showKey} slot={AD_BREAK_SLOT} />
        </div>
      )}
      {children}
    </AdBreakContext.Provider>
  );
}
