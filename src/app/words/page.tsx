import type { Metadata } from "next";
import Link from "next/link";
import { listWordArticles } from "@/lib/words";
import { WordsShell } from "@/components/words/words-shell";

const TITLE = "英語で通じない和製英語";
const DESCRIPTION = "バイキング、テンション、ドリンクバー…。日本ではふつうに使うのに、英語だと別の意味になってしまう和製英語と、英語での言い方。";

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

export default function WordsIndexPage() {
  const articles = listWordArticles();
  return (
    <WordsShell>
      <h1 className="pt-6 text-2xl font-black tracking-tight">{TITLE}</h1>
      <ul className="mt-5 space-y-2">
        {articles.map((a) => (
          <li key={a.slug}>
            <Link
              href={`/words/${a.slug}`}
              className="block rounded-2xl border-2 border-[#f2d5b8] bg-white px-4 py-3 transition-colors hover:border-[#e5215a]"
            >
              <p className="text-xs font-black text-[#e5215a]">
                {a.word}
                {a.draft && <span className="ml-2 rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] text-white">下書き</span>}
              </p>
              <p className="font-bold leading-snug">{a.title}</p>
            </Link>
          </li>
        ))}
      </ul>
    </WordsShell>
  );
}
