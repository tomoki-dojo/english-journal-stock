// src/lib/supabase/vocabulary.ts
// 単語学習機能のコンテンツ取得。expressions.tsと同じ考え方で、
// 閲覧・保存（マイリスト）・ランダム学習は未ログインでも/Freeでも全員可能（保存はログイン必須）。
// Pro限定は「学習を始めて間隔反復（今日の復習）を行う」機能面のみ。
import { supabaseAdmin } from "@/lib/supabase/server";
import type {
  PartOfSpeech,
  VocabLevel,
  VocabVerificationStatus,
  Vocabulary,
} from "@/components/vocabulary/types";

const LIST_LIMIT = 500;

type DbVocabularyRow = {
  id: string;
  code: string;
  category: string;
  word_en: string;
  part_of_speech: string;
  meaning_ja: string;
  example_en: string | null;
  example_ja: string | null;
  synonyms: string[] | null;
  business_field: string[] | null;
  level: string;
  usage_notes: string | null;
  verification_status: string;
  publish_status: string;
  created_at: string;
};

function fromDbRow(row: DbVocabularyRow): Vocabulary {
  return {
    id: row.id,
    code: row.code,
    category: row.category,
    wordEn: row.word_en,
    partOfSpeech: row.part_of_speech as PartOfSpeech,
    meaningJa: row.meaning_ja,
    exampleEn: row.example_en ?? undefined,
    exampleJa: row.example_ja ?? undefined,
    synonyms: row.synonyms ?? undefined,
    businessField: row.business_field ?? undefined,
    level: row.level as VocabLevel,
    usageNotes: row.usage_notes ?? undefined,
    verificationStatus: row.verification_status as VocabVerificationStatus,
    publishStatus: row.publish_status,
    createdAt: row.created_at,
  };
}

// 公開済み単語の一覧取得（新しい順）
export async function listPublishedVocabulary(): Promise<Vocabulary[]> {
  const { data, error } = await supabaseAdmin
    .from("vocabulary")
    .select()
    .eq("publish_status", "公開")
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    throw new Error(`単語一覧の取得に失敗しました: ${error.message}`);
  }

  return (data as DbVocabularyRow[]).map(fromDbRow);
}

// カテゴリ絞り込みの公開済み単語一覧（新しい順）。TOEIC単語などの拡張カテゴリ表示用。
export async function listPublishedVocabularyByCategory(category: string): Promise<Vocabulary[]> {
  const { data, error } = await supabaseAdmin
    .from("vocabulary")
    .select()
    .eq("publish_status", "公開")
    .eq("category", category)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    throw new Error(`単語一覧の取得に失敗しました: ${error.message}`);
  }

  return (data as DbVocabularyRow[]).map(fromDbRow);
}

// 学習リスト・出題の誤答生成用：指定したid群の単語を取得
export async function listVocabularyByIds(ids: string[]): Promise<Vocabulary[]> {
  if (ids.length === 0) return [];

  const { data, error } = await supabaseAdmin.from("vocabulary").select().in("id", ids);

  if (error) {
    throw new Error(`単語の取得に失敗しました: ${error.message}`);
  }

  return (data as DbVocabularyRow[]).map(fromDbRow);
}
