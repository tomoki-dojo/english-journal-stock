// src/lib/supabase/saved-vocabulary.ts
// 単語帳のお気に入り（マイリスト）まわりのロジック。saved-expressions.tsと同じ設計。
// 「保存」はFree/Pro問わず誰でもできる。件数上限はFreeプランのみ適用。
// 学習開始（word_review_progress、Pro限定）とは独立した概念。
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPlan } from "@/lib/supabase/profile";
import type { Plan } from "@/lib/plan";

const SAVED_LIMIT: Record<Plan, number | null> = {
  free: 15,
  pro: null,
  premium: null,
};

export async function getSavedVocabularyLimit(userId: string): Promise<number | null> {
  const plan = await getPlan(userId);
  return SAVED_LIMIT[plan];
}

// 保存済み単語の件数（無料プランの上限チェック用）
export async function countSavedVocabulary(userId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("saved_vocabulary")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) {
    throw new Error(`保存件数の取得に失敗しました: ${error.message}`);
  }

  return count ?? 0;
}

// カードの初期表示（保存済みかどうか）に使う、保存済みvocabulary idの一覧
export async function listSavedVocabularyIds(userId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("saved_vocabulary")
    .select("vocabulary_id")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`保存済み一覧の取得に失敗しました: ${error.message}`);
  }

  return (data ?? []).map((row) => row.vocabulary_id as string);
}

type AddSavedVocabularyResult =
  | { ok: true }
  | { ok: false; reason: "limit"; limit: number }
  | { ok: false; reason: "error"; message: string };

export async function addSavedVocabulary(
  userId: string,
  vocabularyId: string
): Promise<AddSavedVocabularyResult> {
  const limit = await getSavedVocabularyLimit(userId);

  if (limit !== null) {
    const current = await countSavedVocabulary(userId);
    if (current >= limit) {
      return { ok: false, reason: "limit", limit };
    }
  }

  const { error } = await supabaseAdmin
    .from("saved_vocabulary")
    .upsert(
      { user_id: userId, vocabulary_id: vocabularyId },
      { onConflict: "user_id,vocabulary_id", ignoreDuplicates: true }
    );

  if (error) {
    return { ok: false, reason: "error", message: error.message };
  }

  return { ok: true };
}

type RemoveSavedVocabularyResult = { ok: true } | { ok: false; message: string };

export async function removeSavedVocabulary(
  userId: string,
  vocabularyId: string
): Promise<RemoveSavedVocabularyResult> {
  const { error } = await supabaseAdmin
    .from("saved_vocabulary")
    .delete()
    .eq("user_id", userId)
    .eq("vocabulary_id", vocabularyId);

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}

// 学習を始める際、まだ保存されていなければ自動的に保存する（上限チェックはスキップ：
// 学習開始はPro/Premium限定＝上限がそもそも存在しないプランなので実質的に問題にならない）。
export async function ensureSavedVocabulary(userId: string, vocabularyId: string): Promise<void> {
  await supabaseAdmin
    .from("saved_vocabulary")
    .upsert(
      { user_id: userId, vocabulary_id: vocabularyId },
      { onConflict: "user_id,vocabulary_id", ignoreDuplicates: true }
    );
}
