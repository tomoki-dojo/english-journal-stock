"use client";

import { useState } from "react";
import Image from "next/image";
import { PawPrint } from "lucide-react";
import { cn } from "@/lib/utils";

// ロードマップ機能全体を通じての「練習相手」キャラクター＝アーサー（クマの同僚、外国人設定）。
// Stage0〜5すべてのRoundHeaderに常時登場し、Stage4・5の会話パートではAIの発言者としても表示される。
//
// 画像素材は別途用意される想定のため、ここでは既存のマスコット画像（public/mascot/bear-suit.png）を
// 暫定表示に使い、専用イラストが用意され次第 ARTHUR_AVATAR_SRC を差し替えるだけで全箇所に反映される
// ようにしてある。画像の読み込みに失敗した場合はアイコン＋背景色のフォールバック表示にする。
export const ARTHUR_NAME = "アーサー";
// TODO: 専用イラストが用意でき次第このパスを差し替える（例: "/mascot/arthur.png"）
export const ARTHUR_AVATAR_SRC = "/mascot/bear-suit.png";

type ArthurAvatarProps = {
  size?: number;
  className?: string;
};

// 円形アバター単体。RoundHeaderの小バッジやStage4/5のチャット吹き出しなど、サイズだけ変えて使い回す。
export function ArthurAvatar({ size = 24, className }: ArthurAvatarProps) {
  const [failed, setFailed] = useState(false);

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-amber-100 ring-1 ring-amber-200/70",
        className
      )}
      style={{ width: size, height: size }}
    >
      {failed ? (
        <PawPrint className="h-[60%] w-[60%] text-amber-700" />
      ) : (
        <Image
          src={ARTHUR_AVATAR_SRC}
          alt={ARTHUR_NAME}
          fill
          sizes={`${size}px`}
          className="object-cover"
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

// RoundHeaderの右上などに置く、名前付きの小さなタグ。「見守り役・出題パートナー」としての常時表示用。
export function ArthurTag({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500", className)}>
      <ArthurAvatar size={20} />
      {ARTHUR_NAME}
    </span>
  );
}
