"use client";

import { useEffect, useRef, useState } from "react";
import { CatchArthurRun, CatchArthurTalk, SWING_TOTAL_MS } from "./catch-arthur-run";
import type { KuwagataAreaCode } from "@/lib/supabase/kuwagata";

type Question = { word: string; choices: string[] };
type StartResponse = { sessionId: string; questions: Question[]; durationSec: number };

const COUNTDOWN_FROM = 3;

// カウントダウン「3→2→1→GO!」。だんだん大きく、派手な色になる(count=0がGO!)。
const COUNTDOWN_STYLE: Record<number, { label: string; size: string; gradient: string; glow: string }> = {
  3: { label: "3", size: "clamp(7rem, 38vw, 10rem)", gradient: "linear-gradient(180deg,#e0f2fe 0%,#38bdf8 55%,#0ea5e9 100%)", glow: "#38bdf8" },
  2: { label: "2", size: "clamp(8.5rem, 46vw, 12.5rem)", gradient: "linear-gradient(180deg,#fef9c3 0%,#facc15 50%,#f59e0b 100%)", glow: "#facc15" },
  1: { label: "1", size: "clamp(10rem, 56vw, 15rem)", gradient: "linear-gradient(180deg,#ffe4e6 0%,#fb7185 50%,#e11d48 100%)", glow: "#fb7185" },
  0: { label: "GO!", size: "clamp(7rem, 40vw, 11rem)", gradient: "linear-gradient(180deg,#fef08a 0%,#fb923c 45%,#ef4444 100%)", glow: "#f97316" },
};
const GO_MS = 700;

