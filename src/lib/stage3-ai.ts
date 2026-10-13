// src/lib/stage3-ai.ts
// Stage3（型を崩して自分の言葉で言う）のAI意味判定。ai-writing.tsと同じClaude/Gemini呼び出し
// 基盤（callAnthropic/callGemini）を再利用するが、利用回数は月次ではなく日次（stage3_usage）で
// 管理する点が異なる（1回ごとにAI判定＝課金対象の呼び出しが発生し、ラウンドという単位を
// 持たないため。_reference/speaking-roadmap-design.md「収益設計（Stage3〜5）」参照）。
//
// - 発話テキスト（音声認識結果）そのものはDBに保存しない（ai-writing.tsと同じプライバシー配慮）。
//   保存するのは日次の利用回数と、エラータグの集計（user_error_tag_stats）のみ。

import { supabaseAdmin } from "@/lib/supabase/server";
import { getTodayDateKey } from "@/lib/daily-rotation";
import { callAnthropic, callGemini, DEFAULT_ANTHROPIC_MODEL, DEFAULT_GEMINI_MODEL, type AiWritingProvider } from "@/lib/ai-writing";
import {
  buildStage3SystemPrompt,
  buildStage3UserPrompt,
  isExactModelAnswer,
  parseStage3JudgmentJson,
  type JudgeStage3Input,
  type ParsedStage3Judgment,
} from "@/lib/stage3-judge-prompt";
import { STAGE3_FREE_DAILY_LIMIT, STAGE3_PRO_DAILY_LIMIT } from "@/components/roadmap/types";
import type { Plan } from "@/lib/plan";

function dailyLimitForPlan(plan: Plan): number {
  return plan === "free" ? STAGE3_FREE_DAILY_LIMIT : STAGE3_PRO_DAILY_LIMIT;
}

export type Stage3UsageCheckResult =
  | { allowed: true; remaining: number; limit: number; currentCount: number }
  | { allowed: false; remaining: 0; limit: number };

