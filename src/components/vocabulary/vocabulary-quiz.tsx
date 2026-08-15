"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, ChevronRight, PartyPopper, X } from "lucide-react";
import type { QuizQuestion } from "./types";
import { cn } from "@/lib/utils";

type VocabularyQuizProps = {
  questions: QuizQuestion[];
  // trueの場合のみ回答結果をAPIに送信し、間隔反復の状態（箱レベル・次回復習日）を更新する。
  // ランダム学習ではfalseにして、正誤判定だけ行いSRS状態には一切影響させない。
  persistResults?: boolean;
  // 完了画面の「戻る」リンク先。省略時は/practice。
  backHref?: string;
  backLabel?: string;
};

type AnswerState = "unanswered" | "correct" | "incorrect";

export function VocabularyQuiz({
  questions,
  persistResults = true,
  backHref = "/practice",
  backLabel = "演習に戻る",
}: VocabularyQuizProps) {
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [answerState, setAnswerState] = useState<AnswerState>("unanswered");
  const [submitting, setSubmitting] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);

  const question = questions[index];
  const isLast = index === questions.length - 1;
  const finished = index >= questions.length;

  async function handleSelect(choiceIndex: number) {
    if (answerState !== "unanswered" || submitting) return;

    const isCorrect = choiceIndex === question.correctIndex;
    setSelected(choiceIndex);
    setAnswerState(isCorrect ? "correct" : "incorrect");

    if (!persistResults) {
      if (isCorrect) setCorrectCount((c) => c + 1);
      return;
    }

    setSubmitting(true);
    try {
      await fetch("/api/vocabulary/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ vocabularyId: question.vocabularyId, correct: isCorrect }),
      });
    } catch {
      // 通信に失敗しても、クイズの体験自体は継続させる（次回の復習日はズレる可能性がある）
    } finally {
      setSubmitting(false);
      if (isCorrect) setCorrectCount((c) => c + 1);
    }
  }

  function handleNext() {
    setIndex((i) => i + 1);
    setSelected(null);
    setAnswerState("unanswered");
  }

  if (finished) {
    return (
      <div className="max-w-xl space-y-6 text-center">
        <div className="flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-accent/10 text-accent">
            <PartyPopper className="h-8 w-8" />
          </div>
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">復習完了！</h1>
          <p className="mt-2 text-sm text-zinc-500">
            {questions.length}問中 {correctCount}問正解でした。
          </p>
        </div>
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
        >
          {backLabel}
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
        <p className="mt-1 text-xs text-zinc-400">
          {question.direction === "en-to-ja" ? "英語 → 意味" : "意味 → 英語"}
        </p>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-100/50 p-8 text-center">
        <p className="text-2xl font-semibold tracking-tight text-zinc-900">{question.prompt}</p>
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
