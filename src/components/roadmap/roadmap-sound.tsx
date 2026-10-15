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
import { Volume1, Volume2, VolumeX } from "lucide-react";

// ロードマップ共通のサウンド（BGM・タップ音）。音源は public/roadmap/sound/ に置くだけで鳴る
// （ファイルが無い間は何も鳴らず、エラーも出さない）。ファイル名は brand/kuwagata-asset-spec.md 参照。
const BGM_SRC = "/roadmap/sound/bgm_room.mp3";
const TAP_SRC = "/roadmap/sound/se_tap.mp3";
const BGM_VOLUME = 0.15;
const TAP_VOLUME = 0.05;
const PAGE_SRC = "/roadmap/sound/se_page.mp3";
const PAGE_VOLUME = 0.2;
const MINIGAME_BGM_SRC = "/roadmap/sound/bgm_minigame.mp3";
const MINIGAME_BGM_VOLUME = 0.25;
const STAGE_BGM_SRC = "/roadmap/sound/bgm_stage.mp3";
const STAGE_BGM_VOLUME = 0.1;
// Stage3〜5は音声入力でマイクを使うので、聞き取り中だけBGMをほぼ消す（BGMがマイクに入って認識を邪魔しないように）。
// 音量の段階（1〜3）に関わらず、同じ極小の音量に下げる（段階2の通常音量の約4%）。
const MIC_DUCK_VOLUME = 0.004;
const MINIGAME_SE_SRC = "/roadmap/sound/se_minigame.mp3";
const MINIGAME_SE_VOLUME = 0.35;
const STORAGE_KEY = "roadmap_sound_level";
const LEGACY_STORAGE_KEY = "roadmap_sound_enabled"; // 旧: ON/OFFのみ。"0"ならミュートとして引き継ぐ。

// 音量は 0=ミュート / 1 / 2 / 3 の4段階。上の各音量(BGM_VOLUMEなど)は「2」のときの値で、段階ごとに倍率をかける。
export const SOUND_MAX_LEVEL = 3;
const DEFAULT_LEVEL = 2;
const LEVEL_FACTORS = [0, 0.5, 1, 1.8];

// BGMを流す画面（部屋・棚・図鑑）。Stageの練習画面などでは止める。
const BGM_PATHS = new Set([
  "/roadmap",
  "/roadmap/shelf",
  "/roadmap/encyclopedia",
]);

type SoundContextValue = {
  level: number;
  setLevel: (level: number) => void;
  playPage: () => void;
  setMinigameActive: (active: boolean) => void;
  setMicActive: (active: boolean) => void;
  playMinigameSe: () => void;
};
const SoundContext = createContext<SoundContextValue | null>(null);

