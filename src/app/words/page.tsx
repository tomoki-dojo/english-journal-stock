import type { Metadata } from "next";
import Link from "next/link";
import { listWordArticles, wordEyecatch } from "@/lib/words";
import { WordsShell } from "@/components/words/words-shell";
import { WordPracticeCta } from "@/components/words/word-practice-cta";
import { WordStickyBar } from "@/components/words/word-sticky-bar";
import { ArthurAvatar } from "@/components/roadmap/arthur";

const TITLE = "毎回英語で事故るクマ｜和製英語・接客・数学の英語";
const DESCRIPTION = "「バイキング」は英語で通じない？温泉の入り方や「x の 2 乗」は英語で何て言う？和製英語、接客・案内の英語、数学の英語を、クマとアーサーの会話で。";

export const metadata: Metadata = {
  title: { absolute: `${TITLE}｜英クワたん` },
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

// 和製英語の記事のトップ（一覧）。看板（アカウントの表示名「毎回英語で事故るクマ」）→ 記事カード（アイキャッチつき）→ アプリへの誘い。
export default function WordsIndexPage() {
  const articles = listWordArticles();
  return (
    <WordsShell>
      <section className="mt-6 flex items-center justify-between gap-3 border-b border-[#eee8e1] pb-5">
        <h1 className="text-2xl font-bold leading-snug tracking-tight sm:text-3xl">
          毎回英語で
          <br />
          事故るクマ
        </h1>
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

      <ul className="mt-6 grid gap-4 sm:grid-cols-2">
        {articles.map((a) => (
          <li key={a.slug}>
            <Link
              href={`/words/${a.slug}`}
              className="block overflow-hidden rounded-xl border border-[#eee8e1] bg-white transition-colors hover:border-[#d9cfc4]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={wordEyecatch(a)} alt="" width={1200} height={630} loading="lazy" className="aspect-[1200/630] w-full object-cover" />
              <div className="px-4 py-3">
                <p className="text-xs font-bold text-zinc-500">
                  {a.word}
                  {a.draft && <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-white">下書き</span>}
                </p>
                <p className="mt-0.5 font-bold leading-snug">{a.title}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <WordPracticeCta slug="index" />
      <WordStickyBar slug={"index"} />
    </WordsShell>
  );
}
