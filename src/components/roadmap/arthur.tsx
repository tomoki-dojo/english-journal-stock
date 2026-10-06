"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

// ロードマップ機能全体を通じての「練習相手」キャラクター＝アーサー（クマの同僚、外国人設定）。
// Stage0〜5すべてのRoundHeaderに常時登場し、Stage4・5の会話パートではAIの発言者としても表示される。
//
// 画像は7コマを横一列に並べたスプライトシート1枚（512×512 × 7 = 3584×512）。
// 表情の切り替え・口パク・まばたきはCSSのbackground-positionで行う（globals.cssの.arthur-*）。
export const ARTHUR_NAME = "アーサー";
export const ARTHUR_SHEET_SRC = "/mascot/arthur_sheet.png";

export type ArthurMood = "idle" | "talk" | "happy" | "sad" | "point";

const TALK_DURATION_MS = 1600;

type ArthurAvatarProps = {
  size?: number;
  className?: string;
  // 待機中のまばたき＋ごく控えめな上下動。
  animated?: boolean;
  // idle=通常（animatedでまばたき）、talk=口パク（TALK_DURATION_MS後にidleへ）、happy/sad/point=固定表情
  mood?: ArthurMood;
  // talkのとき、この値が変わるたびに口パクをやり直す（台詞が切り替わるタイミングで渡す）
  talkKey?: string | number;
  // 円形の枠・背景なしで、バストアップをそのまま出す（練習画面の中央配置用）
  bare?: boolean;
};

// 円形アバター単体。RoundHeaderの小バッジやStage4/5のチャット吹き出しなど、サイズだけ変えて使い回す。
export function ArthurAvatar({
  size = 24,
  className,
  animated = false,
  mood = "idle",
  talkKey,
  bare = false,
}: ArthurAvatarProps) {
  const [talking, setTalking] = useState(mood === "talk");

  useEffect(() => {
    if (mood !== "talk") {
      setTalking(false);
      return;
    }
    setTalking(true);
    const timer = setTimeout(() => setTalking(false), TALK_DURATION_MS);
    return () => clearTimeout(timer);
  }, [mood, talkKey]);

  const frameClass =
    mood === "talk" && talking
      ? "arthur-talk"
      : mood === "happy"
        ? "arthur-frame-happy"
        : mood === "sad"
          ? "arthur-frame-sad"
          : mood === "point"
            ? "arthur-frame-point"
            : animated
              ? "arthur-blink"
              : "arthur-frame-idle";

  return (
    <span
      role="img"
      aria-label={ARTHUR_NAME}
      className={cn(
        "relative inline-block shrink-0",
        !bare && "overflow-hidden rounded-full bg-amber-100 ring-1 ring-amber-200/70",
        animated && !bare && "animate-mascot-bob",
        className
      )}
      style={{ width: size, height: size }}
    >
      <span
        className={cn("absolute inset-0 block arthur-sheet", frameClass)}
        style={{ backgroundImage: `url(${ARTHUR_SHEET_SRC})` }}
      />
    </span>
  );
}

// 練習画面の中央に置く、アーサー（バストアップ）と水槽。虫に英語を聞かせている世界観の飾り。
export const PRACTICE_TANK_SRC = "/mascot/practice_tank.png";
const SCENE_SIZE = 176;

export function ArthurScene({
  mood = "talk",
  talkKey,
  className,
}: {
  mood?: ArthurMood;
  talkKey?: string | number;
  className?: string;
}) {
  // 水槽はアーサーの右前（画面では左下）に、胸元へ重ねる。サイズ・位置はアーサーのキャンバス幅に対する比率。
  return (
    <div className={cn("relative mx-auto", className)} style={{ width: SCENE_SIZE, height: SCENE_SIZE }}>
      <ArthurAvatar size={SCENE_SIZE} animated bare mood={mood} talkKey={talkKey} />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={PRACTICE_TANK_SRC}
        alt=""
        aria-hidden
        draggable={false}
        className="pointer-events-none absolute select-none"
        style={{ left: "6%", bottom: "-2%", width: "52%" }}
      />
    </div>
  );
}

// RoundHeaderの右上などに置く、名前付きの小さなタグ。「見守り役・出題パートナー」としての常時表示用。
export function ArthurTag({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500", className)}>
      <ArthurAvatar size={20} animated />
      {ARTHUR_NAME}
    </span>
  );
}
