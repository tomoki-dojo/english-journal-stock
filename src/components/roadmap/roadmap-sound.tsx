"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { Volume2, VolumeX } from "lucide-react";

// ロードマップ共通のサウンド（BGM・タップ音）。音源は public/roadmap/sound/ に置くだけで鳴る
// （ファイルが無い間は何も鳴らず、エラーも出さない）。ファイル名は brand/kuwagata-asset-spec.md 参照。
const BGM_SRC = "/roadmap/sound/bgm_room.mp3";
const TAP_SRC = "/roadmap/sound/se_tap.mp3";
const BGM_VOLUME = 0.15;
const TAP_VOLUME = 0.05;
const PAGE_SRC = "/roadmap/sound/se_page.mp3";
const PAGE_VOLUME = 0.2;
const STORAGE_KEY = "roadmap_sound_enabled";

// BGMを流す画面（部屋・棚・図鑑）。Stageの練習画面などでは止める。
const BGM_PATHS = new Set([
  "/roadmap",
  "/roadmap/shelf",
  "/roadmap/encyclopedia",
]);

type SoundContextValue = {
  enabled: boolean;
  toggle: () => void;
  playPage: () => void;
};
const SoundContext = createContext<SoundContextValue | null>(null);

export function RoadmapSoundProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(true);
  const [interacted, setInteracted] = useState(false);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const tapRef = useRef<HTMLAudioElement | null>(null);
  const bgmMissing = useRef(false);
  const tapMissing = useRef(false);
  const enabledRef = useRef(true);

  // 保存されたON/OFFを読み込む（既定はON）
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "0") setEnabled(false);
    } catch {
      // localStorageが使えない環境ではメモリ上の状態のみ
    }
  }, []);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      } catch {
        // 無視
      }
      return next;
    });
  }, []);

  // ブラウザの仕様で、音は最初のタップ後でないと鳴らせない。タップ音もここで鳴らす。
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      setInteracted(true);
      if (!enabledRef.current || tapMissing.current) return;
      const target = e.target as Element | null;
      if (!target?.closest("button, a, [role='button']")) return;
      if (target.closest("[data-sound-toggle], [data-sound-silent]")) return;

      if (!tapRef.current) {
        const audio = new Audio(TAP_SRC);
        audio.volume = TAP_VOLUME;
        audio.addEventListener("error", () => {
          tapMissing.current = true;
        });
        tapRef.current = audio;
      }
      tapRef.current.currentTime = 0;
      void tapRef.current.play().catch(() => {});
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true);
  }, []);

  // 図鑑のページをめくる音
  const pageRef = useRef<HTMLAudioElement | null>(null);
  const playPage = useCallback(() => {
    if (!enabledRef.current) return;
    if (!pageRef.current) {
      const audio = new Audio(PAGE_SRC);
      audio.volume = PAGE_VOLUME;
      pageRef.current = audio;
    }
    pageRef.current.currentTime = 0;
    void pageRef.current.play().catch(() => {});
  }, []);

  // BGM：部屋・棚・図鑑でだけ、ONかつ最初のタップ後に流す。ページ移動をまたいでも途切れない。
  useEffect(() => {
    const shouldPlay = enabled && interacted && BGM_PATHS.has(pathname);

    if (!bgmRef.current) {
      if (!shouldPlay || bgmMissing.current) return;
      const audio = new Audio(BGM_SRC);
      audio.loop = true;
      audio.volume = BGM_VOLUME;
      audio.addEventListener("error", () => {
        bgmMissing.current = true;
      });
      bgmRef.current = audio;
    }

    const audio = bgmRef.current;
    if (shouldPlay) void audio.play().catch(() => {});
    else audio.pause();
  }, [enabled, interacted, pathname]);

  useEffect(() => {
    return () => {
      bgmRef.current?.pause();
    };
  }, []);

  return (
    <SoundContext.Provider value={{ enabled, toggle, playPage }}>
      {children}
    </SoundContext.Provider>
  );
}

export function usePagePlayer() {
  return useContext(SoundContext)?.playPage ?? (() => {});
}

// 画面上部に置く、ワンタップのON/OFFボタン（アイコンのみ）。
export function SoundToggleButton() {
  const ctx = useContext(SoundContext);
  if (!ctx) return null;
  const { enabled, toggle } = ctx;

  return (
    <button
      type="button"
      data-sound-toggle
      onClick={toggle}
      aria-label={enabled ? "音をオフにする" : "音をオンにする"}
      aria-pressed={enabled}
      className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-amber-100/70 active:scale-95"
    >
      {enabled ? (
        <Volume2 className="h-5 w-5" />
      ) : (
        <VolumeX className="h-5 w-5 text-zinc-400" />
      )}
    </button>
  );
}
