// src/lib/stage3-judge-prompt.ts
// Stage3（型を崩して自分の言葉で言う）のAI意味判定のプロンプト構築・レスポンス解析だけを持つ
// 純粋関数群。ai-writing-prompt.tsと同じ理由（Supabase非依存にしてスクリプト単独実行を
// 可能にするため）でSupabaseに依存させていない。

import { ERROR_TAG_VALUES, type Stage3SubStep } from "@/components/roadmap/types";

export type JudgeStage3Input = {
  expressionEn: string;
  meaningJa: string;
  subStep: Stage3SubStep;
  userSpokenText: string;
};

const SUB_STEP_INSTRUCTION: Record<Stage3SubStep, string> = {
  ヒント付き言い換え:
    "お手本の英文をヒントとして見た上で、多少表現を変えて言い換えています。お手本と一言一句同じである必要はなく、意味が伝われば正解とします。",
  自由言い換え:
    "お手本の英文は見せず、日本語の意味だけから自由に組み立てています。お手本と語順や単語が違っても、意味が伝わっていれば正解とします。",
  ミニ拡張:
    "日本語の意味に加えて、状況を一言足すよう求めています。核となる意味が伝わっており、かつ最低限の拡張（状況・理由・詳細など）が加えられていれば正解とします。拡張が一切ない場合は、核の意味だけ合っていても不正解にしてください。",
};

export function buildStage3SystemPrompt(): string {
  return `あなたは英語スピーキング練習アプリの採点者です。日本語話者が声に出した英文（音声認識でテキスト化されたもの）を判定してください。

出力は必ず次のJSON形式のみとし、前後に説明文やMarkdownのコードブロック記法（\`\`\`）を一切付けないこと。

{
  "correct": true または false,
  "errorTags": ["該当するエラータグ（0〜2件、なければ空配列）"],
  "feedbackJa": "日本語で1〜2文の短いフィードバック（なぜ正解/不正解か、次に何を意識すればいいか）"
}

判定基準：
- 一言一句の完全一致ではなく、「意味が伝わっているか」「文法的に破綻していないか」で判定してください。多少ぎこちなくても、意味が通じて文法的に大きな問題がなければcorrect: trueとしてください。
- 音声認識の書き起こしのため、多少の聞き取りミス（似た音の単語への誤変換など）は考慮し、文脈上明らかな言い間違いは大目に見てください。
- errorTagsは、次のカタログの中から該当するものだけを選んでください（新しいタグを作らないこと）：
  ${ERROR_TAG_VALUES.join(", ")}
- feedbackJaは学習者への声かけとして、短く前向きなトーンで書いてください。`;
}

export function buildStage3UserPrompt(input: JudgeStage3Input): string {
  return `お手本の英文: ${input.expressionEn}
日本語の意味: ${input.meaningJa}
出題形式: ${input.subStep}（${SUB_STEP_INSTRUCTION[input.subStep]}）

学習者が実際に声に出した英文（音声認識のテキスト化結果）:
${input.userSpokenText}

この発話を判定してください。`;
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}

export type ParsedStage3Judgment = {
  correct: boolean;
  errorTags: string[];
  feedbackJa: string;
};

const VALID_ERROR_TAGS = new Set<string>(ERROR_TAG_VALUES);

export function parseStage3JudgmentJson(raw: string): ParsedStage3Judgment {
  try {
    const parsed = JSON.parse(stripCodeFence(raw));
    const errorTags = Array.isArray(parsed.errorTags)
      ? parsed.errorTags.filter((t: unknown): t is string => typeof t === "string" && VALID_ERROR_TAGS.has(t))
      : [];

    return {
      correct: parsed.correct === true,
      errorTags,
      feedbackJa: typeof parsed.feedbackJa === "string" ? parsed.feedbackJa : "",
    };
  } catch {
    // モデルがJSON以外を返した場合のフォールバック。安全側に倒して不正解扱いにする
    // （「正解と誤判定してstreakだけ進む」より「もう一度言い直させる」方が実害が小さいため）。
    return { correct: false, errorTags: [], feedbackJa: "判定に失敗しました。もう一度声に出してみてください。" };
  }
}
