"use client";

import { useEffect } from "react";

// タイトル画面のBGM。ブラウザの仕様で音は最初のタップ後でないと鳴らせないので、タップを待って流す。
// 音量は部屋のBGMと同じ設定(roadmap_sound_level)に合わせる。
const TITLE_BGM_SRC = "/roadmap/sound/bgm_title.mp3";
const TITLE_BGM_VOLUME = 0.07;
const LEVEL_FACTORS = [0, 0.5, 1, 1.8];
const STORAGE_KEY = "roadmap_sound_level";

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

export function TitleBgm() {
  useEffect(() => {
    const volume = Math.min(1, TITLE_BGM_VOLUME * LEVEL_FACTORS[readLevel()]);
    if (volume <= 0) return;

    const audio = new Audio(TITLE_BGM_SRC);
    audio.loop = true;
    audio.volume = volume;

    let started = false;
    const start = () => {
      if (started) return;
      started = true;
      document.removeEventListener("pointerdown", start, true);
      void audio.play().catch(() => {});
    };
    // 自動再生が許可されている環境ではすぐ鳴る。だめなら最初のタップで鳴らす。
    void audio
      .play()
      .then(() => {
        started = true;
        document.removeEventListener("pointerdown", start, true);
      })
      .catch(() => {});
    document.addEventListener("pointerdown", start, true);

    return () => {
      document.removeEventListener("pointerdown", start, true);
      audio.pause();
    };
  }, []);

  return null;
}
