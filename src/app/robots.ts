import type { MetadataRoute } from "next";

// サイトマップの場所を伝えるだけ（クロールの制限はしない）。
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: "https://app.upskillenglish.bear-fruit.online/sitemap.xml",
  };
}
