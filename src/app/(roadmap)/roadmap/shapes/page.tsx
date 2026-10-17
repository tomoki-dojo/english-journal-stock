import { notFound } from "next/navigation";
import { CollisionShapeGallery } from "@/components/roadmap/kuwagata-shelf";

// 開発用: 当たり判定の形の確認画面(本番では出さない)。
export default function CollisionShapesPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <CollisionShapeGallery />;
}
