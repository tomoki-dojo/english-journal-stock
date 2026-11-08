import type { MetadataRoute } from "next";
import { listWordArticles } from "@/lib/words";

const SITE_URL = "https://app.upskillenglish.bear-fruit.online";

// 検索エンジン向けのサイトマップ。ログイン不要で読めるページだけを載せる。
export default function sitemap(): MetadataRoute.Sitemap {
  const words = listWordArticles().filter((a) => !a.draft);
  return [
    { url: `${SITE_URL}/welcome`, changeFrequency: "monthly", priority: 1 },
    { url: `${SITE_URL}/words`, changeFrequency: "weekly", priority: 0.8 },
    ...words.map((a) => ({
      url: `${SITE_URL}/words/${a.slug}`,
      lastModified: a.updated ?? a.published,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
  ];
}