export function RoadmapSoundProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [level, setLevelState] = useState(DEFAULT_LEVEL);
  const enabled = level > 0;
  const [interacted, setInteracted] = useState(false);
  const bgmRef = useRef<HTMLAudioElement | null>(null);
  const tapRef = useRef<HTMLAudioElement | null>(null);
  const bgmMissing = useRef(false);
  const tapMissing = useRef(false);
  const levelRef = useRef(DEFAULT_LEVEL);
  const enabledRef = useRef(true);

  // 保存された音量を読み込む（既定は2。旧設定でOFFだった人はミュート）
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved !== null) {
        const n = Number(saved);
        if (Number.isInteger(n) && n >= 0 && n <= SOUND_MAX_LEVEL) setLevelState(n);
      } else if (localStorage.getItem(LEGACY_STORAGE_KEY) === "0") {
        setLevelState(0);
      }
    } catch {
      // localStorageが使えない環境ではメモリ上の状態のみ
    }
  }, []);

  useEffect(() => {
    levelRef.current = level;
    enabledRef.current = level > 0;
  }, [level]);

  const setLevel = useCallback((next: number) => {
    const clamped = Math.min(SOUND_MAX_LEVEL, Math.max(0, Math.round(next)));
    setLevelState(clamped);
    try {
      localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {
      // 無視
    }
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
        audio.addEventListener("error", () => {
          tapMissing.current = true;
        });
        tapRef.current = audio;
      }
      tapRef.current.volume = Math.min(1, TAP_VOLUME * LEVEL_FACTORS[levelRef.current]);
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
      pageRef.current = new Audio(PAGE_SRC);
    }
    pageRef.current.volume = Math.min(1, PAGE_VOLUME * LEVEL_FACTORS[levelRef.current]);
    pageRef.current.currentTime = 0;
    void pageRef.current.play().catch(() => {});
  }, []);

  // ミニゲームのBGM：ミニゲーム中は部屋のBGMを止めて、こちらを頭から流す。
  const [minigameActive, setMinigameActive] = useState(false);
  const minigameBgmRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const shouldPlay = enabled && interacted && minigameActive;
    if (!minigameBgmRef.current) {
      if (!shouldPlay) return;
      const audio = new Audio(MINIGAME_BGM_SRC);
      audio.loop = true;
      minigameBgmRef.current = audio;
    }
    const audio = minigameBgmRef.current;
    audio.volume = Math.min(1, MINIGAME_BGM_VOLUME * LEVEL_FACTORS[level]);
    if (shouldPlay) {
      void audio.play().catch(() => {});
    } else {
      audio.pause();
      audio.currentTime = 0;
    }
  }, [enabled, level, interacted, minigameActive]);

  // いま流すべき曲の種類。曲の種類が切り替わったとき、前の曲は止めて頭に戻す（次に戻ってきたら最初から）。
  // 表現一覧（街の掲示板）はStage練習と同じ曲を流す。
  const activeTrack: "minigame" | "stage" | "room" | null = minigameActive
    ? "minigame"
    : pathname.startsWith("/roadmap/stage") || pathname === "/roadmap/board"
      ? "stage"
      : BGM_PATHS.has(pathname)
        ? "room"
        : null;

  // 聞き取り（マイク）中は、Stageの練習BGMをほぼ消す。
  const [micActive, setMicActive] = useState(false);

  // Stage練習画面のBGM：Stage1・2は普通に、Stage3〜5は聞き取り中だけ極小。ページ移動をまたいでも途切れない。
  const stageBgmRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const shouldPlay = enabled && interacted && activeTrack === "stage";
    if (!stageBgmRef.current) {
      if (!shouldPlay) return;
      const audio = new Audio(STAGE_BGM_SRC);
      audio.loop = true;
      stageBgmRef.current = audio;
    }
    const audio = stageBgmRef.current;
    const normal = STAGE_BGM_VOLUME * LEVEL_FACTORS[level];
    audio.volume = Math.min(1, micActive ? Math.min(normal, MIC_DUCK_VOLUME) : normal);
    if (shouldPlay) {
      void audio.play().catch(() => {});
    } else {
      audio.pause();
      if (activeTrack !== "stage") audio.currentTime = 0;
    }
  }, [enabled, level, interacted, micActive, activeTrack]);

  // ミニゲームで答えを選んだときの効果音（連打でも重なって鳴るよう、毎回新しく鳴らす）。
  const playMinigameSe = useCallback(() => {
    if (!enabledRef.current) return;
    const audio = new Audio(MINIGAME_SE_SRC);
    audio.volume = Math.min(1, MINIGAME_SE_VOLUME * LEVEL_FACTORS[levelRef.current]);
    void audio.play().catch(() => {});
  }, []);

  // BGM：部屋・棚・図鑑でだけ、ONかつ最初のタップ後に流す。ページ移動をまたいでも途切れない。
  useEffect(() => {
    const shouldPlay = enabled && interacted && activeTrack === "room";

    if (!bgmRef.current) {
      if (!shouldPlay || bgmMissing.current) return;
      const audio = new Audio(BGM_SRC);
      audio.loop = true;
      audio.addEventListener("error", () => {
        bgmMissing.current = true;
      });
      bgmRef.current = audio;
    }

    const audio = bgmRef.current;
    audio.volume = Math.min(1, BGM_VOLUME * LEVEL_FACTORS[level]);
    if (shouldPlay) {
      void audio.play().catch(() => {});
    } else {
      audio.pause();
      if (activeTrack !== "room") audio.currentTime = 0;
    }
  }, [enabled, level, interacted, activeTrack]);

  useEffect(() => {
    return () => {
      bgmRef.current?.pause();
      minigameBgmRef.current?.pause();
      stageBgmRef.current?.pause();
    };
  }, []);

  return (
    <SoundContext.Provider value={{ level, setLevel, playPage, setMinigameActive, setMicActive, playMinigameSe }}>
      {children}
    </SoundContext.Provider>
  );
}

