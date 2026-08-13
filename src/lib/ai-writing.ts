// src/lib/ai-writing.ts
// AI添削機能（実務ライティング添削）のコアロジック。
// 「ユーザーが最近学習している単語・表現を、実際の業務文に自然に組み込めるか」を
// AIに添削させる、TOEIC差別化の目玉機能（Phase1仕様書参照）。
//
// - 添削対象の文章そのものはDBに保存しない（プライバシー配慮）。保存するのは月次の利用回数のみ。
// - モデルはClaude / Geminiを切り替え可能にしてある（性能・コスト比較テストのため）。
//   料金は変動するので、実運用モデルを決める前に必ず両方の実測結果で比較すること。

import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { supabaseAdmin } from "@/lib/supabase/server";
import { listVocabularyByIds } from "@/lib/supabase/vocabulary";
import type { Plan } from "@/lib/plan";
import {
  buildSystemPrompt,
  parseFeedbackJson,
  type ParsedFeedback,
  type RecentVocabItem,
} from "@/lib/ai-writing-prompt";

export { buildSystemPrompt, parseFeedbackJson };
export type { ParsedFeedback };

export type AiWritingProvider = "anthropic" | "gemini";

// 月次利用上限（アプリ側のロジック。DB上には持たない）
export const FREE_MONTHLY_LIMIT = 3;
export const PRO_MONTHLY_LIMIT = 20;

// デフォルトモデル。2026/8/13にscripts/compare-ai-writing-models.tsで実測比較した結果、
// Gemini 3.5 Flash-LiteがHaiku 4.5より「速い・安い・学習語彙の活用精度も同等以上」だったため、
// 実運用のデフォルトプロバイダはgemini・モデルはgemini-3.5-flash-liteとする
// （AI_WRITING_PROVIDER環境変数で上書き可能）。
// 実測値の目安（サンプル文1件、システムプロンプト込み）:
//   Claude Haiku 4.5      : 4.8秒 / $0.00155 / 学習語彙2件中1件のみ活用
//   Gemini 3.6 Flash       : 10.6秒 / $0.00247 / 学習語彙2件とも活用
//   Gemini 3.5 Flash-Lite  : 2.2秒 / $0.00073 / 学習語彙2件とも活用
// モデルの入れ替わりが速いので、次回見直す際は必ず
// https://ai.google.dev/gemini-api/docs/models で最新のEndpoint名を確認すること。
export const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";
export const DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite";

const MAX_TEXT_LENGTH = 2000;

// JST基準の「今月」をYYYY-MM形式で返す（daily-rotation.tsのgetTodayDateKeyと同じ考え方）。
function getMonthKeyJST(date: Date = new Date()): string {
  const [y, m] = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo" })
    .format(date)
    .split("-");
  return `${y}-${m}`;
}

function monthlyLimitForPlan(plan: Plan): number {
  return plan === "free" ? FREE_MONTHLY_LIMIT : PRO_MONTHLY_LIMIT;
}

type UsageCheckResult =
  | { allowed: true; remaining: number; limit: number; currentCount: number }
  | { allowed: false; remaining: 0; limit: number };

// 今月の利用回数を確認するだけ（消費しない）。AI呼び出しが成功した場合のみ
// incrementUsage で加算する（失敗時に枠を無駄に消費しないため）。
async function checkUsage(userId: string, plan: Plan): Promise<UsageCheckResult> {
  const limit = monthlyLimitForPlan(plan);
  const monthKey = getMonthKeyJST();

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("ai_writing_usage")
    .select("request_count")
    .eq("user_id", userId)
    .eq("month_key", monthKey)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`利用回数の取得に失敗しました: ${fetchError.message}`);
  }

  const currentCount = existing?.request_count ?? 0;
  if (currentCount >= limit) {
    return { allowed: false, remaining: 0, limit };
  }

  return { allowed: true, remaining: limit - currentCount - 1, limit, currentCount };
}

// AI呼び出しが成功した場合にのみ呼ぶ、実際のカウントアップ。
async function incrementUsage(userId: string, currentCount: number): Promise<void> {
  const monthKey = getMonthKeyJST();

  const { error: upsertError } = await supabaseAdmin.from("ai_writing_usage").upsert(
    { user_id: userId, month_key: monthKey, request_count: currentCount + 1 },
    { onConflict: "user_id,month_key" }
  );

  if (upsertError) {
    throw new Error(`利用回数の更新に失敗しました: ${upsertError.message}`);
  }
}

