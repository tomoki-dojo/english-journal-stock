"use client";

import type { CSSProperties } from "react";
import { STAGE_COLORS, withAlpha } from "./stage-colors";

const TWINKLES = [
  { left: 10, top: 20, size: 14, delay: 0 },
  { left: 84, top: 14, size: 18, delay: 0.5 },
  { left: 92, top: 58, size: 12, delay: 1.0 },
  { left: 12, top: 72, size: 16, delay: 0.3 },
  { left: 50, top: 0, size: 12, delay: 0.8 },
  { left: 72, top: 90, size: 14, delay: 1.3 },
];

// Stage解放のお知らせ。暗転した背景に、Stageカラーの光とともに「Stage◯が解放された！」を出す。
// このあとタマゴ入手の演出（CelebrationOverlay）が続く。
export function StageUnlockOverlay({
  stage,
  onClose,
}: {
  stage: 2 | 3 | 4 | 5;
  onClose: () => void;
}) {
  const color = STAGE_COLORS[stage];

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-8 overflow-hidden bg-black/80 px-8 text-center">
      <div className="relative flex h-56 w-56 items-center justify-center">
        <div
          className="animate-egg-glow absolute inset-0 rounded-full"
          style={{
            background: `radial-gradient(circle, ${withAlpha(color, "d9")} 0%, ${withAlpha(color, "59")} 45%, ${withAlpha(color, "00")} 70%)`,
          }}
        />
        {TWINKLES.map((t, i) => (
          <span
            key={`twinkle-${i}`}
            className="animate-egg-twinkle pointer-events-none absolute leading-none text-white"
            style={
              {
                left: `${t.left}%`,
                top: `${t.top}%`,
                fontSize: t.size,
                animationDelay: `${t.delay}s`,
              } as CSSProperties
            }
          >
            ✦
          </span>
        ))}
        <p
          className="animate-egg-reveal relative text-6xl font-black tracking-wide text-white"
          style={{ textShadow: `0 0 24px ${color}, 0 2px 8px rgba(0,0,0,0.5)` }}
        >
          Stage{stage}
        </p>
      </div>
      <p className="text-lg font-bold leading-relaxed text-white">
        Stage{stage}が解放された！
      </p>
      <button
        type="button"
        onClick={onClose}
        style={{ backgroundColor: color }}
        className="w-full max-w-xs rounded-full py-2.5 text-sm font-bold text-white transition-transform active:scale-95"
      >
        OK
      </button>
    </div>
  );
}
