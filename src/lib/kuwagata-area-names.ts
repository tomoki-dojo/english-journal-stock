// 採集エリアの表示名（日本語）。エリア名を変えるときは、ここだけを直す。
// 使用箇所: 採集エリア選択マップの名前札・図鑑のエリアタブ・採集のエリア選択・解放演出。
import type { KuwagataAreaCode } from "@/lib/supabase/kuwagata";

export const KUWAGATA_AREA_NAMES: Record<KuwagataAreaCode, string> = {
  area1: "庭・裏庭",
  area2: "里山・雑木林",
  area3: "川",
  area4: "ジャングル・秘境",
  area5: "山岳",
  aquarium: "水の底の秘境",
  ancient: "古代の森",
};

// 図鑑のエリアタブの見出し（例: 「エリア2・里山・雑木林」「Pro限定・古代の森」）
export function kuwagataAreaChapterLabel(code: KuwagataAreaCode): string {
  const name = KUWAGATA_AREA_NAMES[code];
  if (code === "aquarium" || code === "ancient") return `Pro限定・${name}`;
  return `${code.replace("area", "エリア")}・${name}`;
}
