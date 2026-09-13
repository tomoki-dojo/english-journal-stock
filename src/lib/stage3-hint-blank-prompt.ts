// src/lib/stage3-hint-blank-prompt.ts
// Stage3「ヒント付き言い換え」のヒント文（重要な語句を空欄にしたもの）のプロンプト構築・
// レスポンス解析だけを持つ純粋関数群。stage2-choice-reason-prompt.tsと同じ理由（Supabase非依存）
// で分離している。

export type BuildHintBlankInput = {
  expressionEn: string;
  meaningJa: string;
};

export function buildHintBlankSystemPrompt(): string {
  return `あなたは英語スピーキング練習アプリの教材作成者です。お手本の英文から、意味の核となる1語または短い語句だけを選んで空欄（___）にした「穴埋めヒント」を作ってください。

出力は必ず次のJSON形式のみとし、前後に説明文やMarkdownのコードブロック記法（\`\`\`）を一切付けないこと。

{
  "blankedEn": "空欄にした英文（元の英文と、空欄化した1箇所以外は完全に一致させること）"
}

作成方針：
- 空欄にするのは1箇所だけ。文全体の構造（残りの単語・語順・句読点）はお手本の英文から一切変えないこと。
- 空欄にする語句は、その表現の「core」にあたる動詞・動詞句・イディオムの中心部分を選ぶこと（冠詞・前置詞1語だけのような些末な部分は避ける）。
- 空欄は "___"（アンダースコア3つ）で表すこと。
- 学習者が「日本語の意味は分かっているが、その核となる言い回しを思い出せるか」を試すためのヒントであり、答えをそのまま見せるものではない。`;
}

export function buildHintBlankUserPrompt(input: BuildHintBlankInput): string {
  return `お手本の英文: ${input.expressionEn}
日本語の意味: ${input.meaningJa}

この英文の穴埋めヒントを作ってください。`;
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}

// 生成結果が使い物になるかを検証する：①空欄マーカーを含むこと ②元の英文と完全一致していない
// （＝実際に何か空欄化されている）こと。どちらか崩れていたらnullを返し、呼び出し元に
// フォールバック（元の英文をそのまま見せる、これまでの挙動）させる。
export function parseHintBlankJson(raw: string, expressionEn: string): string | null {
  try {
    const parsed = JSON.parse(stripCodeFence(raw));
    const blankedEn = typeof parsed.blankedEn === "string" ? parsed.blankedEn.trim() : "";

    if (blankedEn.length === 0) return null;
    if (!blankedEn.includes("___")) return null;
    if (blankedEn === expressionEn.trim()) return null;

    return blankedEn;
  } catch {
    return null;
  }
}
