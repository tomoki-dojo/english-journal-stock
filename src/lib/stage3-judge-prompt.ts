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
  // ミニ拡張は2段階：first=まずフレーズを言う（意味判定＋相手の返答を生成）、
  // followUp=相手（アーサー）の返答に対して一言返す。未指定はfirst扱い。
  phase?: "first" | "followUp";
  partnerReplyEn?: string;
};

const SUB_STEP_INSTRUCTION: Record<Stage3SubStep, string> = {
  ヒント付き言い換え:
    "お手本の英文をヒントとして見た上で、多少表現を変えて言い換えています。お手本と一言一句同じである必要はなく、意味が伝われば正解とします。",
  自由言い換え:
    "お手本の英文は見せず、日本語の意味だけから自由に組み立てています。お手本と語順や単語が違っても、意味が伝わっていれば正解とします。",
  ミニ拡張:
    "日本語の意味を、お手本を見ずに自分の言葉で言っています（ミニ会話の1つ目の発話）。意味が伝わっていれば正解とし、状況の付け足しは求めません。",
};

export function buildStage3SystemPrompt(extra: "partnerReply" | "exampleReply" | null = null): string {
  const extraFields =
    extra === "partnerReply"
      ? `,
  "partnerReplyEn": "学習者の発話に対して、英語話者の相手（同僚アーサー）が自然に返す短い一言（英語、1〜2文、やさしい語彙。必ず学習者への質問（好み・状況・希望などを尋ねる、はい・いいえだけで答えられない質問）で終え、「Thank you」程度では返せないようにする。お礼や案内だけで終わる返答は不可）",
  "partnerReplyJa": "partnerReplyEnの日本語訳"`
      : extra === "exampleReply"
        ? `,
  "exampleReplyEn": "相手の発言に対する、自然な返答の例（英語、1文、やさしい語彙）"`
        : "";
  return `あなたは英語スピーキング練習アプリの採点者です。日本語話者が声に出した英文（音声認識でテキスト化されたもの）を判定してください。

出力は必ず次のJSON形式のみとし、前後に説明文やMarkdownのコードブロック記法（\`\`\`）を一切付けないこと。

{
  "correct": true または false,
  "errorTags": ["該当するエラータグ（0〜2件、なければ空配列）"],
  "feedbackJa": "日本語で1〜2文の短いフィードバック（なぜ正解/不正解か、次に何を意識すればいいか）"${extraFields}
}

判定基準：
- 一言一句の完全一致ではなく、「意味が伝わっているか」「文法的に破綻していないか」で判定してください。多少ぎこちなくても、意味が通じて文法的に大きな問題がなければcorrect: trueとしてください。
- 音声認識の書き起こしのため、多少の聞き取りミス（似た音の単語への誤変換など）は考慮し、文脈上明らかな言い間違いは大目に見てください。
- errorTagsは、次のカタログの中から該当するものだけを選んでください（新しいタグを作らないこと）：
  ${ERROR_TAG_VALUES.join(", ")}
- feedbackJaは学習者への声かけとして、短く前向きなトーンで書いてください。`;
}

export function buildStage3UserPrompt(input: JudgeStage3Input): string {
  if (input.phase === "followUp") {
    return `最初に学習者が言った表現（お手本）: ${input.expressionEn}
日本語の意味: ${input.meaningJa}
相手（アーサー）の返答: ${input.partnerReplyEn ?? ""}

学習者が、この返答に対して返した英文（音声認識のテキスト化結果）:
${input.userSpokenText}

相手の返答に対する返事として、意味が通じていて文法的に大きな問題がなければ正解としてください（内容は自由。お手本の表現を使う必要はありません）。この返事を判定してください。`;
  }
  return `お手本の英文: ${input.expressionEn}
日本語の意味: ${input.meaningJa}
出題形式: ${input.subStep}（${SUB_STEP_INSTRUCTION[input.subStep]}）

学習者が実際に声に出した英文（音声認識のテキスト化結果）:
${input.userSpokenText}

この発話を判定してください。`;
}

// 大文字小文字・句読点・引用符の違いを無視するための正規化（音声認識の書き起こしは
// 大文字化・句読点の付き方が揺れるため）。アポストロフィは単語の一部として残す。
function normalizeForExactMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[^a-z0-9'\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 学習者の発話が、お手本の英文と（大文字小文字・句読点を除いて）完全に一致しているか。
// 一致していればAIに聞くまでもなく正解なので、AI呼び出しを省いて即座に判定できる。
// 「...」や「〜」を含むお手本は、後ろに続きを言う前提の表現なので対象外（AIに任せる）。
export function isExactModelAnswer(userSpokenText: string, expressionEn: string): boolean {
  if (/\.\.\.|…|〜|~/.test(expressionEn)) return false;
  const user = normalizeForExactMatch(userSpokenText);
  return user.length > 0 && user === normalizeForExactMatch(expressionEn);
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
  partnerReplyEn?: string;
  partnerReplyJa?: string;
  exampleReplyEn?: string;
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
      partnerReplyEn: typeof parsed.partnerReplyEn === "string" ? parsed.partnerReplyEn : undefined,
      partnerReplyJa: typeof parsed.partnerReplyJa === "string" ? parsed.partnerReplyJa : undefined,
      exampleReplyEn: typeof parsed.exampleReplyEn === "string" ? parsed.exampleReplyEn : undefined,
    };
  } catch {
    // モデルがJSON以外を返した場合のフォールバック。安全側に倒して不正解扱いにする
    // （「正解と誤判定してstreakだけ進む」より「もう一度言い直させる」方が実害が小さいため）。
    return { correct: false, errorTags: [], feedbackJa: "判定に失敗しました。もう一度声に出してみてください。" };
  }
}
