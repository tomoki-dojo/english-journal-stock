"use client";

import { useEffect, useRef, useState } from "react";
import { setAudioVolume, unlockAudio } from "@/lib/audio-volume";

// タイトル画面の本体。最初は背景と「TAP TO START」だけを見せ、タップしたらBGMを鳴らして入場演出を始める。
// (スマホは操作するまで音を鳴らせないので、このタップを音を出す合図にする。)
// 音量は部屋のBGMと同じ設定(roadmap_sound_level)に合わせる。
const TITLE_BGM_SRC = "/roadmap/sound/bgm_title.mp3";
const TITLE_BGM_VOLUME = 0.07;
const LEVEL_FACTORS = [0, 0.5, 1, 1.8];
const STORAGE_KEY = "roadmap_sound_level";
// ボタンを押したときと同じ音(roadmap-sound.tsx のタップ音と同じ音源・音量)。
const TAP_SRC = "/roadmap/sound/se_tap.mp3";
const TAP_VOLUME = 0.07;

function readLevel(): number {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved !== null) {
      const n = Number(saved);
      if (Number.isInteger(n) && n >= 0 && n < LEVEL_FACTORS.length) return n;
    }
  } catch {
    // localStorageが使えない環境では既定値
  }
  return 2;
}

export function TitleScene({ children }: { children: React.ReactNode }) {
  const [started, setStarted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    return () => {
      audioRef.current?.pause();
    };
  }, []);

  function start() {
    if (started) return;
    unlockAudio();
    setStarted(true);
    const factor = LEVEL_FACTORS[readLevel()];
    if (factor <= 0) return;
    const tap = new Audio(TAP_SRC);
    setAudioVolume(tap, TAP_VOLUME * factor);
    void tap.play().catch((err) => console.warn("タップ音を鳴らせませんでした", err));
    const audio = new Audio(TITLE_BGM_SRC);
    audio.loop = true;
    setAudioVolume(audio, TITLE_BGM_VOLUME * factor);
    audioRef.current = audio;
    // タップの中で鳴らすので、スマホでも許可される。
    void audio.play().catch((err) => console.warn("タイトルのBGMを鳴らせませんでした", err));
  }

  return (
    <div className="relative" style={{ aspectRatio: "9 / 16", height: "min(100dvh, calc(100vw * 16 / 9))" }}>
      {/* タイトル絵はレイヤーごとの画像を重ねたもの(入場演出でロゴ・吹き出しを個別に動かす)。 */}
      {/* eslint-disable @next/next/no-img-element */}
      <img
        src="/roadmap/title/title_layer_bg.webp"
        alt="英クワたん 喋って！育てろ！"
        className="animate-title-bg absolute inset-0 h-full w-full select-none"
        draggable={false}
      />
      {started && (
        <>
          <img
            src="/roadmap/title/title_layer_logo.webp"
            alt=""
            className="animate-title-logo absolute inset-0 h-full w-full select-none"
            draggable={false}
          />
          <img
            src="/roadmap/title/title_layer_bubble.webp"
            alt=""
            className="animate-title-bubble absolute inset-0 h-full w-full select-none"
            draggable={false}
          />
          <img
            src="/roadmap/title/title_layer_mega.webp"
            alt=""
            className="animate-title-mega absolute inset-0 h-full w-full select-none"
            draggable={false}
          />
        </>
      )}
      {/* eslint-enable @next/next/no-img-element */}
      {started ? (
        <div className="animate-title-buttons absolute inset-x-0 top-[76%] flex flex-col items-center gap-3 px-[12%]">
          {children}
        </div>
      ) : (
        <button
          type="button"
          onClick={start}
          aria-label="タイトルを始める"
          data-sound-silent
          className="absolute inset-0 flex items-start justify-center pt-[80%] focus:outline-none"
        >
          <span
            className="animate-title-blink text-2xl font-black tracking-[0.25em] text-[#e5215a]"
            style={{ WebkitTextStroke: "6px #fffaeb", paintOrder: "stroke fill" }}
          >
            TAP TO START
          </span>
        </button>
      )}
    </div>
  );
}
