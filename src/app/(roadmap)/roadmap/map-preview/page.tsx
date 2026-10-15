import { notFound } from "next/navigation";
import { MapPreview } from "./map-preview";

// 開発用: エリアの解放状況ごとのマップの見え方を確認するページ（本番では404）。
export default function MapPreviewPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <MapPreview />;
}
