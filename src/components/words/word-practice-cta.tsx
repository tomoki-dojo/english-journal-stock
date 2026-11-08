"use client";

import { useState } from "react";
import { createClientBrowser } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/analytics";

const STAGE1_ENTRY = `/roadmap/title/enter?next=${encodeURIComponent("/roadmap/stage1")}`;

// 記事からアプリを始める。未ログイン → 登録なしで試す（匿名サインイン）→ Stage1。ゲスト・登録済みはそのまま続きへ。
// placement は GA4 で「記事の下のカード」と「画面の下の帯」のどちらから押されたかを分けるため。
export function useStartPlaying(slug: string) {
  const [status, setStatus] = useState<"idle" | "starting" | "error">("idle");

  const start = async (placement: "bottom" | "bar") => {
    setStatus("starting");
    trackEvent("word_practice_click", { slug, placement });
    const supabase = createClientBrowser();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user && !user.is_anonymous) {
      window.location.href = "/roadmap";
      return;
    }
    if (!user) {
      const { error } = await supabase.auth.signInAnonymously();
      if (error) {
        setStatus("error");
        return;
      }
      trackEvent("guest_start", { from: "words", slug, placement });
    }
    window.location.href = STAGE1_ENTRY;
  };

  return { status, start };
}

export const WORDS_CTA_ID = "words-cta";

// 記事の下のアプリへの誘い（タイトルロゴ＋アプリの画面2枚＋ボタン）。
export function WordPracticeCta({ slug }: { slug: string }) {
  const { status, start } = useStartPlaying(slug);

  return (
    <section id={WORDS_CTA_ID} className="mt-10 rounded-3xl bg-gradient-to-br from-[#fff1c9] to-[#ffe3ec] px-5 py-6 text-center sm:px-8 sm:py-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/words/ad/title.webp"
        alt="喋って！育てろ！英クワたん"
        width={600}
        height={597}
        className="mx-auto w-full max-w-[240px] sm:max-w-[280px]"
      />
      <div className="mt-3 space-y-1.5 text-base font-black sm:mt-4 sm:space-y-3 sm:text-lg sm:leading-loose">
        <p>英語を練習するほどクワガタが育つアプリ公開中！</p>
        <p>気付いたらずっと英語練習してる！</p>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-6 sm:gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/words/ad/tank.webp"
          alt="水槽で育つクワガタ"
          width={600}
          height={405}
          loading="lazy"
          className="aspect-[4/3] w-full rounded-2xl border-2 border-white object-cover shadow-sm"
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/words/ad/stage.webp"
          alt="アーサーと英語を練習する画面"
          width={600}
          height={497}
          loading="lazy"
          className="aspect-[4/3] w-full rounded-2xl border-2 border-white object-cover object-top shadow-sm"
        />
      </div>
      <button
        type="button"
        onClick={() => start("bottom")}
        disabled={status === "starting"}
        className="mt-5 block w-full rounded-full border-4 border-[#eaaccb] bg-[#e5215a] px-5 py-3.5 text-center text-base font-black tracking-wide text-white shadow-[0_4px_0_#a8153f] transition-transform hover:scale-[1.02] active:translate-y-0.5 active:shadow-none disabled:opacity-70 sm:mx-auto sm:mt-6 sm:max-w-sm sm:text-lg"
      >
        {status === "starting" ? "準備中..." : "試しに遊んでみる"}
      </button>
      {status === "error" && <p className="mt-2 text-sm font-bold text-red-600">始められませんでした</p>}
    </section>
  );
}
