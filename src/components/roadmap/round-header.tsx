"use client";

import { Lightbulb, Mic, PenLine } from "lucide-react";
import { STAGE_COLORS, withAlpha } from "./stage-colors";

type RoundHeaderProps = {
  stage: 0 | 1 | 2;
  // Stage2の出題形式（穴埋め／文選択／微改変）を表す小タグ。Stage1・Stage0では未指定。
  subFormatLabel?: string;
  // ラウンド内の問題番号（1始まり）と、ラウンドの総問題数
  current: number;
  total: number;
};

// Stage0・Stage1・Stage2（さらにサブ出題形式）を一目で見分けるための、練習画面共通の常時表示ヘッダー。
// 色はSTAGE_COLORS（Stage0は独立エリアとして紫、Stage1〜5のテーマカラー）で判別できるようにし、
// 進捗は「ラウンド内の◯問目」のみを数字で見せる（フレーズ単体の習熟度は別途GrowthBadgeで非数値表現する）。
const STAGE_META = {
  0: { label: "使い分けパーツ", icon: Lightbulb },
  1: { label: "Stage1", icon: Mic },
  2: { label: "Stage2", icon: PenLine },
} as const;

export function RoundHeader({ stage, subFormatLabel, current, total }: RoundHeaderProps) {
  const meta = STAGE_META[stage];
  const Icon = meta.icon;
  const color = STAGE_COLORS[stage];

  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span
          className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ backgroundColor: withAlpha(color, "1a"), color }}
        >
          <Icon className="h-3.5 w-3.5" />
          {meta.label}
        </span>
        {subFormatLabel && (
          <span className="rounded-full bg-zinc-200/70 px-2 py-1 text-xs font-medium text-zinc-600">
            {subFormatLabel}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-400">
          {current}/{total}問目
        </span>
        <div className="flex items-center gap-1">
          {Array.from({ length: total }).map((_, i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 rounded-full transition-colors"
              style={{ backgroundColor: i < current ? color : "#e4e4e7" }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
