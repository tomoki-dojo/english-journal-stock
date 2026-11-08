"use client";

import { useEffect, useState } from "react";
import { ArthurAvatar } from "@/components/roadmap/arthur";
import { WORDS_CTA_ID, useStartPlaying } from "./word-practice-cta";

// 画面の下に固定する誘い。スマホは横いっぱいの帯、パソコンは右下の小さなカード。
// 少し読み進めたら出し、記事の下のカードが見えている間は隠す（同じ誘いを2つ並べない）。
const SHOW_AFTER_PX = 320;

export function WordStickyBar({ slug }: { slug: string }) {
  const { status, start } = useStartPlaying(slug);
  const [scrolled, setScrolled] = useState(false);
  const [ctaVisible, setCtaVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    const cta = document.getElementById(WORDS_CTA_ID);
    const observer = cta ? new IntersectionObserver(([entry]) => setCtaVisible(entry.isIntersecting)) : null;
    if (cta && observer) observer.observe(cta);

    return () => {
      window.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  }, []);

  const shown = scrolled && !ctaVisible;

  return (
    <>
      {/* 帯でページの最後（フッター）が隠れないように、スマホだけ下に余白を足す */}
      <div aria-hidden className="h-20 sm:hidden" />
      {/* スマホ：画面の下の帯 */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 border-t-2 border-[#f2d5b8] bg-white/95 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2 shadow-[0_-4px_12px_rgba(60,40,25,0.08)] backdrop-blur transition-transform duration-300 sm:hidden ${
          shown ? "translate-y-0" : "translate-y-full"
        }`}
      >
        <div className="mx-auto flex max-w-2xl items-center gap-2.5">
          <ArthurAvatar size={40} />
          <p className="min-w-0 flex-1 text-[13px] font-black leading-snug text-[#3c2819]">
            英語を練習するほどクワガタが育つアプリ公開中！
          </p>
          <button
            type="button"
            onClick={() => start("bar")}
            disabled={status === "starting"}
            className="shrink-0 rounded-full bg-[#e5215a] px-3 py-2.5 text-[13px] font-black text-white shadow-[0_3px_0_#a8153f] active:translate-y-0.5 active:shadow-none disabled:opacity-70"
          >
            {status === "starting" ? "準備中..." : "試しに遊んでみる"}
          </button>
        </div>
      </div>

      {/* パソコン：右下の小さなカード */}
      <div
        className={`fixed bottom-6 right-6 z-40 hidden w-72 rounded-3xl border-2 border-[#f2d5b8] bg-white/95 p-4 shadow-[0_8px_24px_rgba(60,40,25,0.15)] backdrop-blur transition-all duration-300 sm:block ${
          shown ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-6 opacity-0"
        }`}
      >
        <div className="flex items-center gap-3">
          <ArthurAvatar size={48} />
          <p className="min-w-0 flex-1 text-[13px] font-black leading-snug text-[#3c2819]">
            英語を練習するほどクワガタが育つアプリ公開中！
            <br />
            <span className="text-[#e5215a]">喋って！育てろ！英クワたん</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => start("bar")}
          disabled={status === "starting"}
          className="mt-3 block w-full rounded-full bg-[#e5215a] px-4 py-2.5 text-sm font-black text-white shadow-[0_3px_0_#a8153f] transition-transform hover:scale-[1.02] active:translate-y-0.5 active:shadow-none disabled:opacity-70"
        >
          {status === "starting" ? "準備中..." : "試しに遊んでみる"}
        </button>
      </div>
    </>
  );
}
