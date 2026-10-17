// src/lib/stage4-ai.ts
// Stage4（AIロールプレイ）のAI応答生成・評価。stage3-ai.tsと同じClaude/Gemini呼び出し基盤
// （callAnthropic/callGemini）を再利用する。
//
// Stage3の利用回数は「1発話=1判定」で日次カウントしていたが、Stage4は「1セッション=5ターン」を
// 1回分のコスト単位として扱うため、利用回数の消費はセッションの最初のターン（turnIndex===1）
// でのみ行う（2〜5ターン目は同じセッションの続きなので消費しない）。
//
// 発話テキスト・会話ログそのものはDBに保存しない（stage3-ai.tsと同じプライバシー配慮）。

import { supabaseAdmin } from "@/lib/supabase/server";
import { getTodayDateKey } from "@/lib/daily-rotation";
import { callAiWithFallback, DEFAULT_ANTHROPIC_MODEL, DEFAULT_GEMINI_MODEL, type AiWritingProvider } from "@/lib/ai-writing";
import {
  buildStage4SystemPrompt,
  buildStage4UserPrompt,
  parseStage4TurnJson,
  type JudgeStage4TurnInput,
  type ParsedStage4Turn,
} from "@/lib/stage4-judge-prompt";
import {
  STAGE4_FREE_DAILY_LIMIT,
  STAGE4_FREE_WELCOME_DAILY_LIMIT,
  STAGE4_PRO_DAILY_LIMIT,
  STAGE45_FREE_WELCOME_DAYS,
} from "@/components/roadmap/types";
import type { Plan } from "@/lib/plan";

// Proは固定。Freeは、このStageを初めて遊んだ日（stage4_usageの最初のday_key）から
// STAGE45_FREE_WELCOME_DAYS日間だけ、はじめてボーナスの回数にする（まだ一度も遊んでいなければボーナス扱い）。
async function dailyLimitFor(userId: string, plan: Plan): Promise<number> {
  if (plan !== "free") return STAGE4_PRO_DAILY_LIMIT;
  const { data, error } = await supabaseAdmin
    .from("stage4_usage")
    .select("day_key")
    .eq("user_id", userId)
    .order("day_key", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Stage4の初回利用日の取得に失敗しました: ${error.message}`);
  if (!data) return STAGE4_FREE_WELCOME_DAILY_LIMIT;
  const firstDay = Date.parse(`${data.day_key}T00:00:00Z`);
  const today = Date.parse(`${getTodayDateKey()}T00:00:00Z`);
  const elapsedDays = Math.floor((today - firstDay) / 86_400_000);
  return elapsedDays < STAGE45_FREE_WELCOME_DAYS ? STAGE4_FREE_WELCOME_DAILY_LIMIT : STAGE4_FREE_DAILY_LIMIT;
}

export type Stage4UsageCheckResult =
  | { allowed: true; remaining: number; limit: number; currentCount: number }
  | { allowed: false; remaining: 0; limit: number };

// 今日のセッション開始回数を確認するだけ（消費しない）。セッションの最初のターンでのみ呼ぶ。
export async function checkStage4Usage(userId: string, plan: Plan): Promise<Stage4UsageCheckResult> {
  const limit = await dailyLimitFor(userId, plan);
  const dayKey = getTodayDateKey();

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("stage4_usage")
    .select("request_count")
    .eq("user_id", userId)
    .eq("day_key", dayKey)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Stage4利用回数の取得に失敗しました: ${fetchError.message}`);
  }

  const currentCount = existing?.request_count ?? 0;
  if (currentCount >= limit) {
    return { allowed: false, remaining: 0, limit };
  }

  return { allowed: true, remaining: limit - currentCount - 1, limit, currentCount };
}

async function incrementStage4Usage(userId: string, currentCount: number): Promise<void> {
  const dayKey = getTodayDateKey();

  const { error } = await supabaseAdmin.from("stage4_usage").upsert(
    { user_id: userId, day_key: dayKey, request_count: currentCount + 1 },
    { onConflict: "user_id,day_key" }
  );

  if (error) {
    throw new Error(`Stage4利用回数の更新に失敗しました: ${error.message}`);
  }
}

// 今日あと何回セッションを開始できるかだけを返す（消費しない）。turnIndex>1のターンで
// usage表示を継続するために使う。
export async function peekStage4Usage(userId: string, plan: Plan): Promise<{ remaining: number; limit: number }> {
  const check = await checkStage4Usage(userId, plan);
  if (!check.allowed) return { remaining: 0, limit: check.limit };
  // 消費前の残数（このセッション自体がすでに開始済みの前提で+1して見せる呼び出し元もあるため、
  // ここでは単純に「今チェックした時点の残数」を返す）。
  return { remaining: check.remaining + 1, limit: check.limit };
}

export type JudgeStage4TurnParams = JudgeStage4TurnInput & {
  userId: string;
  plan: Plan;
  provider?: AiWritingProvider;
  model?: string;
};

export type JudgeStage4TurnCallResult =
  | { ok: true; turn: ParsedStage4Turn; usage: { remaining: number; limit: number } }
  | { ok: false; reason: "limit_exceeded"; limit: number }
  | { ok: false; reason: "provider_error"; message: string };

// Stage4の1ターン分のAI呼び出しのエントリポイント。turnIndex===1のときだけ日次利用回数を
// チェック・消費する（2ターン目以降は同じセッションの続きとしてノーカウント）。
export async function judgeStage4Turn(params: JudgeStage4TurnParams): Promise<JudgeStage4TurnCallResult> {
  const isSessionStart = params.turnIndex <= 1;

  let usage: { remaining: number; limit: number };
  let usageCheckForIncrement: Stage4UsageCheckResult | null = null;

  if (isSessionStart) {
    const check = await checkStage4Usage(params.userId, params.plan);
    if (!check.allowed) {
      return { ok: false, reason: "limit_exceeded", limit: check.limit };
    }
    usageCheckForIncrement = check;
    usage = { remaining: check.remaining, limit: check.limit };
  } else {
    usage = await peekStage4Usage(params.userId, params.plan);
  }

  const provider: AiWritingProvider =
    params.provider ?? (process.env.AI_WRITING_PROVIDER as AiWritingProvider) ?? "gemini";
  const model =
    params.model ?? (provider === "anthropic" ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_GEMINI_MODEL);

  const systemPrompt = buildStage4SystemPrompt(params);
  const userPrompt = buildStage4UserPrompt(params);

  try {
    // 会話の返答は判定より出力が長いので、主プロバイダのタイムアウトは10秒。失敗時はもう一方に切り替える。
    const raw = await callAiWithFallback(systemPrompt, userPrompt, {
      provider,
      model,
      logTag: "stage4",
      primaryTimeoutMs: 10000,
    });

    if (isSessionStart && usageCheckForIncrement && usageCheckForIncrement.allowed) {
      await incrementStage4Usage(params.userId, usageCheckForIncrement.currentCount);
    }

    return {
      ok: true,
      turn: parseStage4TurnJson(raw),
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
