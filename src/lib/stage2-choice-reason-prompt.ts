// src/lib/stage2-choice-reason-prompt.ts
// Stage2（瞬間英作文）「穴埋め音読」の答え合わせ画面で見せる「似ているけど、ここでは不自然な
// 言い方」に添える、なぜ不自然なのかの理由をAIに生成させるためのプロンプト構築・レスポンス解析。
// stage3-judge-prompt.tsと同じ理由（Supabase非依存にしてスクリプト単独実行を可能にするため）で
// Supabaseに依存させていない。
//
// 実機フィードバック（2026-09-11）：「不自然だと言うなら理由が欲しい」「選択肢は3つも4つもいらない、
// 間違えそうな1〜2件でいい」という指摘を受けて追加。理由をAIに生成させつつ、本当に紛らわしいものだけ
// 最大2件に絞る役割も同じAI呼び出しに持たせている（絞り込みだけを別ロジックで行うより、意味の近さを
// 判断できるAIに任せた方が精度が出るため）。
// 生成結果はstage2_quiz_content.blank_choice_reasonsにキャッシュし、フレーズごとに初回の1回だけ
// AI呼び出しが発生する（呼び出し元はstage2-choice-reasons.ts）。

import type { Stage2ReferenceChoice } from "@/components/roadmap/types";

export type ChoiceReasonInput = {
  expressionEn: string;
  meaningJa: string;
  candidates: string[];
};

export function buildChoiceReasonSystemPrompt(): string {
  return `あなたは日本語話者向け英語学習アプリのコンテンツ作成者です。ある正解の英文に対して、紛らわしい（似ているが、この文脈では不自然・不正解な）言い方の候補がいくつか与えられます。

その中から、日本語話者が実際に間違えやすいものを最大2件だけ選び、それぞれについて「なぜここでは不自然・不正解なのか」を日本語で1文、簡潔に説明してください。

出力は必ず次のJSON形式のみとし、前後に説明文やMarkdownのコードブロック記法（\`\`\`）を一切付けないこと。

{
  "items": [
    { "text": "候補の英文（candidatesの中から一字一句そのまま）", "reasonJa": "なぜ不自然かの説明（日本語1文）" }
  ]
}

選ぶ基準：
- 文法的には成立するが、この文脈・意味では使えない（対象や場面がずれている等）ものを優先する
- 明らかに場違いで誰も間違えなさそうな候補は選ばない
- 本当に紛らわしいものが1件しかなければ1件だけ返してよい（無理に2件にしない）
- reasonJaは学習者向けに短く、断定的な口調で書く（例：「〜は距離を尋ねる表現なので、値段を聞くここでは不自然です」）`;
}

export function buildChoiceReasonUserPrompt(input: ChoiceReasonInput): string {
  return `正解の英文: ${input.expressionEn}
日本語の意味: ${input.meaningJa}

紛らわしい候補一覧:
${input.candidates.map((c) => `- ${c}`).join("\n")}

この中から最大2件、学習者が本当に間違えそうなものを選び、理由を付けてください。`;
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}

// AIが候補にない文字列や理由抜きの項目を返した場合に備え、candidatesに実在するものだけを
// 採用し、最大2件に切り詰める。
export function parseChoiceReasonJson(raw: string, candidates: string[]): Stage2ReferenceChoice[] {
  const validSet = new Set(candidates);
  try {
    const parsed = JSON.parse(stripCodeFence(raw));
    const items = Array.isArray(parsed.items) ? parsed.items : [];

    return items
      .map((item: unknown) => {
        if (typeof item !== "object" || item === null) return null;
        const record = item as Record<string, unknown>;
        const text = typeof record.text === "string" ? record.text : "";
        const reasonJa = typeof record.reasonJa === "string" ? record.reasonJa : "";
        return { text, reasonJa };
      })
      .filter(
        (item: Stage2ReferenceChoice | null): item is Stage2ReferenceChoice =>
          item !== null && validSet.has(item.text) && item.reasonJa.length > 0
      )
      .slice(0, 2);
  } catch {
    return [];
  }
}
