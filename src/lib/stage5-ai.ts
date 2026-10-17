// src/lib/stage5-ai.ts
// Stage5（上級ロールプレイ）のAI応答生成・評価。stage4-ai.tsと同じClaude/Gemini呼び出し基盤
// （callAnthropic/callGemini）を再利用する。
//
// 利用回数の消費ルールもStage4と同じ（1セッション=STAGE5_TURN_COUNTターンを1回分のコスト単位
// とし、セッションの最初のターンturnIndex===1でのみ消費）。ただしカウンタのテーブルは
// stage4_usageとは独立したstage5_usageを使う（Stage4/5は別モードとして日次予算を分ける方針。
// _reference/speaking-roadmap-design.md参照）。
//
// 発話テキスト・会話ログそのものはDBに保存しない（stage4-ai.tsと同じプライバシー配慮）。

import { supabaseAdmin } from "@/lib/supabase/server";
import { getTodayDateKey } from "@/lib/daily-rotation";
import { callAiWithFallback, DEFAULT_ANTHROPIC_MODEL, DEFAULT_GEMINI_MODEL, type AiWritingProvider } from "@/lib/ai-writing";
import {
  buildStage5SystemPrompt,
  buildStage5UserPrompt,
  parseStage5TurnJson,
  type JudgeStage5TurnInput,
  type ParsedStage5Turn,
} from "@/lib/stage5-judge-prompt";
import {
  STAGE5_FREE_DAILY_LIMIT,
  STAGE5_FREE_WELCOME_DAILY_LIMIT,
  STAGE5_PRO_DAILY_LIMIT,
  STAGE45_FREE_WELCOME_DAYS,
} from "@/components/roadmap/types";
import type { Plan } from "@/lib/plan";

// Proは固定。Freeは、このStageを初めて遊んだ日（stage5_usageの最初のday_key）から
// STAGE45_FREE_WELCOME_DAYS日間だけ、はじめてボーナスの回数にする（まだ一度も遊んでいなければボーナス扱い）。
async function dailyLimitFor(userId: string, plan: Plan): Promise<number> {
  if (plan !== "free") return STAGE5_PRO_DAILY_LIMIT;
  const { data, error } = await supabaseAdmin
    .from("stage5_usage")
    .select("day_key")
    .eq("user_id", userId)
    .order("day_key", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Stage5の初回利用日の取得に失敗しました: ${error.message}`);
  if (!data) return STAGE5_FREE_WELCOME_DAILY_LIMIT;
  const firstDay = Date.parse(`${data.day_key}T00:00:00Z`);
  const today = Date.parse(`${getTodayDateKey()}T00:00:00Z`);
  const elapsedDays = Math.floor((today - firstDay) / 86_400_000);
  return elapsedDays < STAGE45_FREE_WELCOME_DAYS ? STAGE5_FREE_WELCOME_DAILY_LIMIT : STAGE5_FREE_DAILY_LIMIT;
}

export type Stage5UsageCheckResult =
  | { allowed: true; remaining: number; limit: number; currentCount: number }
  | { allowed: false; remaining: 0; limit: number };

// 今日のセッション開始回数を確認するだけ（消費しない）。セッションの最初のターンでのみ呼ぶ。
export async function checkStage5Usage(userId: string, plan: Plan): Promise<Stage5UsageCheckResult> {
  const limit = await dailyLimitFor(userId, plan);
  const dayKey = getTodayDateKey();

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("stage5_usage")
    .select("request_count")
    .eq("user_id", userId)
    .eq("day_key", dayKey)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Stage5利用回数の取得に失敗しました: ${fetchError.message}`);
  }

  const currentCount = existing?.request_count ?? 0;
  if (currentCount >= limit) {
    return { allowed: false, remaining: 0, limit };
  }

  return { allowed: true, remaining: limit - currentCount - 1, limit, currentCount };
}

async function incrementStage5Usage(userId: string, currentCount: number): Promise<void> {
  const dayKey = getTodayDateKey();

  const { error } = await supabaseAdmin.from("stage5_usage").upsert(
    { user_id: userId, day_key: dayKey, request_count: currentCount + 1 },
    { onConflict: "user_id,day_key" }
  );

  if (error) {
    throw new Error(`Stage5利用回数の更新に失敗しました: ${error.message}`);
  }
}

// 今日あと何回セッションを開始できるかだけを返す（消費しない）。turnIndex>1のターンで
// usage表示を継続するために使う。
export async function peekStage5Usage(userId: string, plan: Plan): Promise<{ remaining: number; limit: number }> {
  const check = await checkStage5Usage(userId, plan);
  if (!check.allowed) return { remaining: 0, limit: check.limit };
  return { remaining: check.remaining + 1, limit: check.limit };
}

export type JudgeStage5TurnParams = JudgeStage5TurnInput & {
  userId: string;
  plan: Plan;
  provider?: AiWritingProvider;
  model?: string;
};

export type JudgeStage5TurnCallResult =
  | { ok: true; turn: ParsedStage5Turn; usage: { remaining: number; limit: number } }
  | { ok: false; reason: "limit_exceeded"; limit: number }
  | { ok: false; reason: "provider_error"; message: string };

// Stage5の1ターン分のAI呼び出しのエントリポイント。turnIndex===1のときだけ日次利用回数を
// チェック・消費する（2ターン目以降は同じセッションの続きとしてノーカウント）。
export async function judgeStage5Turn(params: JudgeStage5TurnParams): Promise<JudgeStage5TurnCallResult> {
  const isSessionStart = params.turnIndex <= 1;

  let usage: { remaining: number; limit: number };
  let usageCheckForIncrement: Stage5UsageCheckResult | null = null;

  if (isSessionStart) {
    const check = await checkStage5Usage(params.userId, params.plan);
    if (!check.allowed) {
      return { ok: false, reason: "limit_exceeded", limit: check.limit };
    }
    usageCheckForIncrement = check;
    usage = { remaining: check.remaining, limit: check.limit };
  } else {
    usage = await peekStage5Usage(params.userId, params.plan);
  }

  const provider: AiWritingProvider =
    params.provider ?? (process.env.AI_WRITING_PROVIDER as AiWritingProvider) ?? "gemini";
  const model =
    params.model ?? (provider === "anthropic" ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_GEMINI_MODEL);

  const systemPrompt = buildStage5SystemPrompt(params);
  const userPrompt = buildStage5UserPrompt(params);

  try {
    // 会話の返答は判定より出力が長いので、主プロバイダのタイムアウトは10秒。失敗時はもう一方に切り替える。
    const raw = await callAiWithFallback(systemPrompt, userPrompt, {
      provider,
      model,
      logTag: "stage5",
      primaryTimeoutMs: 10000,
    });

    if (isSessionStart && usageCheckForIncrement && usageCheckForIncrement.allowed) {
      await incrementStage5Usage(params.userId, usageCheckForIncrement.currentCount);
    }

    return {
      ok: true,
      turn: parseStage5TurnJson(raw),
      usage,
    };
  } catch (error) {
    return {
      ok: false,
      reason: "provider_error",
      message: error instanceof Error ? error.message : "AI呼び出しに失敗しました",
    };
  }
}
