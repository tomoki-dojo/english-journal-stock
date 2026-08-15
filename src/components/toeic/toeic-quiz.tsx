"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, PartyPopper, X } from "lucide-react";
import type { ToeicQuizQuestion } from "./types";
import { cn } from "@/lib/utils";

type ToeicQuizProps = {
  questions: ToeicQuizQuestion[];
};

type AnswerState = "unanswered" | "correct" | "incorrect";

type TagTally = Record<string, { correct: number; total: number }>;

// TOEIC演習（Part5）のクイズ本体。VocabularyQuizと見た目のトーンは揃えつつ、
// 回答後に解説を出す点、SRSの状態更新をしない点、完了画面でタグ別の正誤内訳を出す点が異なるため、
// 別コンポーネントとして新規に作っている。
export function ToeicQuiz({ questions }: ToeicQuizProps) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answerState, setAnswerState] = useState<AnswerState>("unanswered");
  const [submitting, setSubmitting] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [tally, setTally] = useState<TagTally>({});

  const question = questions[index];
  const isLast = index === questions.length - 1;
  const finished = questions.length > 0 && index >= questions.length;

  async function handleSelect(choiceIndex: number) {
    if (answerState !== "unanswered" || submitting) return;

    const isCorrect = choiceIndex === question.correctIndex;
    setSelected(choiceIndex);
    setAnswerState(isCorrect ? "correct" : "incorrect");
    if (isCorrect) setCorrectCount((c) => c + 1);

    setTally((prev) => {
      const current = prev[question.skillTag] ?? { correct: 0, total: 0 };
      return {
        ...prev,
        [question.skillTag]: {
          correct: current.correct + (isCorrect ? 1 : 0),
          total: current.total + 1,
        },
      };
    });

    setSubmitting(true);
    try {
      await fetch("/api/toeic/answer", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ questionId: question.questionId, correct: isCorrect }),
      });
    } catch {
      // 通信に失敗しても演習の体験自体は継続させる（ログが1件欠けるだけ）
    } finally {
      setSubmitting(false);
    }
  }

  function handleNext() {
    setIndex((i) => i + 1);
    setSelected(null);
    setAnswerState("unanswered");
  }

  if (questions.length === 0) {
    return (
      <div className="max-w-xl space-y-6 text-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">TOEIC演習</h1>
          <p className="mt-2 text-sm text-zinc-500">
            出題できる問題が見つかりませんでした。時間をおいて再度お試しください。
          </p>
        </div>
        <Link
          href="/practice?tab=toeic"
          className="inline-flex items-center gap-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
        >
          演習に戻る
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  if (finished) {
    const tagEntries = Object.entries(tally);
    return (
      <div className="max-w-xl space-y-6 text-center">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 text-accent">
            <PartyPopper className="h-8 w-8" />
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">演習完了！</h1>
          <p className="mt-2 text-sm text-zinc-500">
            {questions.length}問中 {correctCount}問正解でした。
          </p>
        </div>

        {tagEntries.length > 0 && (
          <div className="rounded-xl border border-zinc-200 bg-zinc-100/50 p-5 text-left">
            <p className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">項目別の正誤</p>
            <ul className="space-y-2">
              {tagEntries.map(([tag, { correct, total }]) => (
                <li key={tag} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-700">{tag}</span>
                  <span
                    className={cn(
                      "font-medium",
                      correct === total ? "text-emerald-600" : "text-zinc-900"
                    )}
                  >
                    {correct} / {total}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <Link
          href="/practice?tab=toeic"
          className="inline-flex items-center gap-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
        >
          演習に戻る
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          {index + 1} / {questions.length} 問
        </p>
        <p className="mt-1 text-xs text-zinc-400">{question.skillTag}</p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-100/50 p-8">
        <p className="text-lg leading-relaxed text-zinc-900">{question.questionText}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {question.choices.map((choice, choiceIndex) => {
          const isSelected = selected === choiceIndex;
          const isCorrectChoice = choiceIndex === question.correctIndex;
          const showResult = answerState !== "unanswered";

          return (
            <button
              key={choice}
              type="button"
              onClick={() => handleSelect(choiceIndex)}
              disabled={showResult}
              className={cn(
                "flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed",
                !showResult &&
                  "border-zinc-300 bg-zinc-200/40 text-zinc-700 hover:border-accent/50 hover:text-zinc-900",
                showResult && isCorrectChoice && "border-emerald-500/50 bg-emerald-500/10 text-emerald-700",
                showResult &&
                  isSelected &&
                  !isCorrectChoice &&
                  "border-red-500/50 bg-red-500/10 text-red-700",
                showResult && !isSelected && !isCorrectChoice && "border-zinc-200 text-zinc-400"
              )}
            >
              {choice}
              {showResult && isCorrectChoice && <Check className="h-4 w-4 shrink-0" />}
              {showResult && isSelected && !isCorrectChoice && <X className="h-4 w-4 shrink-0" />}
            </button>
          );
        })}
      </div>

      {answerState !== "unanswered" && (
        <div className="rounded-xl border border-accent/20 bg-accent/5 px-5 py-4">
          <p className="mb-1 text-xs font-medium uppercase tracking-wider text-accent">解説</p>
          <p className="text-sm leading-relaxed text-zinc-700">{question.explanationJa}</p>
        </div>
      )}

      {answerState !== "unanswered" && (
        <button
          type="button"
          onClick={handleNext}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition-colors hover:bg-accent/90"
        >
          {isLast ? "結果を見る" : "次の問題へ"}
          <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
