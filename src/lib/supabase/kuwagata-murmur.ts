// つぶやきの元になる、習得済み（Stage1）の表現。
import { supabaseAdmin } from "@/lib/supabase/server";
import { getExpressionAudioSignedUrl } from "@/lib/supabase/expression-audio";
import type { Murmur } from "@/lib/kuwagata-murmur";

const MAX_MURMURS = 300;

async function getMasteredExpressionIds(userId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("speaking_stage_progress")
    .select("phrase_id")
    .eq("user_id", userId)
    .eq("stage", 1)
    .eq("phrase_source", "expression")
    .eq("status", "習得済み");
  if (error) throw new Error(`習得済みの表現の取得に失敗しました: ${error.message}`);
  return (data ?? []).map((row) => row.phrase_id as string);
}

// 習得済みで、公開中・音声ありの表現。多すぎる場合はランダムに間引く。
export async function getMasteredMurmurs(userId: string): Promise<Murmur[]> {
  const ids = await getMasteredExpressionIds(userId);
  if (ids.length === 0) return [];
  const sampled = ids.length > MAX_MURMURS ? [...ids].sort(() => Math.random() - 0.5).slice(0, MAX_MURMURS) : ids;
  const result: Murmur[] = [];
  for (let i = 0; i < sampled.length; i += 100) {
    const chunk = sampled.slice(i, i + 100);
    const { data, error } = await supabaseAdmin
      .from("expressions")
      .select("id, expression_en, meaning_ja, scene_tags, audio_expression_path")
      .in("id", chunk)
      .eq("publish_status", "公開")
      .not("audio_expression_path", "is", null);
    if (error) throw new Error(`表現の取得に失敗しました: ${error.message}`);
    for (const row of data ?? []) {
      result.push({
        id: row.id as string,
        en: row.expression_en as string,
        ja: row.meaning_ja as string,
        sceneTags: (row.scene_tags as string[] | null) ?? [],
      });
    }
  }
  return result;
}

// 習得済みの表現についてだけ、音声の署名付きURLを返す。
export async function getMurmurAudioUrl(userId: string, expressionId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("speaking_stage_progress")
    .select("phrase_id")
    .eq("user_id", userId)
    .eq("stage", 1)
    .eq("phrase_source", "expression")
    .eq("status", "習得済み")
    .eq("phrase_id", expressionId)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return getExpressionAudioSignedUrl(expressionId, "expression");
}
