"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, MessageCircleQuestion, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { OnboardingQuizExperience, OnboardingTrack } from "./types";

type QuizStep =
  | { kind: "translate"; prompt: string; choices: string[]; correctIndex: number }
  | { kind: "track" }
  | { kind: "experience" };

// 1〜3問目：瞬間英作文の3択（正誤判定に使う。難易度は易しめ）
const TRANSLATE_STEPS: Extract<QuizStep, { kind: "translate" }>[] = [
  {
    kind: "translate",
    prompt: "「今日は疲れています」を英語で言うと？",
    choices: ["I'm tired today.", "I tired today.", "I'm tiring today."],
    correctIndex: 0,
  },
  {
    kind: "translate",
    prompt: "「少々お待ちください」を英語で言うと？",
    choices: ["Please wait a moment.", "Please waiting a moment.", "Please to wait a moment."],
    correctIndex: 0,
  },
  {
    kind: "translate",
    prompt: "「これで大丈夫ですか？」を英語で言うと？",
    choices: ["Is this okay?", "Is this okay for?", "This is okay?"],
    correctIndex: 0,
  },
];

const STEPS: QuizStep[] = [...TRANSLATE_STEPS, { kind: "track" }, { kind: "experience" }];

// 「診断」と銘打たない軽い会話クイズ。全5問・1分程度を想定。
// 1〜3問目は正答数の記録のみ（不正解でも次に進める）、4問目でトラック、5問目で経験を聞く。
export function OnboardingQuiz() {
  const router = useRouter();
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [track, setTrack] = useState<OnboardingTrack | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const step = STEPS[stepIndex];

  function goNext() {
    setSelectedChoice(null);
    setStepIndex((i) => i + 1);
  }

  function handleTranslateChoice(choiceIndex: number) {
    if (step.kind !== "translate" || selectedChoice !== null) return;
    setSelectedChoice(choiceIndex);
    if (choiceIndex === step.correctIndex) {
      setCorrectCount((c) => c + 1);
    }
    setTimeout(goNext, 600);
  }

  function handleTrackChoice(value: OnboardingTrack) {
    setTrack(value);
    goNext();
  }

  async function handleExperienceChoice(experience: OnboardingQuizExperience) {
    if (!track || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/roadmap/onboarding-quiz", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ correctCount, track, experience }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "結果の保存に失敗しました");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "結果の保存に失敗しました");
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-md">
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2">
          <MessageCircleQuestion className="h-4 w-4 text-accent" />
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">会話クイズ</h1>
        </div>
        <p className="text-sm text-zinc-500">
          あなたに合った練習量から始められるよう、5つだけ質問します。1分ほどで終わります。
        </p>
      </div>

      <div className="mb-4 flex gap-1">
        {STEPS.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1 flex-1 rounded-full",
              i < stepIndex ? "bg-accent" : i === stepIndex ? "bg-accent/50" : "bg-zinc-200"
            )}
          />
        ))}
      </div>

      <div className="rounded-xl border border-zinc-200 bg-zinc-100/50 p-6">
        {step.kind === "translate" && (
          <div>
            <p className="mb-4 text-sm font-medium text-zinc-900">{step.prompt}</p>
            <div className="space-y-2">
              {step.choices.map((choice, i) => {
                const isSelected = selectedChoice === i;
                const isCorrectChoice = i === step.correctIndex;
                const showResult = selectedChoice !== null;
                return (
                  <button
                    key={i}
                    type="button"
                    disabled={selectedChoice !== null}
                    onClick={() => handleTranslateChoice(i)}
                    className={cn(
                      "flex w-full items-center justify-between rounded-lg border px-4 py-2.5 text-left text-sm transition-colors",
                      showResult && isCorrectChoice
                        ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                        : showResult && isSelected
                          ? "border-red-300 bg-red-50 text-red-800"
                          : "border-zinc-200 bg-white text-zinc-700 hover:border-accent/40"
                    )}
                  >
                    {choice}
                    {showResult && isCorrectChoice && <Check className="h-4 w-4" />}
                    {showResult && isSelected && !isCorrectChoice && <X className="h-4 w-4" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step.kind === "track" && (
          <div>
            <p className="mb-4 text-sm font-medium text-zinc-900">
              主にどんな場面で英語を話せるようになりたいですか？
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => handleTrackChoice("daily")}
                className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-left text-sm text-zinc-700 transition-colors hover:border-accent/40"
              >
                日常会話（旅行・雑談など）
              </button>
              <button
                type="button"
                onClick={() => handleTrackChoice("business")}
                className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-left text-sm text-zinc-700 transition-colors hover:border-accent/40"
              >
                ビジネス（仕事で使う）
              </button>
            </div>
          </div>
        )}

        {step.kind === "experience" && (
          <div>
            <p className="mb-4 text-sm font-medium text-zinc-900">
              今までに英会話の経験はありますか？
            </p>
            <div className="space-y-2">
              {(
                [
                  ["beginner", "ほぼ初めて"],
                  ["some", "多少できる"],
                  ["confident", "一通り話せるが自信がない"],
                ] as [OnboardingQuizExperience, string][]
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  disabled={submitting}
                  onClick={() => handleExperienceChoice(value)}
                  className="w-full rounded-lg border border-zinc-200 bg-white px-4 py-2.5 text-left text-sm text-zinc-700 transition-colors hover:border-accent/40 disabled:opacity-50"
                >
                  {label}
                </button>
              ))}
            </div>
            {submitting && <p className="mt-3 text-xs text-zinc-400">結果を保存しています...</p>}
            {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
