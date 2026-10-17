"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { BookOpen, Check, X } from "lucide-react";
import { ShareButton } from "@/components/share-button";
import { useQuizBgm } from "./roadmap-sound";
import { GrowingKuwagataPanel } from "./growing-kuwagata-panel";
import { DIFFICULTY_STYLE, NOTEBOOK_DIFFICULTIES_UI, type NotebookDifficultyUi } from "./notebook-levels";

type Question = { word: string; exampleEn: string | null; choices: string[] };
type StartResponse = { sessionId: string; questions: Question[] };
type ResultItem = { word: string; meaning: string; exampleEn: string | null; exampleJa: string | null; correct: boolean };
type Feedback = { correct: boolean; correctIndex: number; meaning: string; exampleEn: string | null; exampleJa: string | null };
type FinishResponse = { correctCount: number; total: number; boostDays: number; capped: boolean; items: ResultItem[] };

export function NotebookQuiz() {
  const [phase, setPhase] = useState<"select" | "loading" | "playing" | "submitting" | "result">("select");
  const [error, setError] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<NotebookDifficultyUi | null>(null);
  const [index, setIndex] = useState(0);
  const [result, setResult] = useState<FinishResponse | null>(null);
  const roundRef = useRef<StartResponse | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);

  useQuizBgm(phase === "playing" || phase === "submitting");

  async function start(selected: NotebookDifficultyUi) {
    setDifficulty(selected);
    setPhase("loading");
    setError(null);
    try {
      const res = await fetch("/api/roadmap/notebook/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ difficulty: selected }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "始められませんでした");
        setPhase("select");
        return;
      }
      roundRef.current = json as StartResponse;
      setFeedback(null);
      setPicked(null);
      setIndex(0);
      setPhase("playing");
    } catch {
      setError("始められませんでした。時間を置いて再度お試しください。");
      setPhase("select");
    }
  }

  async function choose(choiceIndex: number) {
    const round = roundRef.current;
    if (!round || phase !== "playing" || feedback || checking) return;
    setChecking(true);
    setError(null);
    try {
      const res = await fetch("/api/roadmap/notebook/answer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: round.sessionId, index, choice: choiceIndex }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "答え合わせできませんでした");
        return;
      }
      setPicked(choiceIndex);
      setFeedback(json as Feedback);
    } catch {
      setError("答え合わせできませんでした。時間を置いて再度お試しください。");
    } finally {
      setChecking(false);
    }
  }

  async function next() {
    const round = roundRef.current;
    if (!round || !feedback) return;
    if (index + 1 < round.questions.length) {
      setFeedback(null);
      setPicked(null);
      setIndex(index + 1);
      return;
    }
    setPhase("submitting");
    try {
      const res = await fetch("/api/roadmap/notebook/finish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: round.sessionId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(typeof json.error === "string" ? json.error : "採点できませんでした");
        setPhase("select");
        return;
      }
      setResult(json as FinishResponse);
      setPhase("result");
    } catch {
      setError("採点できませんでした。時間を置いて再度お試しください。");
      setPhase("select");
    }
  }

  // 出題の取得中。レベル選択画面を出さずに、読み込み表示だけにする(「もう1ラウンド」直後に一瞬レベル選択が見えてしまうため)。
  if (phase === "loading") {
    return <p className="py-24 text-center text-sm font-semibold text-zinc-400">読み込み中…</p>;
  }

  if (phase === "select") {
    return (
      <div className="flex flex-col gap-3">
        {NOTEBOOK_DIFFICULTIES_UI.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => void start(d)}
            className={`rounded-2xl border-2 px-5 py-4 text-left transition-transform active:scale-95 disabled:opacity-60 ${DIFFICULTY_STYLE[d].className}`}
          >
            <span className="text-lg font-bold">難易度{d}</span>
            <span className="ml-2 text-xs opacity-70">{DIFFICULTY_STYLE[d].caption}</span>
          </button>
        ))}
        <Link
          href="/roadmap/notebook/words"
          className="mt-1 flex items-center justify-center gap-1.5 rounded-2xl border-2 border-zinc-300 bg-white px-5 py-3 text-sm font-bold text-zinc-600 transition-transform active:scale-95"
        >
          <BookOpen className="h-4 w-4" />
          単語一覧
        </Link>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  if (phase === "playing" || phase === "submitting") {
    const round = roundRef.current;
    const question = round?.questions[index];
    if (!round || !question) return null;
    return (
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-200">
            <div
              className="h-full rounded-full bg-amber-500 transition-all"
              style={{ width: `${(index / round.questions.length) * 100}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-zinc-500">
            {index + 1} / {round.questions.length}
          </span>
        </div>
        <div className="text-center">
          <p className="text-4xl font-black tracking-wide text-zinc-800">{question.word}</p>
          {question.exampleEn && <p className="mt-3 text-lg italic text-zinc-500">{question.exampleEn}</p>}
        </div>
        {/* ボタン幅は固定: 全単語の意味の最長(8文字=約9rem)＋左右の余白(チェックマーク用を含む3rem×2) */}
        <div className="grid grid-cols-[1fr_minmax(0,15rem)_1fr] gap-2.5">
          {question.choices.map((choice, i) => {
            let style = "border-zinc-800 bg-white text-zinc-800";
            if (feedback) {
              if (i === feedback.correctIndex) style = "border-emerald-500 bg-emerald-50 text-emerald-800";
              else if (i === picked) style = "border-red-400 bg-red-50 text-red-700";
              else style = "border-zinc-200 bg-white text-zinc-400";
            }
            return (
              <button
                key={`${index}-${i}`}
                type="button"
                disabled={phase === "submitting" || checking || !!feedback}
                onClick={() => void choose(i)}
                className={`relative col-start-2 flex items-center justify-center rounded-2xl border-2 px-12 py-3.5 text-center text-lg font-bold transition-transform active:scale-95 ${style}`}
              >
                <span>{choice}</span>
                {feedback && i === feedback.correctIndex && <Check className="absolute right-4 h-5 w-5" strokeWidth={3} />}
                {feedback && i === picked && i !== feedback.correctIndex && <X className="absolute right-4 h-5 w-5" strokeWidth={3} />}
              </button>
            );
          })}
          {feedback?.exampleEn && (
            // 3列グリッドの全幅(col-span-3)に置く。中央列は固定幅(15rem)なので、例文の長さでボタン幅が変わらない
            <p className="col-span-3 rounded-xl bg-zinc-50 px-3 py-2 text-center text-lg text-zinc-600">
              {feedback.exampleEn}
              {feedback.exampleJa && <span className="block text-base text-zinc-400">{feedback.exampleJa}</span>}
            </p>
          )}
          {feedback && (
            <button
              type="button"
              onClick={() => void next()}
              className="col-start-2 rounded-full bg-amber-500 px-12 py-3 text-base font-bold text-white transition-transform active:scale-95"
            >
              {index + 1 < round.questions.length ? "次へ" : "結果を見る"}
            </button>
          )}
        </div>
        {error && <p className="text-center text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  if (!result) return null;
  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-center">
        <p className="text-4xl font-black text-amber-700">
          {result.correctCount}
          <span className="text-xl text-amber-600"> / {result.total}</span>
        </p>
      </div>
      {result.boostDays > 0 && <GrowingKuwagataPanel maxCount={1} />}
      <ul className="flex flex-col gap-2">
        {result.items.map((item, i) => (
          <li key={i} className="rounded-xl border border-zinc-200 bg-white p-3">
            <div className="flex items-center gap-2">
              {item.correct ? (
                <Check className="h-4 w-4 shrink-0 text-emerald-600" strokeWidth={3} />
              ) : (
                <X className="h-4 w-4 shrink-0 text-red-500" strokeWidth={3} />
              )}
              <span className="font-bold text-zinc-800">{item.word}</span>
              <span className="text-sm text-zinc-600">{item.meaning}</span>
            </div>
            {item.exampleEn && (
              <p className="mt-1.5 pl-6 text-xs text-zinc-500">
                {item.exampleEn}
                {item.exampleJa && <span className="block text-zinc-400">{item.exampleJa}</span>}
              </p>
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => difficulty && void start(difficulty)}
          className="w-full rounded-full bg-amber-500 py-3 text-base font-bold text-white transition-transform active:scale-95"
        >
          もう1ラウンド
        </button>
        <ShareButton
          campaign="notebook_result"
          label="結果をシェア"
          text={`英クワたんの単語ノートで${result.correctCount}/${result.total}問正解！ #英クワたん`}
          className="inline-flex items-center justify-center gap-1.5 rounded-full border-2 border-zinc-300 bg-white py-2.5 text-sm font-bold text-zinc-600 transition-transform active:scale-95"
        />
        <button
          type="button"
          onClick={() => {
            setResult(null);
            setPhase("select");
          }}
          className="text-xs text-zinc-500 hover:text-zinc-800"
        >
          難易度を選びなおす
        </button>
        <Link href="/roadmap" className="text-center text-xs text-zinc-500 hover:text-zinc-800">
          部屋に戻る
        </Link>
      </div>
    </div>
  );
}
