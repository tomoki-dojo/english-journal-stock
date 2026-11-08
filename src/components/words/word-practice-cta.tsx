"use client";

import { useState } from "react";
import { createClientBrowser } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/analytics";
import { ArthurAvatar } from "@/components/roadmap/arthur";

const STAGE1_ENTRY = `/roadmap/title/enter?next=${encodeURIComponent("/roadmap/stage1")}`;

// 記事の下のアプリへの誘い（会話に出てきたアーサー＝アプリのアーサー）。
// 未ログイン → 登録なしで試す（匿名サインイン）→ Stage1。ゲスト・登録済みはそのまま続きへ。
export function WordPracticeCta({ slug }: { slug: string }) {
  const [status, setStatus] = useState<"idle" | "starting" | "error">("idle");

  const start = async () => {
    setStatus("starting");
    trackEvent("word_practice_click", { slug });
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
      trackEvent("guest_start", { from: "words", slug });
    }
    window.location.href = STAGE1_ENTRY;
  };

  return (
    <section className="mt-10 rounded-3xl bg-gradient-to-br from-[#fff1c9] to-[#ffe3ec] px-5 py-6 text-center">
      <div className="mx-auto mb-2 flex justify-center">
        <ArthurAvatar size={80} animated />
      </div>
      <p className="mb-4 text-lg font-black leading-snug">
        アーサーと英語を喋って、
        <br />
        <span className="text-[#e5215a]">クワガタを育てよう</span>
      </p>
      <button
        type="button"
        onClick={start}
        disabled={status === "starting"}
        className="block w-full rounded-full border-4 border-[#eaaccb] bg-[#e5215a] px-5 py-3.5 text-center text-base font-black sm:text-lg tracking-wide text-white shadow-[0_4px_0_#a8153f] transition-transform hover:scale-[1.02] active:translate-y-0.5 active:shadow-none disabled:opacity-70"
      >
        {status === "starting" ? "準備中..." : "登録なしで遊んでみる"}
      </button>
      <p className="mt-2 text-xs font-bold text-zinc-500">英クワたん</p>
      {status === "error" && <p className="mt-2 text-sm font-bold text-red-600">始められませんでした</p>}
    </section>
  );
}
