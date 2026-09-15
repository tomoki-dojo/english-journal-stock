// src/lib/stage5-judge-prompt.ts
// Stage5（上級ロールプレイ）のプロンプト構築・レスポンス解析だけを持つ純粋関数群。
// stage3-judge-prompt.ts / stage4-judge-prompt.tsと同じ理由（Supabase非依存、Stage毎に
// 判定ロジックが将来分岐しうる前提）で分離している。
//
// 仕組み自体（1ターン=1AI呼び出し、最終ターンだけoverallPass判定）はStage4と全く同じ。
// 違いはプロンプトの中身のみ：Stage5は「上級」なので、(1) より自然で幅のある語彙・言い回しを
// 期待する、(2) overallPassの基準をStage4より一段厳しくする（Stage4は「多少ぎこちなくても
// 意味が通じればtrue」だったが、Stage5は文法・語彙の正確さや自然さもある程度求める）。

import { ERROR_TAG_VALUES, STAGE5_TURN_COUNT, type Stage5Turn } from "@/components/roadmap/types";

export type JudgeStage5TurnInput = {
  scenarioTitleJa: string;
  situationJa: string;
  aiPersonaJa: string;
  goalJa: string;
  turnIndex: number;
  history: Stage5Turn[];
  userUtterance: string;
};

function isFinalTurn(turnIndex: number): boolean {
  return turnIndex >= STAGE5_TURN_COUNT;
}

export function buildStage5SystemPrompt(input: JudgeStage5TurnInput): string {
  const finalTurnInstruction = isFinalTurn(input.turnIndex)
    ? `
これは会話の最終ターン（${STAGE5_TURN_COUNT}ターン目）です。返答に加えて、この会話全体を通してユーザーがゴール（${input.goalJa}）を達成できていたかを判定し、overallPassとfeedbackJaも必ず埋めてください。`
    : `
これは会話の途中（${input.turnIndex}/${STAGE5_TURN_COUNT}ターン目）です。overallPassはnull、feedbackJaは空文字にしてください。`;

  return `あなたは英語スピーキング練習アプリの中で、ロールプレイの相手役を演じるAIです。
これは上級者向けのシナリオです。以下の役柄になりきって、日本語話者の学習者と英語で会話してください。

役柄・シチュエーション: ${input.situationJa}
あなたの役柄: ${input.aiPersonaJa}
学習者のゴール: ${input.goalJa}
${finalTurnInstruction}

出力は必ず次のJSON形式のみとし、前後に説明文やMarkdownのコードブロック記法（\`\`\`）を一切付けないこと。

{
  "aiReplyEn": "役柄になりきった、自然な英語の返答（1〜2文程度）",
  "errorTags": ["直前の学習者の発話に含まれる文法・自然さの問題（0〜2件、なければ空配列）"],
  "overallPass": true または false または null,
  "feedbackJa": "最終ターンのみ：会話全体への日本語フィードバック（1〜2文、前向きなトーン）。最終ターン以外は空文字"
}

判定・返答の方針：
- aiReplyEnは役柄を崩さず、学習者の発話に自然に反応する形で会話を続けてください。上級シナリオなので、
  基礎的なシーンより踏み込んだ質問・条件・反論などを交えて会話を展開してかまいません。
- errorTagsは、次のカタログの中から該当するものだけを選んでください（新しいタグを作らないこと）：
  ${ERROR_TAG_VALUES.join(", ")}
- 音声認識のテキスト化結果のため、多少の聞き取りミス（似た音の単語への誤変換）は考慮し、文脈上明らかな言い間違いは大目に見てください。
- overallPassは、Stage4（基礎レベル）より一段厳しく判定してください。単に意味が通じただけでなく、
  ゴールに関わる具体的な情報（条件・理由・希望など）を過不足なく伝えられているか、不自然な言い回しが
  会話の流れを妨げていないかも踏まえて判断してください。それでも一言一句の正確さを求めるものではなく、
  「上級シーンとして違和感なくやり取りが成立していたか」を基準にしてください。`;
}

export function buildStage5UserPrompt(input: JudgeStage5TurnInput): string {
  const historyText = input.history
    .map((turn) => `${turn.role === "ai" ? "あなた" : "学習者"}: ${turn.text}`)
    .join("\n");

  return `シナリオ: ${input.scenarioTitleJa}

これまでの会話:
${historyText}

学習者の今回の発話（音声認識のテキスト化結果）:
${input.userUtterance}

この発話に応答してください。`;
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}

export type ParsedStage5Turn = {
  aiReplyEn: string;
  errorTags: string[];
  overallPass: boolean | null;
  feedbackJa: string;
};

const VALID_ERROR_TAGS = new Set<string>(ERROR_TAG_VALUES);

export function parseStage5TurnJson(raw: string): ParsedStage5Turn {
  try {
    const parsed = JSON.parse(stripCodeFence(raw));
    const errorTags = Array.isArray(parsed.errorTags)
      ? parsed.errorTags.filter((t: unknown): t is string => typeof t === "string" && VALID_ERROR_TAGS.has(t))
      : [];

    return {
      aiReplyEn: typeof parsed.aiReplyEn === "string" && parsed.aiReplyEn.trim().length > 0
        ? parsed.aiReplyEn
        : "...",
      errorTags,
      overallPass: typeof parsed.overallPass === "boolean" ? parsed.overallPass : null,
      feedbackJa: typeof parsed.feedbackJa === "string" ? parsed.feedbackJa : "",
    };
  } catch {
    // モデルがJSON以外を返した場合のフォールバック。会話を止めないよう当たり障りのない
    // 返答を返しつつ、最終ターンの合否は安全側（false）に倒す。
    return {
      aiReplyEn: "Sorry, could you say that again?",
      errorTags: [],
      overallPass: false,
      feedbackJa: "判定に失敗しました。もう一度挑戦してみてください。",
    };
  }
}
