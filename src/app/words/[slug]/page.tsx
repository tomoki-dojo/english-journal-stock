import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { marked } from "marked";
import { getWordArticle, listWordArticles, type WordArticle } from "@/lib/words";
import { WordsShell } from "@/components/words/words-shell";
import { WordTalk } from "@/components/words/word-talk";
import { WordPhrases } from "@/components/words/word-phrases";
import { WordPracticeCta } from "@/components/words/word-practice-cta";
import { TrackOnMount } from "@/components/analytics/track-on-mount";
import styles from "@/components/words/word-article.module.css";

// 和製英語の記事。content/words/<slug>.md をビルド時に読んで静的ページにする。
export const dynamicParams = false;

const SITE_URL = "https://app.upskillenglish.bear-fruit.online";
// アイキャッチ：記事のフロントマターに ogImage があればそれ（ショートの一場面など）、なければ自動で作る /words/og/<slug>
const eyecatch = (a: { slug: string; ogImage?: string }) => a.ogImage ?? `/words/og/${a.slug}`;

export function generateStaticParams() {
  return listWordArticles().map((a) => ({ slug: a.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const a = getWordArticle(slug);
  if (!a) return {};
  const image = eyecatch(a);
  return {
    title: { absolute: `${a.title}｜英クワたん` },
    description: a.description,
    alternates: { canonical: `/words/${a.slug}` },
    robots: a.draft ? { index: false, follow: false } : undefined,
    openGraph: {
      type: "article",
      locale: "ja_JP",
      url: `/words/${a.slug}`,
      siteName: "英クワたん",
      title: a.title,
      description: a.description,
      images: [{ url: image, width: 1200, height: 630, alt: a.title }],
      publishedTime: a.published || undefined,
      modifiedTime: a.updated ?? (a.published || undefined),
    },
    twitter: { card: "summary_large_image", title: a.title, description: a.description, images: [image] },
  };
}

function md(source: string): string {
  return marked.parse(source, { async: false, gfm: true, breaks: false });
}

function formatDate(d: string): string {
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}.${m[2]}.${m[3]}` : d;
}

function JsonLd({ a }: { a: WordArticle }) {
  const data = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: a.description,
    datePublished: a.published || undefined,
    dateModified: a.updated ?? (a.published || undefined),
    author: { "@type": "Person", name: "どーじょー" },
    publisher: { "@type": "Organization", name: "英クワたん" },
    mainEntityOfPage: `${SITE_URL}/words/${a.slug}`,
    image: `${SITE_URL}${eyecatch(a)}`,
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

export default async function WordArticlePage({ params }: Props) {
  const { slug } = await params;
  const a = getWordArticle(slug);
  if (!a) notFound();

  const all = listWordArticles();
  const bySlug = new Map(all.map((m) => [m.slug, m]));
  const related = [
    ...a.related.map((s) => bySlug.get(s)).filter((m): m is NonNullable<typeof m> => !!m && m.slug !== a.slug),
    ...all.filter((m) => m.slug !== a.slug && !a.related.includes(m.slug)),
  ].slice(0, 4);

  return (
    <WordsShell>
      <JsonLd a={a} />
      <TrackOnMount event="word_article_view" params={{ slug: a.slug }} onceKey={`word_article_view:${a.slug}`} />
      <article>
        <nav className="pt-4 text-xs font-bold text-zinc-500">
          <Link href="/words" className="hover:underline">
            和製英語
          </Link>
          <span className="mx-1.5">›</span>
          <span>{a.word}</span>
        </nav>
        {a.draft && (
          <p className="mt-3 inline-block rounded-full bg-zinc-800 px-3 py-1 text-xs font-bold text-white">下書き（本番には出ません）</p>
        )}
        <h1 className="mt-3 text-2xl font-black leading-snug tracking-tight sm:text-3xl">{a.title}</h1>
        {a.published && (
          <p className="mt-2 text-xs font-semibold text-zinc-500">
            {formatDate(a.published)}
            {a.updated && a.updated !== a.published && `（更新 ${formatDate(a.updated)}）`}
          </p>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={eyecatch(a)}
          alt={a.title}
          width={1200}
          height={630}
          className="mt-4 w-full rounded-2xl border-2 border-[#f2d5b8]"
        />

        {a.answer && (
          <div className="mt-5 rounded-3xl border-4 border-[#e5215a] bg-white px-5 py-4">
            <p className="mb-1 text-xs font-black text-[#e5215a]">答え</p>
            <div className={`text-lg font-bold leading-relaxed ${styles.answer}`} dangerouslySetInnerHTML={{ __html: md(a.answer) }} />
          </div>
        )}

        <div className={styles.body}>
          {a.blocks.map((b, i) =>
            b.type === "talk" ? (
              <WordTalk key={i} lines={b.lines} />
            ) : b.type === "phrases" ? (
              <WordPhrases key={i} phrases={b.phrases} slug={a.slug} />
            ) : (
              <div key={i} dangerouslySetInnerHTML={{ __html: md(b.source) }} />
            )
          )}
        </div>

        <WordPracticeCta slug={a.slug} />
      </article>

      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-black">ほかの和製英語</h2>
          <ul className="space-y-2">
            {related.map((m) => (
              <li key={m.slug}>
                <Link
                  href={`/words/${m.slug}`}
                  className="block rounded-2xl border-2 border-[#f2d5b8] bg-white px-4 py-3 transition-colors hover:border-[#e5215a]"
                >
                  <p className="text-xs font-black text-[#e5215a]">{m.word}</p>
                  <p className="font-bold leading-snug">{m.title}</p>
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-center">
            <Link href="/words" className="text-sm font-bold text-[#e5215a] underline underline-offset-4">
              和製英語の一覧
            </Link>
          </p>
        </section>
      )}
    </WordsShell>
  );
}
