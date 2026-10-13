// Stage3の判定AIの速度・正確さを比較するベンチマーク（手動実行専用）
// 実行: npx tsx scripts/benchmark-stage3-judge.ts
//   モデルを指定する場合: --models=claude-haiku-4-5-20251001,gemini-3.5-flash-lite,gemini-3.6-flash
//   1ケースあたりの回数:   --rounds=3（既定）
//
// 本番と同じプロンプト（src/lib/stage3-judge-prompt.ts）で、正解・不正解が分かっている発話を
// 各モデルに投げ、①応答時間（中央値・p95・最大）②失敗回数 ③判定が期待どおりだった割合を表示する。
// 1回ずつ順番に呼ぶ（ユーザー1人が使うときの体感に合わせるため）。
//
// ⚠️ 実際にAPIを叩く（既定で 8ケース×3回×3モデル = 72コール。1コールは0.1円未満の見込み）。
// 事前準備: .env.local に ANTHROPIC_API_KEY と GEMINI_API_KEY。

import dotenv from "dotenv";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import {
  buildStage3SystemPrompt,
  buildStage3UserPrompt,
  isExactModelAnswer,
  parseStage3JudgmentJson,
  type JudgeStage3Input,
} from "../src/lib/stage3-judge-prompt";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const DEFAULT_MODELS = ["claude-haiku-4-5-20251001", "gemini-3.5-flash-lite", "gemini-3.6-flash"];
const TIMEOUT_MS = 30000;

const modelsArg = process.argv.find((a) => a.startsWith("--models="))?.split("=")[1];
const models = modelsArg ? modelsArg.split(",").map((m) => m.trim()).filter(Boolean) : DEFAULT_MODELS;
const rounds = Number(process.argv.find((a) => a.startsWith("--rounds="))?.split("=")[1] ?? 3);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const needsAnthropic = models.some((m) => m.startsWith("claude"));
const needsGemini = models.some((m) => m.startsWith("gemini"));
if (needsAnthropic && !ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEYを.env.localに設定してください");
  process.exit(1);
}
if (needsGemini && !GEMINI_API_KEY) {
  console.error("GEMINI_API_KEYを.env.localに設定してください");
  process.exit(1);
}

const anthropic = needsAnthropic ? new Anthropic({ apiKey: ANTHROPIC_API_KEY }) : null;
const gemini = needsGemini ? new GoogleGenAI({ apiKey: GEMINI_API_KEY }) : null;

type Case = { label: string; input: JudgeStage3Input; expectCorrect: boolean };

const CASES: Case[] = [
  {
    label: "ヒント付き・少し言い換え(正)",
    input: {
      expressionEn: "Let's take this offline.",
      meaningJa: "この話は会議の場ではなく、別途個別に話しましょう、という意味。",
      subStep: "ヒント付き言い換え",
      userSpokenText: "Let's talk about this offline.",
    },
    expectCorrect: true,
  },
  {
    label: "ヒント付き・意味が違う(誤)",
    input: {
      expressionEn: "Let's take this offline.",
      meaningJa: "この話は会議の場ではなく、別途個別に話しましょう、という意味。",
      subStep: "ヒント付き言い換え",
      userSpokenText: "Let's turn off the computer.",
    },
    expectCorrect: false,
  },
  {
    label: "自由言い換え・別の言い方(正)",
    input: {
      expressionEn: "Could I get the bill, please?",
      meaningJa: "お会計をお願いします、という食事の後に会計を頼む定番表現。",
      subStep: "自由言い換え",
      userSpokenText: "Can I have the check please",
    },
    expectCorrect: true,
  },
  {
    label: "自由言い換え・文法崩れ(誤)",
    input: {
      expressionEn: "Could I get the bill, please?",
      meaningJa: "お会計をお願いします、という食事の後に会計を頼む定番表現。",
      subStep: "自由言い換え",
      userSpokenText: "Bill me pay want",
    },
    expectCorrect: false,
  },
  {
    label: "自由言い換え・音声認識ノイズ(正)",
    input: {
      expressionEn: "Do you have this in a different size?",
      meaningJa: "これの違うサイズはありますか、というサイズ違いを尋ねる買い物の定番表現。",
      subStep: "自由言い換え",
      userSpokenText: "do you have this in another sighs",
    },
    expectCorrect: true,
  },
  {
    label: "自由言い換え・無関係(誤)",
    input: {
      expressionEn: "I'm allergic to peanuts.",
      meaningJa: "ピーナッツアレルギーがあります、というアレルギーを伝える時の定番表現。",
      subStep: "自由言い換え",
      userSpokenText: "I like peanuts very much.",
    },
    expectCorrect: false,
  },
  {
    label: "ミニ拡張・1つ目(正。相手の返答も生成)",
    input: {
      expressionEn: "How do you know each other?",
      meaningJa: "お二人はどうやって知り合ったんですか、という知人同士の馴れ初めを尋ねる時の表現。",
      subStep: "ミニ拡張",
      userSpokenText: "How did you two meet each other?",
    },
    expectCorrect: true,
  },
  {
    label: "ミニ拡張・返事(正)",
    input: {
      expressionEn: "How do you know each other?",
      meaningJa: "お二人はどうやって知り合ったんですか、という知人同士の馴れ初めを尋ねる時の表現。",
      subStep: "ミニ拡張",
      phase: "followUp",
      partnerReplyEn: "We met at university. What about you and your friends?",
      userSpokenText: "We met at work three years ago.",
    },
    expectCorrect: true,
  },
];

