// src/lib/stage2-variation.ts
// Stage2「微改変」の2パターンを、初回だけAIで生成してstage2_quiz_content.variationsにキャッシュする
// レイヤー。stage3-hint-blank.tsと同じ「初回だけAI生成→DBキャッシュ、以降はゼロコスト」パターン。

import { supabaseAdmin } from "@/lib/supabase/server";
import { callGemini, DEFAULT_GEMINI_MODEL } from "@/lib/ai-writing";
import {
  buildVariationSystemPrompt,
  buildVariationUserPrompt,
  parseVariationJson,
  type Stage2Variation,
} from "@/lib/stage2-variation-prompt";

// 生成に失敗した場合はnullを返す（呼び出し元は従来の出題にフォールバックする）。
// キャッシュもしない——一時的な不調のまま固定せず、次回アクセス時に再挑戦できるようにするため。
export async function getOrGenerateStage2Variations(params: {
  expressionId: string;
  cached: Stage2Variation[] | null;
  expressionEn: string;
  meaningJa: string;
}): Promise<Stage2Variation[] | null> {
  if (params.cached && params.cached.length >= 2) {
    return params.cached;
  }

  // 一時的な不調（出力の途中切れ・形式崩れ・API混雑）でnullになりやすいため、1回だけ再試行する。
  // 出力トークン上限は、思考トークンで本文が切れないよう余裕を持たせる。
  let variations: Stage2Variation[] | null = null;
  for (let attempt = 1; attempt <= 2 && !variations; attempt++) {
    try {
      const raw = await callGemini(
        buildVariationSystemPrompt(),
        buildVariationUserPrompt({ expressionEn: params.expressionEn, meaningJa: params.meaningJa }),
        DEFAULT_GEMINI_MODEL,
        4096
      );
      variations = parseVariationJson(raw, params.expressionEn);
      if (!variations) {
        console.error(`Stage2微改変の生成結果が不正でした（${attempt}回目, ${params.expressionEn}）: ${raw.slice(0, 400)}`);
      }
    } catch (error) {
      console.error(
        `Stage2微改変の生成に失敗しました（${attempt}回目, ${params.expressionEn}）: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
  if (!variations) return null;

  try {
    const { error } = await supabaseAdmin
      .from("stage2_quiz_content")
      .update({ variations })
      .eq("expression_id", params.expressionId);

    if (error) {
      console.error(`variationsの保存に失敗しました: ${error.message}`);
    }

    return variations;
  } catch (error) {
    console.error(
      `Stage2微改変の保存に失敗しました: ${error instanceof Error ? error.message : String(error)}`
    );
    return variations;
  }
}
