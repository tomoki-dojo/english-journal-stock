import { Circle, Flower2, Sprout } from "lucide-react";
import { STAGE_COLORS } from "./stage-colors";
import type { WarmthLevel } from "./types";

type GrowthBadgeProps = {
  stage: 0 | 1 | 2 | 3 | 4 | 5;
  warmth: WarmthLevel;
};

// フレーズ単体の習熟度を、数字を出さずに「育っていく」ビジュアルで伝える
// （種→芽→開花）。色は今取り組んでいるStageのテーマカラーを使う。
export function GrowthBadge({ stage, warmth }: GrowthBadgeProps) {
  const color = STAGE_COLORS[stage];

  if (warmth === 0) {
    return <Circle className="h-5 w-5 shrink-0 text-zinc-300" aria-hidden="true" />;
  }
  if (warmth === 1) {
    return <Sprout className="h-5 w-5 shrink-0" style={{ color, opacity: 0.55 }} aria-hidden="true" />;
  }
  if (warmth === 2) {
    return <Sprout className="h-5 w-5 shrink-0" style={{ color }} aria-hidden="true" />;
  }
  return <Flower2 className="h-5 w-5 shrink-0" style={{ color }} aria-hidden="true" />;
}
