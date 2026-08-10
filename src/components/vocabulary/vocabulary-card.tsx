"use client";

import { LearningListButton } from "./learning-list-button";
import type { Vocabulary, VocabLevel } from "./types";
import type { Plan } from "@/lib/plan";
import { cn } from "@/lib/utils";

const levelBadgeClasses: Record<VocabLevel, string> = {
  初級: "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/20",
  中級: "bg-amber-500/10 text-amber-700 ring-1 ring-amber-500/20",
  上級: "bg-rose-500/10 text-rose-700 ring-1 ring-rose-500/20",
};

type VocabularyCardProps = {
  vocabulary: Vocabulary;
  plan: Plan;
  initialAdded?: boolean;
};

export function VocabularyCard({ vocabulary, plan, initialAdded = false }: VocabularyCardProps) {
  return (
    <article className="group flex flex-col rounded-xl border border-zinc-200 bg-zinc-100/50 p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/50 hover:shadow-lg hover:shadow-accent/20">
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <span className="rounded-md bg-zinc-300/60 px-2 py-1 text-[11px] font-medium text-zinc-700">
          {vocabulary.partOfSpeech}
        </span>
        <span
          className={cn(
            "rounded-md px-2 py-1 text-[11px] font-medium",
            levelBadgeClasses[vocabulary.level]
          )}
        >
          {vocabulary.level}
        </span>
      </div>

      <p className="mb-1 text-lg font-semibold tracking-tight text-zinc-900">
        {vocabulary.wordEn}
      </p>
      <p className="mb-3 text-sm leading-relaxed text-zinc-600">{vocabulary.meaningJa}</p>

      {vocabulary.exampleEn && (
        <div className="mb-3 rounded-lg bg-zinc-200/40 p-3 text-xs leading-relaxed">
          <p className="text-zinc-700">{vocabulary.exampleEn}</p>
          {vocabulary.exampleJa && <p className="mt-1 text-zinc-500">{vocabulary.exampleJa}</p>}
        </div>
      )}

      {vocabulary.synonyms && vocabulary.synonyms.length > 0 && (
        <p className="mb-4 text-xs text-zinc-500">
          <span className="text-zinc-400">類義語: </span>
          {vocabulary.synonyms.join(" / ")}
        </p>
      )}

      <div className="mt-auto pt-1">
        <LearningListButton vocabularyId={vocabulary.id} plan={plan} initialAdded={initialAdded} />
      </div>
    </article>
  );
}
