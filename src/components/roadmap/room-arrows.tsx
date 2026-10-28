"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getRoomNeighbors, ROOMS, roomFromPathname, type RoomKey } from "@/lib/roadmap-rooms";

const USES_KEY = "roomArrowUses";
// 最初の数回だけ、タップのあとに矢印が大きくなってから移動する(「これで部屋が動く」と分かってもらう)。
const DEMO_COUNT = 3;
const DEMO_DELAY_MS = 1800;
const SWIPE_MIN_PX = 70;
// 部屋の移動: 今の部屋が横へ出ていき、次の部屋が反対側から入ってくる。
const SLIDE_OUT_MS = 180;
const SLIDE_IN_MS = 240;
// 指に追従する量(ゴムのように重く動かす)。移動先が無い向きは、もっと小さく。
const FOLLOW_RATIO = 0.55;
const FOLLOW_RATIO_BLOCKED = 0.15;
const SLIDE_ID = "room-slide";

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

function slideEl(): HTMLElement | null {
  return document.getElementById(SLIDE_ID);
}

function clearSlideStyle(el: HTMLElement | null) {
  if (!el) return;
  el.style.transition = "";
  el.style.transform = "";
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// 部屋(飼育部屋・棚の部屋・リスニングの部屋)を行き来する、画面の左右の矢印とスワイプ。
// 矢印は呼吸するように動いて気づかせる。PCはマウスを乗せると大きくなって行き先が出る。
// スマホは最初の数回だけ、タップのあとに同じ動きを見せてから移動する。
// スワイプは、指に合わせて今の部屋が動き、端に行き先の名前がのぞく。離すと、今の部屋が出ていき、次の部屋が反対側から入ってくる。
export function RoomArrows({ listeningUnlocked = false }: { listeningUnlocked?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const current = roomFromPathname(pathname);
  const [goingSide, setGoingSide] = useState<"left" | "right" | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const neighbors = current ? getRoomNeighbors(current, listeningUnlocked) : { left: null, right: null };
  const neighborsRef = useRef(neighbors);
  neighborsRef.current = neighbors;
  const busyRef = useRef(false);
  // 移動の向き。次の部屋は、その反対側から入ってくる。
  const pendingEnterRef = useRef<"left" | "right" | null>(null);
  const peekLeftRef = useRef<HTMLDivElement>(null);
  const peekRightRef = useRef<HTMLDivElement>(null);

  // 部屋が切り替わったとき: 次の部屋を反対側から滑り込ませる(描画の前に開始位置へ置く)。
  useLayoutEffect(() => {
    const el = slideEl();
    if (safetyRef.current) clearTimeout(safetyRef.current);
    const dir = pendingEnterRef.current;
    pendingEnterRef.current = null;
    busyRef.current = false;
    setGoingSide(null);
    if (!el) return;
    if (!dir) {
      clearSlideStyle(el);
      return;
    }
    el.style.transition = "none";
    el.style.transform = `translateX(${dir === "right" ? "100%" : "-100%"})`;
    void el.offsetWidth;
    el.style.transition = `transform ${SLIDE_IN_MS}ms ease-out`;
    el.style.transform = "translateX(0)";
    const done = window.setTimeout(() => clearSlideStyle(el), SLIDE_IN_MS + 40);
    return () => window.clearTimeout(done);
  }, [pathname]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (safetyRef.current) clearTimeout(safetyRef.current);
    },
    []
  );

  // 今の部屋を横へ出して、移動する。
  const slideAndGo = useCallback(
    (side: "left" | "right", href: string) => {
      const el = slideEl();
      if (!el || prefersReducedMotion()) {
        router.push(href);
        return;
      }
      pendingEnterRef.current = side;
      el.style.transition = `transform ${SLIDE_OUT_MS}ms ease-in`;
      el.style.transform = `translateX(${side === "right" ? "-100%" : "100%"})`;
      window.setTimeout(() => router.push(href), SLIDE_OUT_MS);
      // 読み込みに失敗して部屋が変わらなかったときは、元に戻す
      safetyRef.current = setTimeout(() => {
        pendingEnterRef.current = null;
        busyRef.current = false;
        setGoingSide(null);
        const e = slideEl();
        if (e) {
          e.style.transition = `transform ${SLIDE_IN_MS}ms ease-out`;
          e.style.transform = "translateX(0)";
          window.setTimeout(() => clearSlideStyle(e), SLIDE_IN_MS + 40);
        }
      }, 5000);
    },
    [router]
  );

  const go = useCallback(
    (side: "left" | "right", target: RoomKey, demo: boolean) => {
      if (busyRef.current) return;
      busyRef.current = true;
      const href = ROOMS[target].href;
      router.prefetch(href);
      const uses = readUses();
      writeUses(uses + 1);
      const touch = window.matchMedia("(hover: none)").matches;
      // タップの最初の数回だけ、矢印が大きくなって行き先が出てから移動する
      if (demo && touch && !prefersReducedMotion() && uses < DEMO_COUNT) {
        setGoingSide(side);
        timerRef.current = setTimeout(() => slideAndGo(side, href), DEMO_DELAY_MS);
        return;
      }
      slideAndGo(side, href);
    },
    [router, slideAndGo]
  );

  // スワイプ(指を左へ動かすと右の部屋、右へ動かすと左の部屋)。ポップアップや、ドラッグする場所は除く。
  // 横にスライドする場所(data-room-swipe-edge。棚のスライドなど)は、端まで来たあとさらに同じ向きに
  // スワイプしたときだけ、部屋を移動する(スライド自体の動きとは被らない)。
  useEffect(() => {
    if (!current) return;
    let startX = 0;
    let startY = 0;
    let tracking = false;
    let following = false;
    let edgeEl: HTMLElement | null = null;
    let atStart = false;
    let atEnd = false;
    const isAtStart = (el: HTMLElement) => el.scrollLeft <= 1;
    const isAtEnd = (el: HTMLElement) => el.scrollLeft >= el.scrollWidth - el.clientWidth - 1;

    // この向き(dx>0 は右へ引く＝左の部屋)に、部屋を動かしてよいか
    const directionAllowed = (dx: number) => {
      if (!edgeEl) return true;
      return (atStart && dx > 0 && isAtStart(edgeEl)) || (atEnd && dx < 0 && isAtEnd(edgeEl));
    };

    const hidePeek = () => {
      if (peekLeftRef.current) peekLeftRef.current.style.opacity = "0";
      if (peekRightRef.current) peekRightRef.current.style.opacity = "0";
    };

    const reset = () => {
      tracking = false;
      following = false;
      hidePeek();
    };

    const springBack = () => {
      const el = slideEl();
      if (!el) return;
      el.style.transition = `transform ${SLIDE_OUT_MS}ms ease-out`;
      el.style.transform = "translateX(0)";
      window.setTimeout(() => {
        if (!busyRef.current) clearSlideStyle(el);
      }, SLIDE_OUT_MS + 40);
    };

    const onStart = (e: TouchEvent) => {
      const target = e.target as Element | null;
      tracking =
        e.touches.length === 1 &&
        !busyRef.current &&
        !target?.closest('[data-no-room-swipe], input, textarea, select, [role="dialog"]') &&
        !insideFixedElement(target);
      following = false;
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
        if (Math.abs(dx) < Math.abs(dy) * 1.5) {
          // 縦の動き(スクロール)なので、この指の動きでは部屋を動かさない
          tracking = false;
          return;
        }
        if (!directionAllowed(dx)) {
          tracking = false;
          return;
        }
        following = true;
      }
      const { left, right } = neighborsRef.current;
      const neighbor = dx < 0 ? right : left;
      const el = slideEl();
      if (!el) return;
      el.style.transition = "none";
      el.style.transform = `translateX(${dx * (neighbor ? FOLLOW_RATIO : FOLLOW_RATIO_BLOCKED)}px)`;
      // 移動先の名前を、端にのぞかせる
      hidePeek();
      const peek = dx < 0 ? peekRightRef.current : peekLeftRef.current;
      if (peek && neighbor) peek.style.opacity = String(Math.min(1, Math.abs(dx) / SWIPE_MIN_PX));
    };

    const onEnd = (e: TouchEvent) => {
      const wasFollowing = following;
      const wasTracking = tracking;
      reset();
      if (!wasTracking) return;
      const dx = e.changedTouches[0].clientX - startX;
      const dy = e.changedTouches[0].clientY - startY;
      const { left, right } = neighborsRef.current;
      const neighbor = dx < 0 ? right : left;
      const committed =
        Math.abs(dx) >= SWIPE_MIN_PX && Math.abs(dx) >= Math.abs(dy) * 2 && directionAllowed(dx) && Boolean(neighbor);
      if (committed && neighbor) {
        go(dx < 0 ? "right" : "left", neighbor, false);
        return;
      }
      if (wasFollowing) springBack();
    };

    const onCancel = () => {
      const wasFollowing = following;
      reset();
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

  // スワイプ中に、画面の端へのぞく行き先の名前
  const renderPeek = (side: "left" | "right", target: RoomKey | null) => {
    if (!target) return null;
    return (
      <div
        ref={side === "left" ? peekLeftRef : peekRightRef}
        aria-hidden="true"
        className={`pointer-events-none fixed top-1/2 z-30 -translate-y-1/2 opacity-0 ${side === "left" ? "left-2" : "right-2"}`}
        style={{ transition: "opacity 120ms" }}
      >
        <span className="whitespace-nowrap rounded-full bg-amber-700 px-3 py-1.5 text-xs font-black text-white shadow-md">
          {ROOMS[target].toLabel}
        </span>
      </div>
    );
  };

  return (
    <>
      {renderPeek("left", neighbors.left)}
      {renderPeek("right", neighbors.right)}
      {renderArrow("left", neighbors.left)}
      {renderArrow("right", neighbors.right)}
    </>
  );
}
