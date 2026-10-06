// src/lib/stage4-judge-prompt.ts
// Stage4（AIロールプレイ）のプロンプト構築・レスポンス解析だけを持つ純粋関数群。
// stage3-judge-prompt.tsと同じ理由（Supabase非依存）で分離している。
//
// Stage3は「1発話=1判定」だったが、Stage4は「1ターン=1AI呼び出し」で、その1回の呼び出しが
// (1) 役に成りきった自然な返答を返す (2) そのターンのユーザー発話からerrorTagsを抽出する、
// の2つを同時にこなす。さらに最終ターン（turnIndex === STAGE4_TURN_COUNT）だけは、
// (3) 会話全体を通してgoalJaが達成できていたかのoverallPass判定 (4) 日本語フィードバック、
// も追加で行う（会話全体の文脈が必要なため、最終ターンのAI呼び出し1回にまとめる）。

import { ERROR_TAG_VALUES, STAGE4_TURN_COUNT, type Stage4Turn } from "@/components/roadmap/types";

export type JudgeStage4TurnInput = {
  scenarioTitleJa: string;
  situationJa: string;
  aiPersonaJa: string;
  goalJa: string;
  turnIndex: number;
  history: Stage4Turn[];
  userUtterance: string;
};

function isFinalTurn(turnIndex: number): boolean {
  return turnIndex >= STAGE4_TURN_COUNT;
}

export function buildStage4SystemPrompt(input: JudgeStage4TurnInput): string {
  const finalTurnInstruction = isFinalTurn(input.turnIndex)
    ? `
これは会話の最終ターン（${STAGE4_TURN_COUNT}ターン目）です。返答に加えて、この会話全体を通してユーザーがゴール（${input.goalJa}）を達成できていたかを判定し、overallPassとfeedbackJaも必ず埋めてください。`
    : `
これは会話の途中（${input.turnIndex}/${STAGE4_TURN_COUNT}ターン目）です。overallPassはnull、feedbackJaは空文字にしてください。`;

  return `あなたは英語スピーキング練習アプリの中で、ロールプレイの相手役を演じるAIです。
以下の役柄になりきって、日本語話者の学習者と英語で会話してください。

役柄・シチュエーション: ${input.situationJa}
あなたの役柄: ${input.aiPersonaJa}
学習者のゴール: ${input.goalJa}
${finalTurnInstruction}

出力は必ず次のJSON形式のみとし、前後に説明文やMarkdownのコードブロック記法（\`\`\`）を一切付けないこと。

{
  "aiReplyEn": "役柄になりきった、自然な英語の返答（1〜2文程度）",
  "errorTags": ["直前の学習者の発話に含まれる文法・自然さの問題（0〜2件、なければ空配列）"],
  "overallPass": true または false または null,
  "feedbackJa": "最終ターンのみ：日本語フィードバック。1行目は会話全体への総評（1〜2文、前向きなトーン）。続けて、学習者の発話の中で直すと良い表現を最大2つ、改行区切りで「・『学習者の英文』→『自然な言い直し』（理由を短く）」の形で示す（直す点がなければ総評のみ）。最終ターン以外は空文字"
}

判定・返答の方針：
- aiReplyEnは役柄を崩さず、学習者の発話に自然に反応する形で会話を続けてください。学習者の発話が多少不自然でも、意味が読み取れれば違和感なく応答してください（採点者としてではなく、あくまで会話相手として振る舞う）。
- aiReplyEnの返し方：学習者が「Thank you」程度で済ませられる返答（相づち・お礼への返事・説明だけで終わる返答）は避けてください。会話の途中のターンでは、必ず学習者への質問（好み・状況・希望・理由・具体的な条件などを尋ねる、はい・いいえだけで答えられない質問を優先）で返答を終え、学習者が自分の言葉で答えたくなるようにしてください。最終ターンだけは、質問ではなく自然な締めの一言で終えてかまいません。
- errorTagsは、次のカタログの中から該当するものだけを選んでください（新しいタグを作らないこと）：
  ${ERROR_TAG_VALUES.join(", ")}
- 音声認識のテキスト化結果のため、多少の聞き取りミス（似た音の単語への誤変換）は考慮し、文脈上明らかな言い間違いは大目に見てください。
- 言い直しの対象は会話全体（これまでの会話の学習者の発話すべて）から選び、意味が通じていても不自然・文法的に誤りのある表現を優先してください。音声認識の誤変換と思われるものは対象外です。
- overallPassは、一言一句の正しさではなく「学習者のゴールが会話を通じて概ね達成できていたか」で判定してください。多少ぎこちなくても、意味が通じてゴールに沿ったやり取りができていればtrueにしてください。`;
}

export function buildStage4UserPrompt(input: JudgeStage4TurnInput): string {
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

export type ParsedStage4Turn = {
  aiReplyEn: string;
  errorTags: string[];
  overallPass: boolean | null;
  feedbackJa: string;
};

const VALID_ERROR_TAGS = new Set<string>(ERROR_TAG_VALUES);

export function parseStage4TurnJson(raw: string): ParsedStage4Turn {
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
