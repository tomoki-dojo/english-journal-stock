import { notFound } from "next/navigation";
import { ShareCardsPreview } from "./preview";

// 開発用：シェアカードの見た目を確かめるページ（npm run dev のときだけ開ける。本番では404）。
export default function DevShareCardsPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ShareCardsPreview />;
}