// 採集ミニゲーム「10秒単語チャレンジ」。説明(暗転)→OK→3秒カウントダウン→10秒で英単語→日本語の4択にどんどん答える。
// 正解の判定と採集確率のブーストはサーバーで行うので、ここでは選んだ選択肢の番号を記録して返すだけ。
// 背景は /roadmap/minigame/bg_{エリア}.png を置くと反映される(無ければ暗い背景のまま)。
export function KuwagataWordChallenge({
  areaCode,
  onFinish,
  onCancel,
}: {
  areaCode: KuwagataAreaCode;
  onFinish: (sessionId: string, answers: number[]) => void;
  onCancel: () => void;
}) {
  const [phase, setPhase] = useState<"intro" | "loading" | "countdown" | "playing" | "swing">("intro");
  const [error, setError] = useState<string | null>(null);
  const [count, setCount] = useState(COUNTDOWN_FROM);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [remainingMs, setRemainingMs] = useState(0);
  const sessionRef = useRef<StartResponse | null>(null);
  const answersRef = useRef<number[]>([]);
  const finishedRef = useRef(false);
  const finishTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 振り下ろし演出の待ち時間タイマーは、画面を離れるときだけ止める。
  useEffect(() => () => {
    if (finishTimerRef.current) clearTimeout(finishTimerRef.current);
  }, []);

  async function handleStart() {
    setPhase("loading");
    setError(null);
    try {
      const res = await fetch("/api/roadmap/kuwagata/minigame/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areaCode }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "ミニゲームを始められませんでした");
        setPhase("intro");
        return;
      }
      sessionRef.current = json as StartResponse;
      setCount(COUNTDOWN_FROM);
      setPhase("countdown");
    } catch {
      setError("ミニゲームを始められませんでした。時間を置いて再度お試しください。");
      setPhase("intro");
    }
  }

  // カウントダウン(1秒ごと)
  useEffect(() => {
    if (phase !== "countdown") return;
    const timer = setTimeout(
      () => {
        if (count > 0) setCount(count - 1);
        else setPhase("playing");
      },
      count > 0 ? 1000 : GO_MS
    );
    return () => clearTimeout(timer);
  }, [phase, count]);

  // プレイ中の残り時間。0になったら回答を返して終了する。
  useEffect(() => {
    if (phase !== "playing") return;
    const session = sessionRef.current;
    if (!session) return;
    const durationMs = session.durationSec * 1000;
    const startedAt = performance.now();
    setRemainingMs(durationMs);
    const timer = setInterval(() => {
      const left = Math.max(0, durationMs - (performance.now() - startedAt));
      setRemainingMs(left);
      if (left <= 0 && !finishedRef.current) {
        finishedRef.current = true;
        clearInterval(timer);
        // 時間切れ: アーサーが網を振り下ろし、ホワイトアウトしてから結果へ。
        setPhase("swing");
        finishTimerRef.current = setTimeout(() => onFinish(session.sessionId, answersRef.current), SWING_TOTAL_MS);
      }
    }, 50);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  function handleChoose(choiceIndex: number) {
    const session = sessionRef.current;
    if (!session || finishedRef.current) return;
    answersRef.current[questionIndex] = choiceIndex;
    setQuestionIndex((i) => Math.min(i + 1, session.questions.length - 1));
  }

  const question = sessionRef.current?.questions[questionIndex];
  const durationMs = (sessionRef.current?.durationSec ?? 5) * 1000;

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-cover bg-center px-6 text-center"
      style={{ backgroundImage: `url(/roadmap/minigame/bg_${areaCode}.png)` }}
    >
      {/* 暗転は他の演出(CelebrationOverlay)と同じ暗さ */}
      <div className="absolute inset-0 bg-black/75" />
      {phase === "countdown" && <CatchArthurRun mode="far" />}
      {phase === "playing" && <CatchArthurRun mode="approach" durationSec={sessionRef.current?.durationSec ?? 10} />}
      {phase === "swing" && <CatchArthurRun mode="swing" />}
      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-6">
        {(phase === "intro" || phase === "loading") && (
          <>
            <CatchArthurTalk size={200} />
            <p className="text-xl font-bold leading-relaxed text-white">
              10秒で単語の意味をできるだけ沢山答えろ！
              <br />
              正解数が多いとレアな虫がゲットできるかも！？
            </p>
            {error && <p className="text-xs text-red-300">{error}</p>}
            <button
              type="button"
              onClick={handleStart}
              disabled={phase === "loading"}
              className="w-full rounded-full bg-amber-500 py-3 text-base font-bold text-white transition-transform active:scale-95 disabled:opacity-60"
            >
              OK
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="text-xs text-white/60 hover:text-white"
            >
              やめる
            </button>
          </>
        )}

        {phase === "countdown" && (
          <div className="relative flex h-64 w-full items-center justify-center">
            {/* 数字ごとに広がる光の輪 */}
            <span
              key={`ring-${count}`}
              className="catch-count-ring pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 rounded-full"
              style={{ borderColor: COUNTDOWN_STYLE[count].glow }}
            />
            <span
              key={count}
              className="catch-count-pop inline-block font-black italic leading-none"
              style={{
                fontSize: COUNTDOWN_STYLE[count].size,
                // 斜体・縁取りの外側までグラデーションを敷く(文字の右上が欠けるのを防ぐ)
                padding: "0.12em 0.25em",
                backgroundImage: COUNTDOWN_STYLE[count].gradient,
                WebkitBackgroundClip: "text",
                backgroundClip: "text",
                color: "transparent",
                WebkitTextStroke: "0.06em #1c1917",
                paintOrder: "stroke fill",
                filter: `drop-shadow(0 0 0.2em ${COUNTDOWN_STYLE[count].glow}) drop-shadow(0 0.06em 0 rgba(0,0,0,0.5))`,
              }}
            >
              {COUNTDOWN_STYLE[count].label}
            </span>
          </div>
        )}

        {phase === "playing" && question && (
          <>
            <div className="h-2 w-full overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-amber-400"
                style={{ width: `${(remainingMs / durationMs) * 100}%` }}
              />
            </div>
            <p className="text-4xl font-black tracking-wide text-white">{question.word}</p>
            <div className="grid w-full grid-cols-2 gap-3">
              {question.choices.map((choice, i) => (
                <button
                  key={`${questionIndex}-${i}`}
                  type="button"
                  onClick={() => handleChoose(i)}
                  className="rounded-2xl bg-white/90 px-2 py-4 text-base font-bold text-zinc-800 transition-transform active:scale-95"
                >
                  {choice}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
