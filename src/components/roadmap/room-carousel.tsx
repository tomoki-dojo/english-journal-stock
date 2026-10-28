"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getRoomNeighbors, ROOMS, roomFromPathname, type RoomKey } from "@/lib/roadmap-rooms";

const USES_KEY = "roomArrowUses";
// 最初の数回だけ、タップのあとに矢印が大きくなってから移動する(「これで部屋が動く」と分かってもらう)。
const DEMO_COUNT = 3;
const DEMO_DELAY_MS = 1800;
const SWIPE_MIN_PX = 70;
const SLIDE_MS = 240;
// 行き先が無い向きは、少しだけ動いて止まる。
const FOLLOW_RATIO_BLOCKED = 0.15;

const RING: RoomKey[] = ["room", "shelf", "listening"];

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

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// 表示中の部屋の中だけで出す(お知らせなど、その部屋に入ったときに出したいもの用)。
export function RoomPaneGate({ room, children }: { room: RoomKey; children: ReactNode }) {
  const pathname = usePathname();
  return roomFromPathname(pathname) === room ? <>{children}</> : null;
}

// 部屋(飼育部屋・棚の部屋・リスニングの部屋)を、横に並べて持つ。
// 今の部屋だけ表示し、隣の部屋は見えない位置に置いてある(中身は読み込み済み)。
// スワイプすると、指に合わせて今の部屋と隣の部屋が一緒に動く。一定以上動かして離すと隣の部屋に移る。
// 左右の矢印も同じ動きで移る。移ったあとにURLだけ書き換える(部屋は読み込み直さない)。
export function RoomCarousel({
  panes,
  listeningUnlocked = false,
  showArrows = true,
}: {
  panes: Partial<Record<RoomKey, ReactNode>>;
  listeningUnlocked?: boolean;
  showArrows?: boolean;
}) {
  const pathname = usePathname();
  const current = roomFromPathname(pathname) ?? "room";
  const [goingSide, setGoingSide] = useState<"left" | "right" | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);
  const paneRefs = useRef<Partial<Record<RoomKey, HTMLDivElement | null>>>({});

  const raw = getRoomNeighbors(current, listeningUnlocked);
  const neighbors = {
    left: raw.left && panes[raw.left] ? raw.left : null,
    right: raw.right && panes[raw.right] ? raw.right : null,
  };
  const neighborsRef = useRef(neighbors);
  neighborsRef.current = neighbors;
  const currentRef = useRef(current);
  currentRef.current = current;

  const resetPanes = useCallback(() => {
    for (const key of RING) {
      const el = paneRefs.current[key];
      if (!el) continue;
      el.style.transition = "";
      el.style.transform = "";
      el.style.visibility = "";
    }
  }, []);

  // 部屋が切り替わったとき(URLが変わったとき): 動きの途中の見た目を戻す。
  useLayoutEffect(() => {
    busyRef.current = false;
    setGoingSide(null);
    resetPanes();
  }, [pathname, resetPanes]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    []
  );

  // 隣の部屋を、今の部屋の隣に置く(offset: 今の部屋の動いた量。負なら左へ)。
  const placeNeighbor = useCallback((side: "left" | "right", offset: number, transition: string) => {
    const target = side === "right" ? neighborsRef.current.right : neighborsRef.current.left;
    const el = target ? paneRefs.current[target] : null;
    if (!el) return;
    el.style.visibility = "visible";
    el.style.transition = transition;
    el.style.transform = `translateX(calc(${side === "right" ? "100%" : "-100%"} + ${offset}px))`;
  }, []);

  const moveCurrent = useCallback((offset: string, transition: string) => {
    const el = paneRefs.current[currentRef.current];
    if (!el) return;
    el.style.transition = transition;
    el.style.transform = `translateX(${offset})`;
  }, []);

  // 隣の部屋へ移る(今の部屋が横へ出て、隣の部屋が入る)。終わったらURLを書き換える。
  const slideTo = useCallback(
    (side: "left" | "right", target: RoomKey) => {
      const href = ROOMS[target].href;
      const finish = () => {
        window.scrollTo(0, 0);
        window.history.pushState(null, "", href);
      };
      if (prefersReducedMotion()) {
        finish();
        return;
      }
      const anim = `transform ${SLIDE_MS}ms ease-in-out`;
      const destEl = paneRefs.current[target];
      // 指を離した位置から続ける(矢印のときは、隣の部屋が画面の外にある状態から)
      if (destEl && destEl.style.visibility !== "visible") placeNeighbor(side, 0, "none");
      void destEl?.offsetWidth;
      moveCurrent(side === "right" ? "-100%" : "100%", anim);
      if (destEl) {
        destEl.style.transition = anim;
        destEl.style.transform = "translateX(0)";
      }
      timerRef.current = setTimeout(finish, SLIDE_MS + 20);
    },
    [moveCurrent, placeNeighbor]
  );

  const go = useCallback(
    (side: "left" | "right", target: RoomKey, demo: boolean) => {
      if (busyRef.current) return;
      busyRef.current = true;
      const uses = readUses();
      writeUses(uses + 1);
      const touch = window.matchMedia("(hover: none)").matches;
      // タップの最初の数回だけ、矢印が大きくなって行き先が出てから移動する
      if (demo && touch && !prefersReducedMotion() && uses < DEMO_COUNT) {
        setGoingSide(side);
        timerRef.current = setTimeout(() => slideTo(side, target), DEMO_DELAY_MS);
        return;
      }
      slideTo(side, target);
    },
    [slideTo]
  );

  // スワイプ(指を左へ動かすと右の部屋、右へ動かすと左の部屋)。ポップアップや、ドラッグする場所は除く。
  // 横にスライドする場所(data-room-swipe-edge。棚のスライドなど)は、端まで来たあとさらに同じ向きに
  // スワイプしたときだけ、部屋を動かす(スライド自体の動きとは被らない)。
  useEffect(() => {
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let following = false;
    let side: "left" | "right" | null = null;
    let edgeEl: HTMLElement | null = null;
    let atStart = false;
    let atEnd = false;
    const isAtStart = (el: HTMLElement) => el.scrollLeft <= 1;
    const isAtEnd = (el: HTMLElement) => el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;

    const directionAllowed = (dx: number) => {
      if (!edgeEl) return true;
      return (atStart && dx > 0 && isAtStart(edgeEl)) || (atEnd && dx < 0 && isAtEnd(edgeEl));
    };

    const hideNeighbors = () => {
      for (const key of RING) {
        if (key === currentRef.current) continue;
        const el = paneRefs.current[key];
        if (el) {
          el.style.transition = "";
          el.style.transform = "";
          el.style.visibility = "";
        }
      }
    };

    const springBack = () => {
      const anim = `transform ${SLIDE_MS}ms ease-out`;
      moveCurrent("0px", anim);
      if (side) placeNeighbor(side, 0, anim);
      window.setTimeout(() => {
        if (!busyRef.current) resetPanes();
      }, SLIDE_MS + 40);
    };

    const onStart = (e: TouchEvent) => {
      const target = e.target as Element | null;
      tracking =
        e.touches.length === 1 &&
        !busyRef.current &&
        !target?.closest('[data-no-room-swipe], input, textarea, select, [role="dialog"]') &&
        !insideFixedElement(target);
      following = false;
      side = null;
      edgeEl = null;
      if (!tracking) return;
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      edgeEl = (target?.closest("[data-room-swipe-edge]") as HTMLElement | null) ?? null;
      if (edgeEl) {
        atStart = isAtStart(edgeEl);
        atEnd = isAtEnd(edgeEl);
        // 途中のページでは、スライドの動きだけ(部屋は動かさない)
        if (!atStart && !atEnd) tracking = false;
      }
    };

    const onMove = (e: TouchEvent) => {
      if (!tracking || prefersReducedMotion()) return;
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!following) {
        if (Math.abs(dx) < 12) return;
        if (Math.abs(dx) < Math.abs(dy) * 1.5 || !directionAllowed(dx)) {
          tracking = false;
          return;
        }
        following = true;
      }
      const nextSide = dx < 0 ? "right" : "left";
      if (side && side !== nextSide) hideNeighbors();
      side = nextSide;
      const hasNeighbor = Boolean(nextSide === "right" ? neighborsRef.current.right : neighborsRef.current.left);
      // 行き先がある向きは、指と同じだけ動かして隣の部屋を見せる。無い向きは少しだけ。
      const t = dx * (hasNeighbor ? 1 : FOLLOW_RATIO_BLOCKED);
      moveCurrent(`${t}px`, "none");
      if (hasNeighbor) placeNeighbor(nextSide, t, "none");
    };

    const onEnd = (e: TouchEvent) => {
      const wasFollowing = following;
      const wasTracking = tracking;
      tracking = false;
      following = false;
      if (!wasTracking) return;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      const { left, right } = neighborsRef.current;
      const target = dx < 0 ? right : left;
      const committed =
        Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) >= Math.abs(dy) * 2 && directionAllowed(dx) && Boolean(target);
      if (committed && target) {
        busyRef.current = true;
        slideTo(dx < 0 ? "right" : "left", target);
        return;
      }
      if (wasFollowing) springBack();
    };

    const onCancel = () => {
      const wasFollowing = following;
      tracking = false;
      following = false;
      if (wasFollowing) springBack();
    };

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onCancel, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onCancel);
    };
  }, [moveCurrent, placeNeighbor, resetPanes, slideTo]);

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
          onClick={() => go(side, target, true)}
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
    <div className="relative overflow-x-clip">
      {RING.map((key) => {
        const content = panes[key];
        if (!content) return null;
        const isCurrent = key === current;
        return (
          <div
            key={key}
            ref={(el) => {
              paneRefs.current[key] = el;
            }}
            aria-hidden={isCurrent ? undefined : true}
            // 今の部屋以外は、見えない位置に置いておく(幅は同じなので、読み込みと配置は済んでいる)
            className={isCurrent ? "relative" : "pointer-events-none invisible absolute inset-x-0 top-0"}
          >
            {content}
          </div>
        );
      })}
      {showArrows && renderArrow("left", neighbors.left)}
      {showArrows && renderArrow("right", neighbors.right)}
    </div>
  );
}
