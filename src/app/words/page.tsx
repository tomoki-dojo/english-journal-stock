import type { Metadata } from "next";
import Link from "next/link";
import { WORD_CATEGORIES, listCategoryArticles } from "@/lib/words";
import { WordCardGrid } from "@/components/words/word-card-grid";
import { WordsShell } from "@/components/words/words-shell";
import { WordPracticeCta } from "@/components/words/word-practice-cta";
import { WordStickyBar } from "@/components/words/word-sticky-bar";
import { ArthurAvatar } from "@/components/roadmap/arthur";

const TITLE = "英クワたん 英語コラム｜カタカナ英語・場面の英語・数字と数学の英語";
const DESCRIPTION = "「バイキング」は英語で通じない？温泉の入り方や「x の 2 乗」は英語で何て言う？通じないカタカナ英語、場面で使う英語、数字と数学の英語を、クマとアーサーの会話で。";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/words" },
  openGraph: {
    type: "website",
    locale: "ja_JP",
    url: "/words",
    siteName: "英クワたん",
    title: TITLE,
    description: DESCRIPTION,
    images: [{ url: "/lp/ogp.png", width: 1200, height: 630, alt: TITLE }],
  },
};

// 和製英語の記事のトップ（一覧）。看板（英クワたん 英語コラム）→ 分類ごとに記事カード4枚（続きは分類のまとめページ）→ アプリへの誘い。
export default function WordsIndexPage() {
  return (
    <WordsShell>
      <section className="mt-6 flex items-center justify-between gap-3 border-b border-[#eee8e1] pb-5">
        <div>
          <h1 className="text-2xl font-bold leading-snug tracking-tight sm:text-3xl">
            英クワたん
            <br />
            英語コラム
          </h1>
          <p className="mt-2 text-sm text-zinc-500">通じないカタカナ英語、場面で使う英語、数字と数学の英語を、クマとアーサーの会話で。</p>
        </div>
        <div className="flex shrink-0 items-end -space-x-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/mascot/kuma-icon.png"
            alt="クマ"
            width={84}
            height={84}
            className="h-[84px] w-[84px] rounded-full bg-white ring-1 ring-[#eee8e1]"
          />
          <ArthurAvatar size={96} />
        </div>
      </section>

      {WORD_CATEGORIES.map((c) => {
        const list = listCategoryArticles(c.name);
        if (list.length === 0) return null;
        return (
          <section key={c.slug} className="mt-8">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-xl font-bold">
                <Link href={`/words/category/${c.slug}`} className="hover:underline">
                  {c.name}
                </Link>
              </h2>
              <Link href={`/words/category/${c.slug}`} className="shrink-0 text-sm font-bold text-zinc-500 underline underline-offset-4">
                まとめを見る
              </Link>
            </div>
            <WordCardGrid articles={list.slice(0, 4)} />
          </section>
        );
      })}

      <WordPracticeCta slug="index" />
      <WordStickyBar slug={"index"} />
    </WordsShell>
  );
}
