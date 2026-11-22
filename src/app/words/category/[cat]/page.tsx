import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { WORD_CATEGORIES, categoryBySlug, listCategoryArticles, type WordMeta } from "@/lib/words";
import { WordsShell } from "@/components/words/words-shell";
import { WordCardGrid } from "@/components/words/word-card-grid";
import { WordPracticeCta } from "@/components/words/word-practice-cta";
import { WordStickyBar } from "@/components/words/word-sticky-bar";
import styles from "@/components/words/word-article.module.css";

// 分類のまとめページ（/words/category/<slug>）。紹介文 → 各記事の冒頭の一言の一覧 → 記事カード。記事を足すと自動で並ぶ。
export const dynamicParams = false;

const SITE_URL = "https://app.upskillenglish.bear-fruit.online";

export function generateStaticParams() {
  return WORD_CATEGORIES.map((c) => ({ cat: c.slug }));
}

type Props = { params: Promise<{ cat: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { cat } = await params;
  const c = categoryBySlug(cat);
  if (!c) return {};
  const url = `/words/category/${c.slug}`;
  return {
    title: { absolute: `${c.title}｜英クワたん` },
    description: c.description,
    alternates: { canonical: url },
    openGraph: {
      type: "website",
      locale: "ja_JP",
      url,
      siteName: "英クワたん",
      title: c.title,
      description: c.description,
      images: [{ url: "/lp/ogp.png", width: 1200, height: 630, alt: c.title }],
    },
  };
}

function md(source: string): string {
  return marked.parse(source, { async: false, gfm: true, breaks: false });
}

function QuickList({ articles }: { articles: WordMeta[] }) {
  const items = articles.filter((a) => a.answer);
  if (items.length === 0) return null;
  return (
    <ul className="words-plain mt-4 space-y-2">
      {items.map((a) => (
        <li key={a.slug}>
          <Link
            href={`/words/${a.slug}`}
            className="block rounded-xl border border-[#eee8e1] bg-[#fdfbf9] px-4 py-3 transition-colors hover:border-[#d9cfc4]"
          >
            <p className="text-xs font-bold text-zinc-500">{a.word}</p>
            <div className={`mt-0.5 leading-relaxed ${styles.answer}`} dangerouslySetInnerHTML={{ __html: md(a.answer) }} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

export default async function WordCategoryPage({ params }: Props) {
  const { cat } = await params;
  const c = categoryBySlug(cat);
  if (!c) notFound();
  const articles = listCategoryArticles(c.name);
  const groups = c.groups
    ? c.groups.map((g) => ({ ...g, articles: articles.filter((a) => a.side === g.side) })).filter((g) => g.articles.length > 0)
    : [{ side: "", heading: "", articles }];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: c.title,
    description: c.description,
    url: `${SITE_URL}/words/category/${c.slug}`,
    hasPart: articles.map((a) => ({ "@type": "Article", headline: a.title, url: `${SITE_URL}/words/${a.slug}` })),
  };

  return (
    <WordsShell>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <nav className="pt-4 text-xs font-bold text-zinc-500">
        <Link href="/words" className="hover:underline">
          英語コラム
        </Link>
        <span className="mx-1.5">›</span>
        <span>{c.name}</span>
      </nav>
      <section className="mt-3 border-b border-[#eee8e1] pb-5">
        <h1 className="text-2xl font-bold leading-snug tracking-tight sm:text-3xl">{c.name}</h1>
        <p className="mt-3 leading-relaxed text-zinc-600">{c.intro}</p>
      </section>

      {groups.map((g) => (
        <section key={g.side || "all"} className="mt-8">
          {g.heading ? (
            <>
              <h2 className="text-xl font-bold">{g.heading}</h2>
              <h3 className="mt-3 text-base font-bold text-zinc-600">{c.quickTitle}</h3>
            </>
          ) : (
            <h2 className="text-xl font-bold">{c.quickTitle}</h2>
          )}
          <QuickList articles={g.articles} />
          <WordCardGrid articles={g.articles} />
        </section>
      ))}

      <WordPracticeCta slug={`category-${c.slug}`} />
      <WordStickyBar slug={`category-${c.slug}`} />
    </WordsShell>
  );
}
