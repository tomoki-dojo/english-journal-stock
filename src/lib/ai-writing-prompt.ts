// src/lib/ai-writing-prompt.ts
// AI添削（実務ライティング添削）のプロンプト構築・レスポンス解析だけを持つ純粋関数群。
// あえてSupabase（src/lib/supabase/server.ts）に依存させていない。
// server.tsはモジュール読み込み時にcreateClient()を実行するため、
// scripts/compare-ai-writing-models.tsのようなdotenv経由で単独実行するスクリプトから
// ai-writing.ts経由でimportすると、dotenv.config()より先にimportが評価され失敗する
// （ESMのimportはファイル先頭に巻き上げられるため）。
// そのため、Supabase不要なロジックはこちらに分離し、ai-writing.tsからも再利用する。

export type RecentVocabItem = { wordEn: string; meaningJa: string };

export function buildSystemPrompt(recentVocab: RecentVocabItem[]): string {
  const vocabLine =
    recentVocab.length > 0
      ? recentVocab.map((v) => `${v.wordEn}（${v.meaningJa}）`).join(", ")
      : "（学習履歴なし）";

  return `あなたはビジネス英語ライティングの添削者です。ユーザーが書いた実務文（メール・会議メモ・プレゼン原稿など）を添削してください。

出力は必ず次のJSON形式のみとし、前後に説明文やMarkdownのコードブロック記法（\`\`\`）を一切付けないこと。

{
  "correctedText": "添削後の英文（自然なビジネス英語に修正したもの）",
  "points": ["改善点の説明（日本語、1〜2文、最大4件）"],
  "vocabSuggestions": [{"wordEn": "単語または表現", "note": "どう使えるか・なぜ自然かの一言（日本語）"}]
}

ユーザーが最近学習している単語・表現: ${vocabLine}
これらが文章内で自然に使える場面があれば vocabSuggestions で1〜3件提案してください。無理にねじ込む必要はなく、該当がなければ空配列で構いません。`;
}

function stripCodeFence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}

export type ParsedFeedback = {
  correctedText: string;
  points: string[];
  vocabSuggestions: { wordEn: string; note: string }[];
};

export function parseFeedbackJson(raw: string): ParsedFeedback {
  try {
    const parsed = JSON.parse(stripCodeFence(raw));
    return {
      correctedText: typeof parsed.correctedText === "string" ? parsed.correctedText : raw,
      points: Array.isArray(parsed.points) ? parsed.points.filter((p: unknown) => typeof p === "string") : [],
      vocabSuggestions: Array.isArray(parsed.vocabSuggestions)
        ? parsed.vocabSuggestions.filter(
            (v: unknown): v is { wordEn: string; note: string } =>
              typeof v === "object" &&
              v !== null &&
              typeof (v as { wordEn?: unknown }).wordEn === "string" &&
              typeof (v as { note?: unknown }).note === "string"
          )
        : [],
    };
  } catch {
    // モデルがJSON以外を返した場合のフォールバック（添削文としてそのまま出す）
    return { correctedText: raw, points: [], vocabSuggestions: [] };
  }
}
