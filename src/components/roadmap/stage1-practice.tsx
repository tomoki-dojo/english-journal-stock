"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ChevronDown, PartyPopper, PenLine, Volume2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { RoundHeader } from "./round-header";
import { GrowthBadge } from "./growth-badge";
import { GrowingKuwagataPanel } from "./growing-kuwagata-panel";
import { STAGE_COLORS, withAlpha } from "./stage-colors";
import { TappableText } from "./tappable-text";
import {
  parseStage1Scene,
  STAGE1_SCENE_OPTIONS,
  type Stage1RoundQuestion,
  type Stage1RoundResponse,
  type Stage1Scene,
  type WarmthLevel,
} from "./types";

type ViewState = "loading" | "round" | "round_complete" | "done" | "error";

type QuestionResult = {
  expressionId: string;
  expressionEn: string;
  correct: boolean;
  graduated: boolean;
  stage2JustUnlocked: boolean;
};

const STAGE_COLOR = STAGE_COLORS[1];
// 選んだシーンを次回以降も覚えておく（端末ごとの軽い便宜のため、失敗しても動作には影響させない）
const SCENE_STORAGE_KEY = "roadmap-stage1-scene";
// warmth（0〜3）に応じて、フレーズカードの縁・背景にStage1カラーをうっすら重ねる度合い。
const WARMTH_BORDER_ALPHA: Record<WarmthLevel, string> = {
  0: "00",
  1: "33",
  2: "55",
  3: "80",
};
const WARMTH_BG_ALPHA: Record<WarmthLevel, string> = {
  0: "00",
  1: "0a",
  2: "12",
  3: "1a",
};

// ラウンド終了時のキラキラ演出用。カード上部に沿って10個の粒を散らし、
// それぞれ少し上・斜めに飛んでフェードする（位置・角度は固定・決定的）。
const RESULT_SPARKLES = Array.from({ length: 10 }).map((_, i) => {
  const left = 6 + i * 9;
  const x = (i % 2 === 0 ? 1 : -1) * (8 + (i % 3) * 6);
  const y = -(20 + (i % 4) * 10);
  return {
    left,
    x,
    y,
    delay: (i % 5) * 0.05,
    warm: i % 2 === 0,
    large: i % 3 === 0,
  };
});

