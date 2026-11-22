import type { Metadata } from "next";
import Link from "next/link";
import { WORD_CATEGORIES, listWordArticles } from "@/lib/words";
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

// 和製英語の記事のトップ（一覧）。看板（英クワたん 英語コラム）→ 新着記事6本 → 分類のまとめページへのカード → 記事一覧（/words/all）へのリンク → アプリへの誘い。
export default function WordsIndexPage() {
  const articles = listWordArticles();
  const latest = articles.slice(0, 6);
  const counts: Record<string, number> = {};
  for (const a of articles) counts[a.category] = (counts[a.category] ?? 0) + 1;
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

      <section className="mt-8">
        <h2 className="text-xl font-bold">新着記事</h2>
        <WordCardGrid articles={latest} />
      </section>

      <section className="mt-10">
        <h2 className="text-xl font-bold">分類から探す</h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {WORD_CATEGORIES.map((c) => (
            <li key={c.slug}>
              <Link
                href={`/words/category/${c.slug}`}
                className="flex h-full flex-col rounded-xl border border-[#eee8e1] bg-[#fdfbf9] px-4 py-4 transition-colors hover:border-[#d9cfc4]"
              >
                <span className="font-bold">{c.name}</span>
                <span className="mt-1 flex-1 text-sm leading-relaxed text-zinc-600">{c.intro}</span>
                <span className="mt-3 text-xs font-bold text-zinc-500">{counts[c.name] ?? 0} 本 ›</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-8 text-center">
        <Link href="/words/all" className="text-sm font-bold text-zinc-600 underline underline-offset-4">
          記事一覧（すべての記事）
        </Link>
      </p>

      <WordPracticeCta slug="index" />
      <WordStickyBar slug={"index"} />
    </WordsShell>
  );
}
