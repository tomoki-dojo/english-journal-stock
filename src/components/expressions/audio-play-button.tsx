"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Loader2, Lock, Volume2, VolumeX } from "lucide-react";
import type { AudioField } from "./types";
import type { Plan } from "@/lib/plan";
import { cn } from "@/lib/utils";

type AudioPlayButtonProps = {
  expressionId: string;
  field: AudioField;
  plan: Plan;
  // 未ログイン（visitor）かどうか。未ログインの場合はPro導線（/settings）ではなく
  // ログイン導線（/login）に飛ばす。省略時はtrue（ログイン済み）扱い。
  loggedIn?: boolean;
  hasAudio: boolean;
};

// 例文音声の再生ボタン（Pro/Premium限定機能）。
// 生のStorageパスはクライアントに渡さず、クリック時にAPI経由でsigned URLを取得して再生する。
export function AudioPlayButton({
  expressionId,
  field,
  plan,
  loggedIn = true,
  hasAudio,
}: AudioPlayButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  if (!loggedIn) {
    return (
      <Link
        href="/login?reason=audio"
        aria-label="音声再生にはログインが必要です"
        title="音声再生にはログインが必要です"
        className="inline-flex items-center justify-center rounded-md p-1.5 text-zinc-400 transition-colors hover:text-accent"
      >
        <Lock className="h-3.5 w-3.5" />
      </Link>
    );
  }

  if (plan === "free") {
    return (
      <Link
        href="/settings"
        aria-label="音声再生はPro会員限定です"
        title="音声再生はPro会員限定です"
        className="inline-flex items-center justify-center rounded-md p-1.5 text-zinc-400 transition-colors hover:text-accent"
      >
        <Lock className="h-3.5 w-3.5" />
      </Link>
    );
  }

  if (!hasAudio) {
    return (
      <span
        aria-label="音声は準備中です"
        title="音声は準備中です"
        className="inline-flex items-center justify-center rounded-md p-1.5 text-zinc-300"
      >
        <VolumeX className="h-3.5 w-3.5" />
      </span>
    );
  }

  async function handleClick() {
    if (status === "loading") return;

    if (status === "playing") {
      audioRef.current?.pause();
      setStatus("idle");
      return;
    }

    setStatus("loading");
    try {
      const res = await fetch(`/api/expressions/${expressionId}/audio?field=${field}`);
      if (!res.ok) {
        setStatus("error");
        return;
      }
      const data = await res.json();
      const audio = new Audio(data.url);
      audioRef.current = audio;
      audio.onended = () => setStatus("idle");
      audio.onerror = () => setStatus("error");
      await audio.play();
      setStatus("playing");
    } catch {
      setStatus("error");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={status === "loading"}
      aria-label={status === "playing" ? "再生を止める" : "音声を再生"}
      title={status === "playing" ? "再生を止める" : "音声を再生"}
      className={cn(
        "inline-flex items-center justify-center rounded-md p-1.5 transition-colors disabled:cursor-not-allowed",
        status === "error"
          ? "text-red-600"
          : status === "playing"
            ? "bg-accent/10 text-accent"
            : "text-accent hover:bg-accent/10"
      )}
    >
      {status === "loading" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Volume2 className="h-3.5 w-3.5" />
      )}
    </button>
  );
}
