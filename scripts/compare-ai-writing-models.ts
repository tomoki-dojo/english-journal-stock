// AI添削機能（src/lib/ai-writing.ts）のモデル比較用ベンチマーク（使い捨て・手動実行専用）
// 実行: npx tsx scripts/compare-ai-writing-models.ts
//
// ⚠️ 実際にAPIを叩いて課金が発生する。固定の1サンプル文を各モデルに1回ずつ投げるだけ
//    （デフォルトで合計3コール = Haiku 1回 + Gemini 2モデル×1回）。
//    むやみに再実行しない・候補を増やさないこと。
//
// 事前準備: .env.local に ANTHROPIC_API_KEY と GEMINI_API_KEY を設定しておく。
// GeminiのAPIキーが無料枠の場合、モデルによっては利用不可（404/429等）になり得る。
// その場合はエラーとして表示するだけで、他の候補の実行は続行する。

import dotenv from "dotenv";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { buildSystemPrompt, parseFeedbackJson } from "../src/lib/ai-writing-prompt";

const DEFAULT_ANTHROPIC_MODEL = "claude-haiku-4-5-20251001";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEYを.env.localに設定してください");
  process.exit(1);
}
if (!GEMINI_API_KEY) {
  console.error("GEMINI_API_KEYを.env.localに設定してください");
  process.exit(1);
}

// 実務ライティング添削機能を想定した、あえて改善点を含むサンプル文（1本のみ）
const SAMPLE_TEXT =
  "I want to inform you that the project delay is caused by resource issue. " +
  "We are trying to catch up the schedule but I cannot promise the deadline for now. " +
  "Please share your thought about this matter.";

// ユーザーの学習中単語を模したダミーデータ（本番はDBから取得するが、ここでは固定値でOK）
const SAMPLE_RECENT_VOCAB = [
  { wordEn: "touch base", meaningJa: "軽く確認・情報共有する" },
  { wordEn: "bandwidth", meaningJa: "対応できる余力" },
];

type PricingPerMillion = { input: number; output: number };

// 2026年8月時点の実測価格（USD/1Mトークン）。ドリフトが速いので、次回比較時は
// https://www.anthropic.com/pricing と https://ai.google.dev/gemini-api/docs/pricing で必ず再確認すること。
const PRICING: Record<string, PricingPerMillion> = {
  "claude-haiku-4-5-20251001": { input: 1.0, output: 5.0 },
  "gemini-3.6-flash": { input: 1.5, output: 7.5 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
};

function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
  const pricing = PRICING[model];
  if (!pricing) return null;
  return (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
}

type CandidateResult = {
  label: string;
  model: string;
  ok: boolean;
  elapsedMs: number;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number | null;
  correctedText?: string;
  points?: string[];
  vocabSuggestions?: { wordEn: string; note: string }[];
  error?: string;
};

const systemPrompt = buildSystemPrompt(SAMPLE_RECENT_VOCAB);

async function runAnthropic(model: string, label: string): Promise<CandidateResult> {
  const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  const startedAt = Date.now();
  try {
    const message = await client.messages.create({
      model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: "user", content: SAMPLE_TEXT }],
    });
    const elapsedMs = Date.now() - startedAt;
    const block = message.content[0];
    const raw = block?.type === "text" ? block.text : "";
    const feedback = parseFeedbackJson(raw);
    const inputTokens = message.usage.input_tokens;
    const outputTokens = message.usage.output_tokens;

    return {
      label,
      model,
      ok: true,
      elapsedMs,
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateCostUsd(model, inputTokens, outputTokens),
      correctedText: feedback.correctedText,
      points: feedback.points,
      vocabSuggestions: feedback.vocabSuggestions,
    };
  } catch (error) {
    return {
      label,
      model,
      ok: false,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runGemini(model: string, label: string): Promise<CandidateResult> {
  const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
  const startedAt = Date.now();
  try {
    const response = await client.models.generateContent({
      model,
      contents: SAMPLE_TEXT,
      config: { systemInstruction: systemPrompt },
    });
    const elapsedMs = Date.now() - startedAt;
    const raw = response.text ?? "";
    const feedback = parseFeedbackJson(raw);
    const inputTokens = response.usageMetadata?.promptTokenCount ?? 0;
    const outputTokens = response.usageMetadata?.candidatesTokenCount ?? 0;

    return {
      label,
      model,
      ok: true,
      elapsedMs,
      inputTokens,
      outputTokens,
      estimatedCostUsd: estimateCostUsd(model, inputTokens, outputTokens),
      correctedText: feedback.correctedText,
      points: feedback.points,
      vocabSuggestions: feedback.vocabSuggestions,
    };
  } catch (error) {
    return {
      label,
      model,
      ok: false,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function printResult(result: CandidateResult) {
  console.log(`\n=== ${result.label} (${result.model}) ===`);
  if (!result.ok) {
    console.log(`  失敗: ${result.error}`);
    return;
  }
  console.log(`  所要時間: ${result.elapsedMs}ms`);
  console.log(`  トークン: input=${result.inputTokens} output=${result.outputTokens}`);
  if (result.estimatedCostUsd !== undefined && result.estimatedCostUsd !== null) {
    console.log(`  推定コスト: $${result.estimatedCostUsd.toFixed(6)}`);
  }
  console.log(`  添削後の文章: ${result.correctedText}`);
  console.log(`  改善点:`);
  (result.points ?? []).forEach((p) => console.log(`    - ${p}`));
  console.log(`  語彙提案:`);
  (result.vocabSuggestions ?? []).forEach((v) => console.log(`    - ${v.wordEn}: ${v.note}`));
}

async function main() {
  const results: CandidateResult[] = [];

  // 直列実行（3回のみ・並列にしない。失敗しても他の候補は試す）
  results.push(await runAnthropic(DEFAULT_ANTHROPIC_MODEL, "Claude Haiku 4.5"));
  results.push(await runGemini("gemini-3.6-flash", "Gemini 3.6 Flash"));
  results.push(await runGemini("gemini-3.5-flash-lite", "Gemini 3.5 Flash-Lite"));

  results.forEach(printResult);

  console.log("\n=== サマリー ===");
  for (const r of results) {
    if (!r.ok) {
      console.log(`${r.label}: 失敗（${r.error}）`);
      continue;
    }
    console.log(
      `${r.label}: ${r.elapsedMs}ms, 推定$${r.estimatedCostUsd?.toFixed(6) ?? "?"}, JSON解析${
        r.correctedText ? "成功" : "失敗"
      }`
    );
  }
}

main();
