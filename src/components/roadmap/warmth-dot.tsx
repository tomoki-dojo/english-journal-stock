import { cn } from "@/lib/utils";
import type { WarmthLevel } from "./types";

// フレーズ単体の習熟度を、数字を出さずに「見た目の濃さ」だけで伝えるための小さいドット。
// 再登場するたびに少しずつ濃くなり、「もう結構やった」という感覚だけを持たせる。
const WARMTH_CLASSES: Record<WarmthLevel, string> = {
  0: "bg-zinc-200",
  1: "bg-amber-200",
  2: "bg-amber-400",
  3: "bg-amber-600",
};

export function WarmthDot({ warmth }: { warmth: WarmthLevel }) {
  return (
    <span
      className={cn("inline-block h-2 w-2 rounded-full", WARMTH_CLASSES[warmth])}
      aria-hidden="true"
    />
  );
}
