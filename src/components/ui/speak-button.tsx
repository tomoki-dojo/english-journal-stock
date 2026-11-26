"use client";

import { useEffect, useState } from "react";
import { Volume2 } from "lucide-react";
import { useSoundMuted } from "@/components/roadmap/roadmap-sound";
import { canSpeak, speakEnglish, stopSpeaking } from "@/lib/speak-english";
import { cn } from "@/lib/utils";

type SpeakButtonProps = {
  text: string;
  className?: string;
  iconClassName?: string;
};

// 単語の発音ボタン（ブラウザの読み上げ）。全員Freeで使える。
// 読み上げに対応していないブラウザでは何も出さない。
export function SpeakButton({ text, className, iconClassName }: SpeakButtonProps) {
  const muted = useSoundMuted();
  const [supported, setSupported] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  // サーバー描画とずれないよう、対応しているかはマウント後に見る
  useEffect(() => {
    setSupported(canSpeak());
  }, []);

  useEffect(() => {
    if (!speaking) return;
    return () => stopSpeaking();
  }, [speaking]);

  if (!supported) return null;

  function handleClick(event: React.MouseEvent) {
    // カードやリストの行のクリックに伝わらないようにする
    event.preventDefault();
    event.stopPropagation();
    // ロードマップでミュート中は鳴らさない（通常の画面では常にfalse）
    if (muted) return;
    speakEnglish(text, {
      onStart: () => setSpeaking(true),
      onEnd: () => setSpeaking(false),
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={`${text} の発音を聞く`}
      title="発音を聞く"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-md p-1.5 text-zinc-400 transition-colors hover:text-accent",
        speaking && "text-accent",
        muted && "opacity-40",
        className
      )}
    >
      <Volume2 className={cn("h-4 w-4", speaking && "animate-pulse", iconClassName)} />
    </button>
  );
}
