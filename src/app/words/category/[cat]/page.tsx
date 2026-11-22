import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { WORD_CATEGORIES, categoryBySlug, listCategoryArticles } from "@/lib/words";
import { WordsShell } from "@/components/words/words-shell";
import { WordCardGrid } from "@/components/words/word-card-grid";
import { WordPracticeCta } from "@/components/words/word-practice-cta";
import { WordStickyBar } from "@/components/words/word-sticky-bar";

// 分類のまとめページ（/words/category/<slug>）。紹介文 → 記事カード（場面は迎える側／行く側に分ける）。記事を足すと自動で並ぶ。
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
          {g.heading && <h2 className="text-xl font-bold">{g.heading}</h2>}
          <WordCardGrid articles={g.articles} />
        </section>
      ))}

      <WordPracticeCta slug={`category-${c.slug}`} />
      <WordStickyBar slug={`category-${c.slug}`} />
    </WordsShell>
  );
}
