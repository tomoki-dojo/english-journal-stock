import Link from "next/link";
import { wordEyecatch, type WordMeta } from "@/lib/words";

// 記事カード（アイキャッチつき）の並び。一覧ページと分類のまとめページで使う。
export function WordCardGrid({ articles }: { articles: WordMeta[] }) {
  return (
    <ul className="mt-4 grid gap-4 sm:grid-cols-2">
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
  );
}
