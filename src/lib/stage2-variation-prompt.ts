// src/lib/stage2-variation-prompt.ts
// Stage2「微改変」の問題（覚えた表現の一部を変えて言う）を作るプロンプト構築・レスポンス解析だけを
// 持つ純粋関数群。stage3-hint-blank-prompt.tsと同じ理由（Supabase非依存）で分離している。

export const STAGE2_VARIATION_KINDS = [
  "object",
  "subject",
  "politeness",
  "form",
  "situation",
  "tense",
  "quantity",
  "addition",
] as const;
export type Stage2VariationKind = (typeof STAGE2_VARIATION_KINDS)[number];

// 画面に出す見出し（変え方がひと目で分かるようにする）
export const STAGE2_VARIATION_LABEL: Record<Stage2VariationKind, string> = {
  object: "対象を変えて言う",
  subject: "主語・相手を変えて言う",
  politeness: "丁寧さを変えて言う",
  form: "文の形を変えて言う",
  situation: "状況を変えて言う",
  tense: "タイミングを変えて言う",
  quantity: "数や程度を変えて言う",
  addition: "理由や条件を足して言う",
};

export type Stage2Variation = {
  kind: Stage2VariationKind;
  promptJa: string;
  answerEn: string;
};

export type BuildVariationInput = {
  expressionEn: string;
  meaningJa: string;
};

export function buildVariationSystemPrompt(): string {
  return `あなたは英語スピーキング練習アプリの教材作成者です。学習者が覚えた英語表現を、少しだけ変えて言う練習問題（微改変）を、1つの表現につき2パターン作ってください。

出力は必ず次のJSON形式のみとし、前後に説明文やMarkdownのコードブロック記法（\`\`\`）を一切付けないこと。

{
  "variations": [
    { "kind": "変え方の種類", "promptJa": "日本語の問題文", "answerEn": "答えの英文" },
    { "kind": "変え方の種類", "promptJa": "日本語の問題文", "answerEn": "答えの英文" }
  ]
}

変え方の種類（kindは次のいずれか。2パターンは必ず別の種類にすること）：
- object: 対象を入れ替える（物・人・場所などを別のものに）
- subject: 主語・相手を変える（I→we、you→they など）
- politeness: 丁寧さを変える（カジュアル↔丁寧）
- form: 疑問・肯定・否定など文の形を切り替える
- situation: 状況・場面・相手との関係を変える
- tense: 時制・タイミングを変える（今・さっき・これから）
- quantity: 数や程度を変える（量・回数・強さ）
- addition: 一言の理由や条件を足す

作成方針：
- お手本の表現から自然に成り立つ種類だけを選ぶこと。無理に作った不自然な英文は禁止。
- promptJaは、学習者がそのまま英語にできる日本語の文（「〜と言ってみよう」のような指示文ではなく、言いたい内容そのもの）にすること。変え方が分かる具体的な内容にする。
- answerEnは、お手本の表現の型を活かした自然な英文1文。お手本とまったく同じ文にしないこと。
- 語彙はお手本と同程度のやさしさにすること。
- 表現の働きを保つこと。依頼・お願い・許可を求める表現（please、Can I〜?、Could you〜? など）は、時制を過去にしたり、事実の報告にしたりすると意味が変わって不自然になる。そのような表現では tense（時制）と、働きが変わる form（疑問↔肯定）は選ばないこと。
- 出力前に、answerEnを自己点検すること：①ネイティブが実際に言う自然な文か ②「過去形＋please」のような語用論的に矛盾した組み合わせになっていないか ③promptJaの内容を正確に英語にできているか。1つでも不安があれば、その種類をやめて別の種類に差し替えること。`;
}

export function buildVariationUserPrompt(input: BuildVariationInput): string {
  return `お手本の英文: ${input.expressionEn}
日本語の意味: ${input.meaningJa}

この表現の微改変を2パターン作ってください。`;
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}

const VALID_KINDS = new Set<string>(STAGE2_VARIATION_KINDS);

// 生成結果が使い物になるかを検証する：2件あること・種類が有効で別々・本文が空でなく、
// お手本そのままでないこと。崩れていればnullを返し、呼び出し元にフォールバックさせる。
export function parseVariationJson(raw: string, expressionEn: string): Stage2Variation[] | null {
  try {
    const parsed = JSON.parse(stripCodeFence(raw));
    if (!Array.isArray(parsed.variations)) return null;

    const items: Stage2Variation[] = [];
    for (const v of parsed.variations) {
      if (typeof v?.kind !== "string" || !VALID_KINDS.has(v.kind)) continue;
      const promptJa = typeof v.promptJa === "string" ? v.promptJa.trim() : "";
      const answerEn = typeof v.answerEn === "string" ? v.answerEn.trim() : "";
      if (promptJa.length === 0 || answerEn.length === 0) continue;
      if (answerEn === expressionEn.trim()) continue;
      if (items.some((i) => i.kind === v.kind)) continue;
      items.push({ kind: v.kind as Stage2VariationKind, promptJa, answerEn });
    }

    return items.length >= 2 ? items.slice(0, 2) : null;
  } catch {
    return null;
  }
}
