"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Loader2, Sparkles } from "lucide-react";

const MAX_LENGTH = 2000;

type FeedbackResult = {
  correctedText: string;
  points: string[];
  vocabSuggestions: { wordEn: string; note: string }[];
};

type UsageInfo = { remaining: number; limit: number };

type WritingFeedbackFormProps = {
  loggedIn?: boolean;
  // 呼び出し元（/practiceなど）ごとに見出し・プレースホルダーを変えられるようにしている。
  title?: string;
  description?: string;
  placeholder?: string;
};

// AI添削（実務ライティング添削）フォーム。/api/writing/feedback を叩くだけの汎用コンポーネントで、
// TOEIC専用にはせず、将来シーン別の表現ページなどからも再利用できるようにしてある。
export function WritingFeedbackForm({
  loggedIn = true,
  title = "AIに添削してもらう",
  description = "実務で使う英文（メールの下書き・会議メモなど）を入力すると、学習中の単語・表現を自然に使えないかAIが提案します。",
  placeholder = "例）I want to inform you that the project delay is caused by resource issue...",
}: WritingFeedbackFormProps) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<FeedbackResult | null>(null);
  const [usage, setUsage] = useState<UsageInfo | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || text.trim().length === 0) return;

    setPending(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/writing/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401) {
          setError("この機能を利用するにはログインが必要です");
        } else {
          setError(data.error ?? "添削に失敗しました");
        }
        return;
      }

      setResult(data.feedback);
      setUsage(data.usage);
    } catch {
      setError("通信に失敗しました。時間をおいて再度お試しください");
    } finally {
      setPending(false);
    }
  }

  if (!loggedIn) {
    return (
      <section className="rounded-xl border border-zinc-200 bg-white px-6 py-6">
        <div className="mb-2 flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
        </div>
        <p className="mb-4 text-sm text-zinc-500">{description}</p>
        <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-100/30 px-6 py-6 text-center">
          <p className="mb-3 text-sm text-zinc-500">ログインすると使えます。</p>
          <Link
            href="/login?reason=writing-feedback"
            className="inline-flex items-center gap-1 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90"
          >
            ログイン / 新規登録
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-xl border border-zinc-200 bg-white px-6 py-6">
      <div className="mb-2 flex items-center gap-1.5">
        <Sparkles className="h-4 w-4 text-accent" />
        <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      </div>
      <p className="mb-4 text-sm text-zinc-500">{description}</p>

      <form onSubmit={handleSubmit} className="space-y-3">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={MAX_LENGTH}
          rows={5}
          placeholder={placeholder}
          disabled={pending}
          className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60"
        />
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-400">
            {text.length} / {MAX_LENGTH}文字
          </p>
          <button
            type="submit"
            disabled={pending || text.trim().length === 0}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {pending ? "添削中..." : "AIに添削してもらう"}
          </button>
        </div>
      </form>

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-4 rounded-xl border border-accent/20 bg-accent/5 px-6 py-5">
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wider text-accent">添削後の文章</p>
            <p className="text-sm leading-relaxed text-zinc-900">{result.correctedText}</p>
          </div>

          {result.points.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">改善点</p>
              <ul className="space-y-1">
                {result.points.map((point) => (
                  <li key={point} className="text-sm text-zinc-600">
                    ・{point}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.vocabSuggestions.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium uppercase tracking-wider text-zinc-500">
                学習中の単語の活用例
              </p>
              <ul className="space-y-1">
                {result.vocabSuggestions.map((suggestion) => (
                  <li key={suggestion.wordEn} className="text-sm text-zinc-600">
                    <span className="font-semibold text-zinc-900">{suggestion.wordEn}</span>：
                    {suggestion.note}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {usage && (
            <p className="text-xs text-zinc-400">
              今月あと{usage.remaining}回利用できます（上限{usage.limit}回）
            </p>
          )}
        </div>
      )}
    </section>
  );
}
