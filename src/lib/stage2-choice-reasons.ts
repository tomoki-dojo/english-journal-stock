// src/lib/stage2-choice-reasons.ts
// Stage2「穴埋め音読」の答え合わせ画面に添える「なぜ不自然か」の理由を、初回だけAIで生成して
// stage2_quiz_content.blank_choice_reasonsにキャッシュするレイヤー。
//
// stage3-ai.tsと違い、ユーザーごとの利用回数管理は不要——理由はフレーズごとに1回生成すれば
// 全ユーザー共通で使い回せるため（ユーザーの発話内容に応じて変わる判定ではなく、コンテンツに
// 対して一意に決まる説明文のため）。よって初回アクセスしたユーザーだけがごく僅かなAI呼び出し
// コスト・レイテンシを肩代わりし、以降は完全にゼロコストで返せる。
// 実機フィードバック（2026-09-11）を受けて追加。詳細は_reference/speaking-roadmap-design.md参照。

import { supabaseAdmin } from "@/lib/supabase/server";
import { callGemini, DEFAULT_GEMINI_MODEL } from "@/lib/ai-writing";
import {
  buildChoiceReasonSystemPrompt,
  buildChoiceReasonUserPrompt,
  parseChoiceReasonJson,
} from "@/lib/stage2-choice-reason-prompt";
import type { Stage2ReferenceChoice } from "@/components/roadmap/types";

export async function getOrGenerateBlankChoiceReasons(params: {
  expressionId: string;
  cached: Stage2ReferenceChoice[] | null;
  expressionEn: string;
  meaningJa: string;
  candidates: string[];
}): Promise<Stage2ReferenceChoice[]> {
  // 既にキャッシュ済みならAIを呼ばずそのまま返す（通常はこちらのパスがほぼ全て）。
  if (params.cached && params.cached.length > 0) {
    return params.cached;
  }
  if (params.candidates.length === 0) {
    return [];
  }

  try {
    const raw = await callGemini(
      buildChoiceReasonSystemPrompt(),
      buildChoiceReasonUserPrompt({
        expressionEn: params.expressionEn,
        meaningJa: params.meaningJa,
        candidates: params.candidates,
      }),
      DEFAULT_GEMINI_MODEL
    );
    const items = parseChoiceReasonJson(raw, params.candidates);

    // 生成に成功した場合だけキャッシュする。空配列やパース失敗のままDBに書き込むと、
    // 一時的な不調で永遠に理由なしのまま固定されてしまうため、次回アクセス時に
    // 再挑戦できるようnullを保った方が安全。
    if (items.length > 0) {
      const { error } = await supabaseAdmin
        .from("stage2_quiz_content")
        .update({ blank_choice_reasons: items })
        .eq("expression_id", params.expressionId);

      if (error) {
        // キャッシュ保存に失敗しても、今回のレスポンス自体は生成済みの内容をそのまま返す
        // （ユーザー体験を止めない。次回アクセス時にまた生成し直すだけで実害は小さい）。
        console.error(`blank_choice_reasonsの保存に失敗しました: ${error.message}`);
      }
    }

    return items;
  } catch (error) {
    // AI呼び出し失敗時は理由なしの単純な参考リストにフォールバックする
    // （参考表示自体を諦めるより実害が小さい。最大2件に揃えるのはUI側の期待に合わせるため）。
    console.error(
      `穴埋め選択肢の理由生成に失敗しました: ${error instanceof Error ? error.message : String(error)}`
    );
    return params.candidates.slice(0, 2).map((text) => ({ text, reasonJa: "" }));
  }
}
