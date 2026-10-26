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
import { setAudioVolume, unlockAudio } from "@/lib/audio-volume";

// ロードマップ共通のサウンド（BGM・タップ音）。音源は public/roadmap/sound/ に置くだけで鳴る
// （ファイルが無い間は何も鳴らず、エラーも出さない）。ファイル名は brand/kuwagata-asset-spec.md 参照。
const BGM_SRC = "/roadmap/sound/bgm_room.mp3";
const TAP_SRC = "/roadmap/sound/se_tap.mp3";
const BGM_VOLUME = 0.2;
const TAP_VOLUME = 0.07;
const PAGE_SRC = "/roadmap/sound/se_page.mp3";
const PAGE_VOLUME = 0.25;
const MINIGAME_BGM_SRC = "/roadmap/sound/bgm_minigame.mp3";
const MINIGAME_BGM_VOLUME = 0.3;
// 単語ノートのテスト中のBGM（テストが始まってから結果が出るまで）。
const QUIZ_BGM_SRC = "/roadmap/sound/bgm_notebook.mp3";
const QUIZ_BGM_VOLUME = 0.4;
const STAGE_BGM_SRC = "/roadmap/sound/bgm_stage.mp3";
const STAGE_BGM_VOLUME = 0.13;
// Stage3〜5は音声入力でマイクを使うので、聞き取り中だけBGMをほぼ消す（BGMがマイクに入って認識を邪魔しないように）。
// 音量の段階（1〜3）に関わらず、同じ極小の音量に下げる（段階2の通常音量の約4%）。
const MIC_DUCK_VOLUME = 0.004;
const MINIGAME_SE_SRC = "/roadmap/sound/se_minigame.mp3";
const MINIGAME_SE_VOLUME = 0.25;
const FANFARE_SRC = "/roadmap/sound/se_fanfare.mp3";
const FANFARE_VOLUME = 0.14;
const GROWTH_SRC = "/roadmap/sound/se_growth.mp3";
const GROWTH_VOLUME = 0.085;
const GET_SRC = "/roadmap/sound/se_get.mp3";
const GET_VOLUME = 0.15;
const STORAGE_KEY = "roadmap_sound_level";
const LEGACY_STORAGE_KEY = "roadmap_sound_enabled"; // 旧: ON/OFFのみ。"0"ならミュートとして引き継ぐ。

