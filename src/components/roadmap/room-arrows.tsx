"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getRoomNeighbors, ROOMS, roomFromPathname, type RoomKey } from "@/lib/roadmap-rooms";

const USES_KEY = "roomArrowUses";
// 最初の数回だけ、タップのあとに矢印が大きくなってから移動する(「これで部屋が動く」と分かってもらう)。
const DEMO_COUNT = 3;
const DEMO_DELAY_MS = 1800;
const QUICK_DELAY_MS = 250;
const SWIPE_MIN_PX = 70;

function readUses(): number {
  try {
    return Number(window.localStorage.getItem(USES_KEY)) || 0;
  } catch {
    return 0;
  }
}

function writeUses(n: number) {
  try {
    window.localStorage.setItem(USES_KEY, String(n));
  } catch {
    // 覚えられなくても動作に影響しない
  }
}

function insideFixedElement(el: Element | null): boolean {
  let node: Element | null = el;
  while (node && node !== document.body) {
    if (getComputedStyle(node).position === "fixed") return true;
    node = node.parentElement;
  }
  return false;
}

// 部屋(飼育部屋・棚の部屋・リスニングの部屋)を行き来する、画面の左右の矢印。
// 呼吸するように動いて気づかせる。PCはマウスを乗せると大きくなって行き先が出る。
// スマホは最初の数回だけ、タップのあとに同じ動きを見せてから移動し、慣れたらすぐ移動する。スワイプでも移動できる。
export function RoomArrows({ listeningUnlocked = false }: { listeningUnlocked?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const current = roomFromPathname(pathname);
  const [goingSide, setGoingSide] = useState<"left" | "right" | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const neighbors = current ? getRoomNeighbors(current, listeningUnlocked) : { left: null, right: null };
  const neighborsRef = useRef(neighbors);
  neighborsRef.current = neighbors;
  const busyRef = useRef(false);

  useEffect(() => {
    // 部屋が変わったら(移動し終えたら)、動きの状態を戻す
    setGoingSide(null);
    busyRef.current = false;
  }, [pathname]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  const go = useCallback(
    (side: "left" | "right", target: RoomKey, instant: boolean) => {
      if (busyRef.current) return;
      busyRef.current = true;
      const href = ROOMS[target].href;
      router.prefetch(href);
      const uses = readUses();
      writeUses(uses + 1);
      const touch = window.matchMedia("(hover: none)").matches;
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      let delay = 0;
      if (!instant && touch && !reduced) delay = uses < DEMO_COUNT ? DEMO_DELAY_MS : QUICK_DELAY_MS;
      if (delay === 0) {
        router.push(href);
        return;
      }
      setGoingSide(side);
      timerRef.current = setTimeout(() => router.push(href), delay);
    },
    [router]
  );

  // スワイプ(指を左へ動かすと右の部屋、右へ動かすと左の部屋)。ポップアップや、横にスクロール・ドラッグする場所は除く。
  useEffect(() => {
    if (!current) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;
    const onStart = (e: TouchEvent) => {
      const target = e.target as Element | null;
      tracking =
        e.touches.length === 1 &&
        !target?.closest('[data-no-room-swipe], input, textarea, select, [role="dialog"]') &&
        !insideFixedElement(target);
      if (tracking) {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      if (Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 2) return;
      const { left, right } = neighborsRef.current;
      if (dx < 0 && right) go("right", right, true);
      if (dx > 0 && left) go("left", left, true);
    };
    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchend", onEnd);
    };
  }, [current, go]);

  if (!current) return null;

  const renderArrow = (side: "left" | "right", target: RoomKey | null) => {
    if (!target) return null;
    const active = goingSide === side;
    const Icon = side === "left" ? ChevronLeft : ChevronRight;
    // PCでは、読む幅(max-w-3xl)のすぐ外側に置く。狭い画面では画面の端。
    const edge = "max(6px, calc(50vw - 440px))";
    return (
      <div
        className="pointer-events-none fixed top-1/2 z-30 -translate-y-1/2"
        style={side === "left" ? { left: edge } : { right: edge }}
      >
        <button
          type="button"
          aria-label={ROOMS[target].toLabel}
          onClick={() => go(side, target, false)}
          className={`group pointer-events-auto relative flex items-center transition-transform duration-300 hover:scale-125 ${active ? "scale-125" : ""}`}
        >
          <span
            className={`flex h-10 w-10 items-center justify-center rounded-full border-2 border-amber-300 bg-white/85 text-amber-700 shadow-md sm:h-12 sm:w-12 ${side === "left" ? "animate-room-arrow-left" : "animate-room-arrow-right"}`}
          >
            <Icon className="h-6 w-6 sm:h-7 sm:w-7" strokeWidth={2.75} />
          </span>
          <span
            className={`pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-amber-700 px-3 py-1 text-xs font-black text-white shadow-md transition-opacity duration-200 ${side === "left" ? "left-full ml-2" : "right-full mr-2"} ${active ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}
          >
            {ROOMS[target].toLabel}
          </span>
        </button>
      </div>
    );
  };

  return (
    <>
      {renderArrow("left", neighbors.left)}
      {renderArrow("right", neighbors.right)}
    </>
  );
}