// 直近で学習リストに入れた単語（なければ保存済み単語）を、添削プロンプトの文脈として使う。
async function listRecentVocabForPrompt(userId: string, limit = 5): Promise<RecentVocabItem[]> {
  const { data: progressRows, error: progressError } = await supabaseAdmin
    .from("word_review_progress")
    .select("vocabulary_id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (progressError) {
    throw new Error(`学習中の単語の取得に失敗しました: ${progressError.message}`);
  }

  let vocabIds = (progressRows ?? []).map((row) => row.vocabulary_id as string);

  if (vocabIds.length === 0) {
    const { data: savedRows, error: savedError } = await supabaseAdmin
      .from("saved_vocabulary")
      .select("vocabulary_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (savedError) {
      throw new Error(`保存済み単語の取得に失敗しました: ${savedError.message}`);
    }
    vocabIds = (savedRows ?? []).map((row) => row.vocabulary_id as string);
  }

  if (vocabIds.length === 0) return [];

  const vocabList = await listVocabularyByIds(vocabIds);
  return vocabList.map((v) => ({ wordEn: v.wordEn, meaningJa: v.meaningJa }));
}

async function callAnthropic(systemPrompt: string, userText: string, model: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEYが設定されていません");

  const client = new Anthropic({ apiKey });
  const message = await client.messages.create({
    model,
    max_tokens: 1024,
    system: systemPrompt,
    messages: [{ role: "user", content: userText }],
  });

  const block = message.content[0];
  return block?.type === "text" ? block.text : "";
}

async function callGemini(systemPrompt: string, userText: string, model: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEYが設定されていません");

  const client = new GoogleGenAI({ apiKey });
  const response = await client.models.generateContent({
    model,
    contents: userText,
    // Claude側のmax_tokens: 1024と揃えて、1回あたりのコスト上限を必ず設ける。
    config: { systemInstruction: systemPrompt, maxOutputTokens: 1024 },
  });

  return response.text ?? "";
}

export type GetWritingFeedbackParams = {
  userId: string;
  plan: Plan;
  text: string;
  provider?: AiWritingProvider;
  model?: string;
};

export type GetWritingFeedbackResult =
  | {
      ok: true;
      feedback: ParsedFeedback;
      provider: AiWritingProvider;
      model: string;
      usage: { remaining: number; limit: number };
      elapsedMs: number;
    }
  | { ok: false; reason: "limit_exceeded"; limit: number }
  | { ok: false; reason: "invalid_text"; message: string }
  | { ok: false; reason: "provider_error"; message: string };

// AI添削のエントリポイント。利用回数チェック→直近学習単語の取得→プロンプト構築→
// Claude/Geminiいずれかを呼び出し、構造化した添削結果を返す。
export async function getWritingFeedback(
  params: GetWritingFeedbackParams
): Promise<GetWritingFeedbackResult> {
  const text = params.text.trim();
  if (text.length === 0) {
    return { ok: false, reason: "invalid_text", message: "添削する文章を入力してください" };
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return {
      ok: false,
      reason: "invalid_text",
      message: `文章が長すぎます（${MAX_TEXT_LENGTH}文字以内にしてください）`,
    };
  }

  const usage = await checkUsage(params.userId, params.plan);
  if (!usage.allowed) {
    return { ok: false, reason: "limit_exceeded", limit: usage.limit };
  }

  const provider: AiWritingProvider = params.provider ?? (process.env.AI_WRITING_PROVIDER as AiWritingProvider) ?? "gemini";
  const model =
    params.model ?? (provider === "anthropic" ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_GEMINI_MODEL);

  const recentVocab = await listRecentVocabForPrompt(params.userId);
  const systemPrompt = buildSystemPrompt(recentVocab);

  const startedAt = Date.now();
  try {
    const raw =
      provider === "anthropic"
        ? await callAnthropic(systemPrompt, text, model)
        : await callGemini(systemPrompt, text, model);

    await incrementUsage(params.userId, usage.currentCount);

    return {
      ok: true,
      feedback: parseFeedbackJson(raw),
      provider,
      model,
      usage: { remaining: usage.remaining, limit: usage.limit },
      elapsedMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ok: false,
      reason: "provider_error",
      message: error instanceof Error ? error.message : "AI呼び出しに失敗しました",
    };
  }
}
