"use client";

import { Coffee, Lightbulb, Mic, PenLine, RadioTower, Sparkles } from "lucide-react";
import { STAGE_COLORS, withAlpha } from "./stage-colors";
import { ArthurScene, type ArthurMood } from "./arthur";

type RoundHeaderProps = {
  stage: 0 | 1 | 2 | 3 | 4 | 5;
  // Stage2の出題形式（穴埋め／文選択／微改変）を表す小タグ。Stage1・Stage0では未指定。
  subFormatLabel?: string;
  // サブ形式の隣に出す補足の小タグ(Stage3の「Stage1卒業 ◯個から出題」など)。
  poolLabel?: string;
  // アーサーの表情。未指定なら問題の切り替わりで口パクする
  arthurMood?: ArthurMood;
} & (
  | {
      // Stage0〜2：ラウンド内の問題番号（1始まり）と、ラウンドの総問題数
      current: number;
      total: number;
      usageLabel?: undefined;
    }
  | {
      // Stage3・Stage4：ラウンドという単位を持たないため、代わりに「今日のAI判定 あと◯回」
      // 「今日のセッション あと◯回」等の自由文言を右側に表示する
      // （_reference/speaking-roadmap-design.md参照）。
      current?: undefined;
      total?: undefined;
      usageLabel: string;
    }
);

// Stage0・Stage1・Stage2・Stage3・Stage4（さらにサブ出題形式）を一目で見分けるための、練習画面
// 共通の常時表示ヘッダー。色はSTAGE_COLORS（Stage0は独立エリアとして紫、Stage1〜5のテーマカラー）
// で判別できるようにし、進捗は「ラウンド内の◯問目」（Stage3・4はusageLabel）のみを数字で見せる
// （フレーズ単体の習熟度は別途GrowthBadgeで非数値表現する）。
const STAGE_META = {
  0: { label: "Stage0", icon: Lightbulb },
  1: { label: "Stage1", icon: Mic },
  2: { label: "Stage2", icon: PenLine },
  3: { label: "Stage3", icon: Sparkles },
  4: { label: "Stage4", icon: Coffee },
  5: { label: "Stage5", icon: RadioTower },
} as const;

export function RoundHeader({ stage, subFormatLabel, poolLabel, arthurMood, current, total, usageLabel }: RoundHeaderProps) {
  const meta = STAGE_META[stage];
  const Icon = meta.icon;
  const color = STAGE_COLORS[stage];

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between">
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
          {poolLabel && (
            <span className="rounded-full bg-zinc-200/70 px-2 py-1 text-xs font-medium text-zinc-600">
              {poolLabel}
            </span>
          )}
        </div>

        {usageLabel !== undefined ? (
          <span className="text-xs text-zinc-400">{usageLabel}</span>
        ) : (
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
        )}
      </div>

      {/* アーサー（練習相手）と水槽。Stage0〜5すべての練習画面共通。問題が切り替わるたびに口パクする。 */}
      <ArthurScene className="mt-3" mood={arthurMood} talkKey={current ?? usageLabel} />
    </div>
  );
}