export function usePagePlayer() {
  return useContext(SoundContext)?.playPage ?? (() => {});
}

// ミニゲームの画面が出ている間だけ、ミニゲームのBGMを流す（説明の表示から終了まで）。
export function useMinigameBgm() {
  const setActive = useContext(SoundContext)?.setMinigameActive;
  useEffect(() => {
    if (!setActive) return;
    setActive(true);
    return () => setActive(false);
  }, [setActive]);
}

// 音声入力で聞き取り中の間だけ true を渡す。Stage練習のBGMをほぼ消す。
export function useBgmDuck(listening: boolean) {
  const setMic = useContext(SoundContext)?.setMicActive;
  useEffect(() => {
    if (!setMic) return;
    setMic(listening);
    return () => setMic(false);
  }, [setMic, listening]);
}

// ミニゲームで答えを選んだときの効果音を鳴らす関数を返す。
export function useMinigameSe() {
  return useContext(SoundContext)?.playMinigameSe ?? (() => {});
}

// 画面上部に置く音量コントロール。スピーカーをタップでミュート⇔元の音量、右の三角形（くさび形）を
// スワイプ／タップで 0(ミュート)・1・2・3 の4段階に切り替える。左端まで滑らせるとミュート。
export function SoundToggleButton() {
  const ctx = useContext(SoundContext);
  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  const lastLevelRef = useRef(DEFAULT_LEVEL);
  const level = ctx?.level ?? 0;
  const setLevel = ctx?.setLevel;

  useEffect(() => {
    if (level > 0) lastLevelRef.current = level;
  }, [level]);

  if (!ctx || !setLevel) return null;

  function levelFromX(clientX: number): number {
    const el = trackRef.current;
    if (!el) return level;
    const rect = el.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    if (f < 0.12) return 0;
    return Math.min(SOUND_MAX_LEVEL, Math.max(1, Math.ceil(f * SOUND_MAX_LEVEL)));
  }

  const Icon = level === 0 ? VolumeX : level === 1 ? Volume1 : Volume2;
  const wedge = "polygon(0 100%, 100% 100%, 100% 0)";

  return (
    <div data-sound-toggle className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => setLevel(level > 0 ? 0 : lastLevelRef.current)}
        aria-label={level > 0 ? "音をミュートにする" : "ミュートを解除する"}
        className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-amber-100/70 active:scale-95"
      >
        <Icon className={`h-5 w-5 ${level === 0 ? "text-zinc-400" : ""}`} />
      </button>
      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label="音量"
        aria-valuemin={0}
        aria-valuemax={SOUND_MAX_LEVEL}
        aria-valuenow={level}
        aria-valuetext={level === 0 ? "ミュート" : `音量${level}`}
        onPointerDown={(e) => {
          draggingRef.current = true;
          e.currentTarget.setPointerCapture(e.pointerId);
          setLevel?.(levelFromX(e.clientX));
        }}
        onPointerMove={(e) => {
          if (draggingRef.current) setLevel?.(levelFromX(e.clientX));
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        onPointerCancel={() => {
          draggingRef.current = false;
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") setLevel?.(level + 1);
          else if (e.key === "ArrowLeft" || e.key === "ArrowDown") setLevel?.(level - 1);
        }}
        className="relative flex h-8 w-20 cursor-pointer touch-none select-none items-center"
      >
        <div className="relative h-5 w-full">
          <div className="absolute inset-0 bg-zinc-200" style={{ clipPath: wedge }} />
          <div
            className="absolute inset-y-0 left-0 overflow-hidden transition-[width] duration-150"
            style={{ width: `${(level / SOUND_MAX_LEVEL) * 100}%` }}
          >
            <div className="absolute inset-y-0 left-0 bg-amber-500" style={{ clipPath: wedge, width: "5rem" }} />
          </div>
        </div>
      </div>
    </div>
  );
}