async function callModel(model: string, system: string, user: string): Promise<string> {
  if (model.startsWith("claude")) {
    const message = await anthropic!.messages.create(
      { model, max_tokens: 1024, system, messages: [{ role: "user", content: user }] },
      { timeout: TIMEOUT_MS, maxRetries: 0 }
    );
    const block = message.content[0];
    return block?.type === "text" ? block.text : "";
  }
  const response = await gemini!.models.generateContent({
    model,
    contents: user,
    config: { systemInstruction: system, maxOutputTokens: 1024, httpOptions: { timeout: TIMEOUT_MS } },
  });
  return response.text ?? "";
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

async function main() {
  console.log(`モデル: ${models.join(", ")} / ケース${CASES.length}件 × ${rounds}回\n`);

  // 完全一致ショートカット（AIを呼ばない判定）が想定どおり動くかの確認
  const exact = isExactModelAnswer("let's take this offline", "Let's take this offline.");
  const notExact = isExactModelAnswer("Let's talk about this offline.", "Let's take this offline.");
  console.log(`完全一致の判定: 一致=${exact}(true想定) / 言い換え=${notExact}(false想定)\n`);

  for (const model of models) {
    const times: number[] = [];
    let failures = 0;
    let judged = 0;
    let matched = 0;
    const misses: string[] = [];
    const errors = new Map<string, number>();

    for (let r = 0; r < rounds; r++) {
      for (const c of CASES) {
        const system = buildStage3SystemPrompt(
          c.input.phase === "followUp" ? "exampleReply" : c.input.subStep === "ミニ拡張" ? "partnerReply" : null
        );
        const user = buildStage3UserPrompt(c.input);
        const startedAt = Date.now();
        try {
          const raw = await callModel(model, system, user);
          times.push(Date.now() - startedAt);
          judged++;
          const result = parseStage3JudgmentJson(raw);
          if (result.correct === c.expectCorrect) matched++;
          else misses.push(c.label);
        } catch (error) {
          failures++;
          const message = error instanceof Error ? error.message.replace(/\s+/g, " ").slice(0, 70) : String(error);
          errors.set(message, (errors.get(message) ?? 0) + 1);
        }
      }
    }

    const sorted = [...times].sort((a, b) => a - b);
    const total = rounds * CASES.length;
    console.log(`■ ${model}`);
    console.log(
      `  成功 ${judged}/${total}（失敗 ${failures}）  応答時間: 中央値 ${percentile(sorted, 50)}ms / p95 ${percentile(sorted, 95)}ms / 最大 ${sorted[sorted.length - 1] ?? "-"}ms`
    );
    console.log(`  判定が期待どおり: ${matched}/${judged}${misses.length ? `  外れたケース: ${[...new Set(misses)].join("、")}` : ""}`);
    for (const [message, count] of errors) console.log(`  エラー(${count}回): ${message}`);
    console.log("");
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
