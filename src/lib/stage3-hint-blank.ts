// src/lib/stage3-hint-blank.ts
// Stage3「ヒント付き言い換え」のヒント文（重要な語句を空欄にしたもの）を、初回だけAIで生成して
// expressions.stage3_hint_blank_enにキャッシュするレイヤー。stage2-choice-reasons.tsと同じ
// 「初回だけAI生成→DBキャッシュ、以降はゼロコスト」パターン。
//
// 以前はexpression_enをそのままヒントとして見せていたが、AI判定は一字一句同じでも正解にする
// 仕様のため、ヒントを読み上げるだけで通ってしまい「自分の言葉で言う」練習にならなかった
// （2026-09-11の「ヒントを出すボタン」化に続く追加改善。2026-09-13 実機フィードバック）。

import { supabaseAdmin } from "@/lib/supabase/server";
import { callGemini, DEFAULT_GEMINI_MODEL } from "@/lib/ai-writing";
import {
  buildHintBlankSystemPrompt,
  buildHintBlankUserPrompt,
  parseHintBlankJson,
} from "@/lib/stage3-hint-blank-prompt";

export async function getOrGenerateStage3HintBlank(params: {
  expressionId: string;
  cached: string | null;
  expressionEn: string;
  meaningJa: string;
}): Promise<string> {
  // 既にキャッシュ済みならAIを呼ばずそのまま返す（通常はこちらのパスがほぼ全て）。
  if (params.cached && params.cached.trim().length > 0) {
    return params.cached;
  }

  try {
    const raw = await callGemini(
      buildHintBlankSystemPrompt(),
      buildHintBlankUserPrompt({ expressionEn: params.expressionEn, meaningJa: params.meaningJa }),
      DEFAULT_GEMINI_MODEL,
      1024,
      // 画面の読み込み中に呼ばれるので、Geminiが重いときに待たせない(失敗時は元の英文で続行し、
      // キャッシュしないので次回また試す)。
      { timeoutMs: 6000, retry: false }
    );
    const blankedEn = parseHintBlankJson(raw, params.expressionEn);

    if (!blankedEn) {
      // 生成結果が不正（空欄マーカーがない・元の文と同一など）な場合は、元の英文を
      // そのままヒントとして返す（これまでの挙動と同じで実害はない）。キャッシュはしない
      // ——一時的な不調のまま固定せず、次回アクセス時に再挑戦できるようにするため。
      return params.expressionEn;
    }

    const { error } = await supabaseAdmin
      .from("expressions")
      .update({ stage3_hint_blank_en: blankedEn })
      .eq("id", params.expressionId);

    if (error) {
      // キャッシュ保存に失敗しても、今回のレスポンス自体は生成済みの内容をそのまま返す
      // （ユーザー体験を止めない。次回アクセス時にまた生成し直すだけで実害は小さい）。
      console.error(`stage3_hint_blank_enの保存に失敗しました: ${error.message}`);
    }

    return blankedEn;
  } catch (error) {
    // AI呼び出し失敗時は元の英文をそのままヒントとして返す（現状維持のフォールバック）。
    console.error(
      `Stage3穴埋めヒントの生成に失敗しました: ${error instanceof Error ? error.message : String(error)}`
    );
    return params.expressionEn;
  }
}
