import type { MetadataRoute } from "next";

// ホーム画面に追加したときのアプリ名・アイコン(主にAndroid)。iPhoneは apple-icon.png が使われる。
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "喋って！育てろ！英クワたん",
    short_name: "英クワたん",
    start_url: "/roadmap",
    display: "standalone",
    background_color: "#E5235B",
    theme_color: "#E5235B",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
