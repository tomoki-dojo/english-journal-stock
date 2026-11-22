import type { Metadata } from "next";
import Link from "next/link";
import { categoryByName, listWordArticles } from "@/lib/words";
import { WordsShell } from "@/components/words/words-shell";
import { WordStickyBar } from "@/components/words/word-sticky-bar";

const TITLE = "記事一覧｜英クワたん 英語コラム";
const DESCRIPTION = "英クワたん 英語コラムの記事の一覧。通じないカタカナ英語、場面で使う英語、数字と数学の英語の記事を新しい順に並べています。";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/words/all" },
};

// 記事一覧（/words/all）。全部の記事を新しい順に、1行ずつ（分類つき）。
export default function WordsAllPage() {
  const articles = listWordArticles();
  return (
    <WordsShell>
      <nav className="pt-4 text-xs font-bold text-zinc-500">
        <Link href="/words" className="hover:underline">
          英語コラム
        </Link>
        <span className="mx-1.5">›</span>
        <span>記事一覧</span>
      </nav>
      <h1 className="mt-3 text-2xl font-bold leading-snug tracking-tight sm:text-3xl">記事一覧</h1>
      <p className="mt-1 text-sm text-zinc-500">{articles.length} 本</p>

      <ul className="mt-5 divide-y divide-[#eee8e1] border-y border-[#eee8e1]">
        {articles.map((a) => {
          const cat = categoryByName(a.category);
          return (
            <li key={a.slug}>
              <Link href={`/words/${a.slug}`} className="block py-3 transition-colors hover:bg-[#fdfbf9]">
                <p className="text-xs font-bold text-zinc-500">
                  {cat?.name ?? a.category}
                  <span className="mx-1.5">·</span>
                  {a.word}
                  {a.draft && <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-white">下書き</span>}
                </p>
                <p className="mt-0.5 font-bold leading-snug">{a.title}</p>
              </Link>
            </li>
          );
        })}
      </ul>
      <WordStickyBar slug="all" />
    </WordsShell>
  );
}