// Stage1（音読・シャドーイング）の練習画面。
// アクティブセット（未卒業フレーズの先頭7件）から5件ランダムに出題する「ラウンド」単位で進行する。
// 1問終わるごとに次のフレーズに切り替わるので、1フレーズを卒業するまで固定、という単調さを避ける。
// AIによる正誤判定はせず、「言えた/言えなかった」の自己申告で進める。
export function Stage1Practice() {
  const [state, setState] = useState<ViewState>("loading");
  const [questions, setQuestions] = useState<Stage1RoundQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<QuestionResult[]>([]);
  const [audioLoading, setAudioLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reaction, setReaction] = useState<"happy" | "sad" | null>(null);
  const [scene, setScene] = useState<Stage1Scene | null>(null);

  const currentQuestion = questions[currentIndex];

  async function loadRound(sceneArg: Stage1Scene | null = scene) {
    setState("loading");
    setCurrentIndex(0);
    setResults([]);
    setError(null);

    try {
      const sceneQuery = sceneArg ? `?scene=${encodeURIComponent(sceneArg)}` : "";
      const res = await fetch(`/api/roadmap/stage1/round${sceneQuery}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error("出題データの取得に失敗しました");
      const json: Stage1RoundResponse = await res.json();

      if (json.status === "done") {
        setQuestions([]);
        setState("done");
        return;
      }

      setQuestions(json.questions);
      setState("round");
    } catch (err) {
      setError(err instanceof Error ? err.message : "出題データの取得に失敗しました");
      setState("error");
    }
  }

  useEffect(() => {
    let saved: Stage1Scene | null = null;
    try {
      saved = parseStage1Scene(window.localStorage.getItem(SCENE_STORAGE_KEY));
    } catch {
      // 保存値が読めなくても「すべて」で続行する
    }
    setScene(saved);
    loadRound(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePlayAudio() {
    if (!currentQuestion || !currentQuestion.hasAudio || audioLoading) return;
    setAudioLoading(true);
    try {
      const res = await fetch(
        `/api/roadmap/stage1/audio?expressionId=${encodeURIComponent(currentQuestion.expressionId)}${
          scene ? `&scene=${encodeURIComponent(scene)}` : ""
        }`,
      );
      if (!res.ok) throw new Error("音声の取得に失敗しました");
      const json = await res.json();
      new Audio(json.url).play().catch(() => {});
    } catch {
      // 音声取得に失敗しても練習自体は続行できる
    } finally {
      setAudioLoading(false);
    }
  }

  async function handleReport(correct: boolean) {
    if (!currentQuestion || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/roadmap/stage1/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expressionId: currentQuestion.expressionId,
          correct,
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "結果の保存に失敗しました");
      }
      const json = await res.json();

      setReaction(correct ? "happy" : "sad");
      setTimeout(() => setReaction(null), 1100);

      setResults((prev) => [
        ...prev,
        {
          expressionId: currentQuestion.expressionId,
          expressionEn: currentQuestion.expressionEn,
          correct,
          graduated: Boolean(json.result?.graduated),
          stage2JustUnlocked: Boolean(json.result?.stage2JustUnlocked),
        },
      ]);

      if (currentIndex + 1 < questions.length) {
        setCurrentIndex((i) => i + 1);
      } else {
        setState("round_complete");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "結果の保存に失敗しました");
    } finally {
      setSubmitting(false);
    }
  }

  function handleSelectScene(next: Stage1Scene | null) {
    if (next === scene) return;
    setScene(next);
    try {
      if (next) window.localStorage.setItem(SCENE_STORAGE_KEY, next);
      else window.localStorage.removeItem(SCENE_STORAGE_KEY);
    } catch {
      // 保存できなくても練習は続けられる
    }
    loadRound(next);
  }

  // シーン選択（「すべて」＋12シーン）。1行のセレクトに畳んで、スマホでも縦に長くならないようにしている。
  const sceneSelector = (
    <div className="mb-3 sm:mb-4">
      <label className="relative inline-flex max-w-full items-center">
        <span className="sr-only">シーン</span>
        <select
          value={scene ?? ""}
          onChange={(e) => handleSelectScene(parseStage1Scene(e.target.value))}
          className="max-w-full appearance-none truncate rounded-full py-1.5 pl-3 pr-8 text-xs font-bold text-white sm:py-2 sm:pl-4 sm:pr-9 sm:text-sm shadow-sm outline-none transition-all duration-150 active:scale-[.97]"
          style={{ backgroundColor: STAGE_COLOR }}
        >
          <option value="">すべてのシーン</option>
          {STAGE1_SCENE_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-white sm:right-3 sm:h-4 sm:w-4" />
      </label>
    </div>
  );

  if (state === "loading") {
    return (
      <div>
        {sceneSelector}
        <p className="text-sm text-zinc-400">読み込み中...</p>
      </div>
    );
  }

  if (state === "error") {
    return <p className="text-sm text-red-600">{error ?? "エラーが発生しました"}</p>;
  }

  if (state === "done") {
    return (
      <div>
        {sceneSelector}
        <div className="rounded-xl border border-zinc-200 bg-zinc-100/50 px-6 py-10 text-center">
          <PartyPopper className="mx-auto mb-3 h-6 w-6" style={{ color: STAGE_COLOR }} />
          <p className="text-sm text-zinc-700">
            {scene ? `「${scene}」のStage1は全て習得しました。` : "Stage1（音読・シャドーイング）は全て習得しました。"}
          </p>
          <Link
            href="/roadmap"
            className="mt-4 inline-flex items-center gap-1 rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400"
          >
            部屋に戻る
          </Link>
        </div>
      </div>
    );
  }

  if (state === "round_complete") {
    const correctCount = results.filter((r) => r.correct).length;
    const graduated = results.filter((r) => r.graduated);
    const stage2JustUnlocked = results.some((r) => r.stage2JustUnlocked);

    return (
      <div className="relative overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100/50 p-6 text-center animate-round-complete-pop">
        {RESULT_SPARKLES.map((s, i) => (
          <span
            key={i}
            className={cn(
              "absolute top-3 rounded-full animate-round-complete-sparkle",
              s.large ? "h-2 w-2" : "h-1.5 w-1.5",
            )}
            style={
              {
                left: `${s.left}%`,
                backgroundColor: s.warm ? STAGE_COLOR : "#fbbf24",
                animationDelay: `${s.delay}s`,
                "--sparkle-x": `${s.x}px`,
                "--sparkle-y": `${s.y}px`,
              } as React.CSSProperties
            }
          />
        ))}

        <PartyPopper className="relative mx-auto mb-3 h-6 w-6" style={{ color: STAGE_COLOR }} />
        <p className="relative text-sm font-medium text-zinc-900">
          今回のラウンド：{results.length}問中{correctCount}問「言えた」
        </p>

        {graduated.length > 0 && (
          <div className="mt-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-left text-sm text-emerald-800">
            <p className="mb-1 font-medium">習得したフレーズ</p>
            <ul className="space-y-0.5">
              {graduated.map((r) => (
                <li key={r.expressionId}>{r.expressionEn}</li>
              ))}
            </ul>
          </div>
        )}

        {graduated.length > 0 && <GrowingKuwagataPanel />}

        {stage2JustUnlocked && (
          // Stage2の解放条件（アクティブセットが7件に届く）を、このラウンドでちょうど満たした瞬間。
          // 箱庭ビジュアル実装（#150）までは簡易なバナーとして示す。
          <div
            className="relative mt-4 overflow-hidden rounded-lg border p-3 text-left text-sm animate-round-complete-pop"
            style={{
              borderColor: withAlpha(STAGE_COLORS[2], "55"),
              backgroundColor: withAlpha(STAGE_COLORS[2], "14"),
            }}
          >
            <div className="flex items-center gap-1.5 font-semibold" style={{ color: STAGE_COLORS[2] }}>
              <PenLine className="h-4 w-4" />
              Stage2が解放されました！
            </div>
          </div>
        )}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => loadRound()}
            style={{ backgroundColor: STAGE_COLOR }}
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-all duration-150 hover:opacity-90 active:scale-[.97]"
          >
            もう1ラウンド
          </button>
          <Link
            href="/roadmap"
            className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400"
          >
            部屋に戻る
          </Link>
        </div>
      </div>
    );
  }

  if (!currentQuestion) {
    return <p className="text-sm text-zinc-400">読み込み中...</p>;
  }

  const hasTint = currentQuestion.warmth > 0;

  return (
    <div>
      {sceneSelector}
      <RoundHeader stage={1} current={currentIndex + 1} total={questions.length} arthurMood={reaction ?? "talk"} />

      <div
        key={currentIndex}
        className={cn(
          "animate-question-card-enter rounded-xl border p-6",
          hasTint ? "" : "border-zinc-200 bg-zinc-100/50",
        )}
        style={
          hasTint
            ? {
                borderColor: withAlpha(STAGE_COLOR, WARMTH_BORDER_ALPHA[currentQuestion.warmth]),
                backgroundColor: withAlpha(STAGE_COLOR, WARMTH_BG_ALPHA[currentQuestion.warmth]),
              }
            : undefined
        }
      >
        {currentQuestion.hasAudio && (
          <p className="mb-1.5 text-[10px] leading-tight text-zinc-400 sm:mb-3 sm:text-xs sm:leading-normal">
            音声を真似して声に出す→一緒に言う→少し遅れて言う、と徐々にレベルを上げてみましょう。
          </p>
        )}

        <div className="mb-1 flex items-center gap-2">
          <GrowthBadge stage={1} warmth={currentQuestion.warmth} />
          <TappableText
            text={currentQuestion.expressionEn}
            accentColor={STAGE_COLOR}
            className="text-lg font-medium text-zinc-900"
          />
        </div>
        {currentQuestion.meaningJa && <p className="mb-4 text-sm text-zinc-500">{currentQuestion.meaningJa}</p>}

        {currentQuestion.hasAudio && (
          <button
            type="button"
            onClick={handlePlayAudio}
            disabled={audioLoading}
            className="mb-4 inline-flex items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700 transition-colors hover:border-zinc-400 disabled:opacity-50"
          >
            <Volume2 className="h-4 w-4" />
            {audioLoading ? "読み込み中..." : "音声を聴く"}
          </button>
        )}

        <div className="flex gap-2 sm:gap-3">
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleReport(true)}
            style={{ backgroundColor: STAGE_COLOR }}
            className="flex flex-1 scale-100 items-center justify-center gap-1 whitespace-nowrap rounded-lg px-2 py-2 text-xs font-semibold text-white sm:gap-1.5 sm:px-4 sm:py-2.5 sm:text-sm transition-all duration-150 hover:opacity-90 active:scale-[.97] disabled:opacity-50"
          >
            <Check className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            言えた
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => handleReport(false)}
            className="flex flex-1 scale-100 items-center justify-center gap-1 whitespace-nowrap rounded-lg border border-zinc-300 bg-white px-2 py-2 text-xs font-medium sm:gap-1.5 sm:px-4 sm:py-2.5 sm:text-sm text-zinc-600 transition-all duration-150 hover:border-zinc-400 active:scale-[.97] disabled:opacity-50"
          >
            <X className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
            言えなかった
          </button>
        </div>
        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      </div>
    </div>
  );
}