// 今日の利用回数を確認するだけ（消費しない）。AI呼び出しが成功した場合のみ
// incrementStage3Usageで加算する（失敗時に枠を無駄に消費しないため。ai-writing.tsと同じ設計）。
export async function checkStage3Usage(userId: string, plan: Plan): Promise<Stage3UsageCheckResult> {
  const limit = dailyLimitForPlan(plan);
  const dayKey = getTodayDateKey();

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("stage3_usage")
    .select("request_count")
    .eq("user_id", userId)
    .eq("day_key", dayKey)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Stage3利用回数の取得に失敗しました: ${fetchError.message}`);
  }

  const currentCount = existing?.request_count ?? 0;
  if (currentCount >= limit) {
    return { allowed: false, remaining: 0, limit };
  }

  return { allowed: true, remaining: limit - currentCount - 1, limit, currentCount };
}

async function incrementStage3Usage(userId: string, currentCount: number): Promise<void> {
  const dayKey = getTodayDateKey();

  const { error } = await supabaseAdmin.from("stage3_usage").upsert(
    { user_id: userId, day_key: dayKey, request_count: currentCount + 1 },
    { onConflict: "user_id,day_key" }
  );

  if (error) {
    throw new Error(`Stage3利用回数の更新に失敗しました: ${error.message}`);
  }
}

export type JudgeStage3AnswerParams = JudgeStage3Input & {
  userId: string;
  plan: Plan;
  provider?: AiWritingProvider;
  model?: string;
  // ミニ拡張の2つ目の発話（返事）は、1つ目と合わせて1回分として数える（利用枠は消費しない）
  skipUsageCount?: boolean;
};

export type JudgeStage3AnswerResult =
  | { ok: true; judgment: ParsedStage3Judgment; usage: { remaining: number; limit: number } }
  | { ok: false; reason: "limit_exceeded"; limit: number }
  | { ok: false; reason: "provider_error"; message: string };

// Stage3のAI意味判定のエントリポイント。利用回数チェック→プロンプト構築→Claude/Geminiいずれかを
// 呼び出し、判定結果を返す。呼び出し元（reportStage3Result）がstreak更新・エラータグ集計を行う。
export async function judgeStage3Answer(params: JudgeStage3AnswerParams): Promise<JudgeStage3AnswerResult> {
  const checked = await checkStage3Usage(params.userId, params.plan);
  // 返事の判定は1つ目の発話と合わせて1回分なので、枠を使い切った直後でも通す
  const usage = checked.allowed
    ? checked
    : params.skipUsageCount
      ? { allowed: true as const, remaining: 0, limit: checked.limit, currentCount: checked.limit }
      : null;
  if (!usage) {
    return { ok: false, reason: "limit_exceeded", limit: checked.limit };
  }

  // お手本と完全に一致しているときは、AIを呼ばずその場で正解にする（待ち時間ゼロ・コストゼロ）。
  // 相手の返答の生成が要るミニ拡張と、返事の判定（followUp）は対象外。利用枠は従来どおり1回分として数える。
  if (
    params.phase !== "followUp" &&
    params.subStep !== "ミニ拡張" &&
    isExactModelAnswer(params.userSpokenText, params.expressionEn)
  ) {
    console.log("[stage3] お手本と完全一致のためAI判定を省略");
    if (!params.skipUsageCount) {
      try {
        await incrementStage3Usage(params.userId, usage.currentCount);
      } catch (error) {
        return {
          ok: false,
          reason: "provider_error",
          message: error instanceof Error ? error.message : "利用回数の更新に失敗しました",
        };
      }
    }
    return {
      ok: true,
      judgment: {
        correct: true,
        errorTags: [],
        feedbackJa: "お手本どおりに言えています。次は、お手本を見ずに自分の言葉でも言ってみましょう。",
      },
      usage: {
        remaining: params.skipUsageCount ? Math.max(usage.remaining + (checked.allowed ? 1 : 0), 0) : usage.remaining,
        limit: usage.limit,
      },
    };
  }

  const provider: AiWritingProvider =
    params.provider ?? (process.env.AI_WRITING_PROVIDER as AiWritingProvider) ?? "gemini";
  const model =
    params.model ?? (provider === "anthropic" ? DEFAULT_ANTHROPIC_MODEL : DEFAULT_GEMINI_MODEL);

  const systemPrompt = buildStage3SystemPrompt(
    params.phase === "followUp" ? "exampleReply" : params.subStep === "ミニ拡張" ? "partnerReply" : null
  );
  const userPrompt = buildStage3UserPrompt(params);

  try {
    const aiStartedAt = Date.now();
    let raw: string;
    if (provider === "anthropic") {
      raw = await callAnthropic(systemPrompt, userPrompt, model);
    } else {
      try {
        // Claudeへのフォールバックがあるので、Geminiは8秒でタイムアウト・リトライなしで見切る。
        raw = await callGemini(systemPrompt, userPrompt, model, 1024, { timeoutMs: 8000, retry: false });
      } catch (geminiError) {
        // Geminiが混雑・遅延で使えないときは、Claude(Haiku)で判定して止まらないようにする。
        if (!process.env.ANTHROPIC_API_KEY) throw geminiError;
        console.log("[stage3] Geminiが使えないためClaudeで判定します");
        raw = await callAnthropic(systemPrompt, userPrompt, DEFAULT_ANTHROPIC_MODEL);
      }
    }
    // 体感の遅さの切り分け用(AI本体の所要時間)。サーバーのターミナルに出る。
    console.log(`[stage3] AI判定 ${provider}/${model}: ${Date.now() - aiStartedAt}ms`);

    if (!params.skipUsageCount) {
      await incrementStage3Usage(params.userId, usage.currentCount);
    }

    return {
      ok: true,
      judgment: parseStage3JudgmentJson(raw),
      usage: {
        remaining: params.skipUsageCount ? Math.max(usage.remaining + (checked.allowed ? 1 : 0), 0) : usage.remaining,
        limit: usage.limit,
      },
    };
  } catch (error) {
    return {
      ok: false,
      reason: "provider_error",
      message: error instanceof Error ? error.message : "AI呼び出しに失敗しました",
    };
  }
}
