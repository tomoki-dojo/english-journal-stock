// src/lib/supabase/expression-audio.ts
// 例文音声（Pro/Premium限定）の署名付きURL発行。
// クライアントには生のStorageパスを渡さないため、再生のたびにここでDBから
// パスを引き直し、その場でsigned URLを作る（先にキャッシュ・埋め込みはしない）。
import { supabaseAdmin } from "@/lib/supabase/server";
import type { AudioField } from "@/components/expressions/types";

export const AUDIO_BUCKET = "expression-audio";
const SIGNED_URL_EXPIRY_SECONDS = 60 * 5; // 5分。再生開始までの猶予として十分

type AudioPathRow = {
  audio_expression_path: string | null;
  audio_example_1_path: string | null;
  audio_example_2_path: string | null;
};

// 指定した表現・フィールドの音声について、署名付きURLを発行する。
// パス未登録（未生成）ならnullを返す。
export async function getExpressionAudioSignedUrl(
  expressionId: string,
  field: AudioField
): Promise<string | null> {
  const { data: row, error } = await supabaseAdmin
    .from("expressions")
    .select("audio_expression_path, audio_example_1_path, audio_example_2_path")
    .eq("id", expressionId)
    .single();

  if (error || !row) return null;

  const typedRow = row as AudioPathRow;
  const path =
    field === "expression"
      ? typedRow.audio_expression_path
      : field === "example1"
        ? typedRow.audio_example_1_path
        : typedRow.audio_example_2_path;

  if (!path) return null;

  const { data, error: signError } = await supabaseAdmin.storage
    .from(AUDIO_BUCKET)
    .createSignedUrl(path, SIGNED_URL_EXPIRY_SECONDS);

  if (signError || !data) return null;
  return data.signedUrl;
}