// 音量は 0=ミュート / 1 / 2 / 3 の4段階。上の各音量(BGM_VOLUMEなど)は基準値で、段階ごとに倍率をかける(1=0.5倍、3=2.5倍、2はその中間)。
// 最大の2.5倍は、最も大きい基準値(単語ノートのBGM 0.4)がちょうど上限1になる値。これ以上にすると音の大きさの比が崩れる。
export const SOUND_MAX_LEVEL = 3;
const DEFAULT_LEVEL = 2;
const LEVEL_FACTORS = [0, 0.5, 1.5, 2.5];

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
  setQuizActive: (active: boolean) => void;
  setMicActive: (active: boolean) => void;
  playMinigameSe: () => void;
  playFanfare: () => void;
  playGrowth: () => void;
  playGet: () => void;
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
      setAudioVolume(tapRef.current, TAP_VOLUME * LEVEL_FACTORS[levelRef.current]);
      tapRef.current.currentTime = 0;
      void tapRef.current.play().catch(() => {});
    };
    // iPhoneは音量をWeb Audio経由で変えるため、タップの中で再開しておく(touchend/clickでないと効かない端末がある)。
    const unlock = () => unlockAudio();
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("touchend", unlock, true);
    document.addEventListener("click", unlock, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("touchend", unlock, true);
      document.removeEventListener("click", unlock, true);
    };
  }, []);

  // 図鑑のページをめくる音
  const pageRef = useRef<HTMLAudioElement | null>(null);
  const playPage = useCallback(() => {
    if (!enabledRef.current) return;
    if (!pageRef.current) {
      pageRef.current = new Audio(PAGE_SRC);
    }
    setAudioVolume(pageRef.current, PAGE_VOLUME * LEVEL_FACTORS[levelRef.current]);
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
    setAudioVolume(audio, MINIGAME_BGM_VOLUME * LEVEL_FACTORS[level]);
    if (shouldPlay) {
      void audio.play().catch(() => {});
    } else {
      audio.pause();
      audio.currentTime = 0;
    }
  }, [enabled, level, interacted, minigameActive]);

  // 単語ノートのテスト中のBGM：テスト中は他のBGMを止めて、こちらを頭から流す。
  const [quizActive, setQuizActive] = useState(false);
  const quizBgmRef = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const shouldPlay = enabled && interacted && quizActive && !minigameActive;
    if (!quizBgmRef.current) {
      if (!shouldPlay) return;
      const audio = new Audio(QUIZ_BGM_SRC);
      audio.loop = true;
      quizBgmRef.current = audio;
    }
    const audio = quizBgmRef.current;
    setAudioVolume(audio, QUIZ_BGM_VOLUME * LEVEL_FACTORS[level]);
    if (shouldPlay) {
      void audio.play().catch(() => {});
    } else {
      audio.pause();
      if (!quizActive) audio.currentTime = 0;
    }
  }, [enabled, level, interacted, quizActive, minigameActive]);

  // いま流すべき曲の種類。曲の種類が切り替わったとき、前の曲は止めて頭に戻す（次に戻ってきたら最初から）。
  // 表現一覧（街の掲示板）と単語ノートは、Stage練習と同じ曲を流す。
  const activeTrack: "minigame" | "quiz" | "stage" | "room" | null = minigameActive
    ? "minigame"
    : quizActive
      ? "quiz"
      : pathname.startsWith("/roadmap/stage") || pathname === "/roadmap/board" || pathname.startsWith("/roadmap/notebook")
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
    setAudioVolume(audio, micActive ? Math.min(normal, MIC_DUCK_VOLUME) : normal);
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
    setAudioVolume(audio, MINIGAME_SE_VOLUME * LEVEL_FACTORS[levelRef.current]);
    void audio.play().catch(() => {});
  }, []);

  // 解放・獲得などのお祝いで鳴らすファンファーレ。
  const playFanfare = useCallback(() => {
    if (!enabledRef.current) return;
    const audio = new Audio(FANFARE_SRC);
    setAudioVolume(audio, FANFARE_VOLUME * LEVEL_FACTORS[levelRef.current]);
    void audio.play().catch(() => {});
  }, []);

  // クワたんの成長段階が上がったときの効果音。
  const playGrowth = useCallback(() => {
    if (!enabledRef.current) return;
    const audio = new Audio(GROWTH_SRC);
    setAudioVolume(audio, GROWTH_VOLUME * LEVEL_FACTORS[levelRef.current]);
    void audio.play().catch(() => {});
  }, []);

  // タマゴやレアなクワたんを手に入れたときの効果音。
  const playGet = useCallback(() => {
    if (!enabledRef.current) return;
    const audio = new Audio(GET_SRC);
    setAudioVolume(audio, GET_VOLUME * LEVEL_FACTORS[levelRef.current]);
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
    setAudioVolume(audio, BGM_VOLUME * LEVEL_FACTORS[level]);
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
      quizBgmRef.current?.pause();
    };
  }, []);

  return (
    <SoundContext.Provider value={{ level, setLevel, playPage, setMinigameActive, setQuizActive, setMicActive, playMinigameSe, playFanfare, playGrowth, playGet }}>
      {children}
    </SoundContext.Provider>
  );
}

// ミュート中(音量0)かどうか。音声(例文・つぶやき)の再生側が、鳴らす前に見る。
// サウンドの外(ロードマップ以外の画面)では常にfalse。
export function useSoundMuted(): boolean {
  const ctx = useContext(SoundContext);
  return ctx ? ctx.level === 0 : false;
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

// 単語ノートのテスト中だけ true を渡す。テスト用のBGMを流す。
export function useQuizBgm(active: boolean) {
  const setActive = useContext(SoundContext)?.setQuizActive;
  useEffect(() => {
    if (!setActive) return;
    setActive(active);
    return () => setActive(false);
  }, [setActive, active]);
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

// お祝いのファンファーレを鳴らす関数を返す。
export function useFanfare() {
  return useContext(SoundContext)?.playFanfare ?? (() => {});
}

// 成長段階が上がったときの効果音を鳴らす関数を返す。
export function useGrowthSe() {
  return useContext(SoundContext)?.playGrowth ?? (() => {});
}

// 「手に入れた！」の効果音を、置かれた瞬間に1回鳴らす（何も描画しない）。
export function GetSeOnMount() {
  const playGet = useContext(SoundContext)?.playGet;
  useEffect(() => {
    playGet?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
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
        className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-600 sm:h-8 sm:w-8 transition-colors hover:bg-amber-100/70 active:scale-95"
      >
        <Icon className={`h-4 w-4 sm:h-5 sm:w-5 ${level === 0 ? "text-zinc-400" : ""}`} />
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
        className="relative flex h-6 w-20 cursor-pointer sm:h-8 touch-none select-none items-center"
      >
        <div className="relative h-4 w-full sm:h-5">
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
