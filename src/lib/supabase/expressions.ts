// src/lib/supabase/expressions.ts
// 表現ストックの一覧取得。閲覧自体は未ログインでも可能な想定のため、
// service_role（supabaseAdmin）で publish_status = '公開' の表現のみ取得する
// （RLS側でもanon/authenticatedは公開分しか見えない設計と合わせている）。
//
// 意味・例文はプランに関わらず全員に見せる（is_premiumによるマスクは廃止済み）。
// Pro限定は機能面（シーン別絞り込み・マイリスト無制限・音声再生）のみで差別化する。
import { supabaseAdmin } from "@/lib/supabase/server";
import type {
  Expression,
  Formality,
  IntentTag,
  Level,
  SceneTag,
  VerificationStatus,
} from "@/components/expressions/types";

const LIST_LIMIT = 1000;

type DbExpressionRow = {
  id: string;
  code: string;
  category: string;
  scene_tags: string[];
  formality: string[];
  level: string;
  intent_tags: string[] | null;
  expression_en: string;
  meaning_ja: string;
  example_1_en: string | null;
  example_1_ja: string | null;
  example_2_en: string | null;
  example_2_ja: string | null;
  similar_expressions: string[] | null;
  exam_tags: string[] | null;
  usage_notes: string | null;
  verification_status: string;
  audio_memo: string | null;
  publish_status: string;
  is_premium: boolean;
  audio_expression_path: string | null;
  audio_example_1_path: string | null;
  audio_example_2_path: string | null;
  created_at: string;
};

function fromDbRow(row: DbExpressionRow): Expression {
  return {
    id: row.id,
    code: row.code,
    category: row.category,
    sceneTags: row.scene_tags as SceneTag[],
    formality: row.formality as Formality[],
    level: row.level as Level,
    intentTags: (row.intent_tags as IntentTag[] | null) ?? undefined,
    expressionEn: row.expression_en,
    isPremium: row.is_premium,
    locked: false, // 後段のapplyPlanGatingで確定させる
    meaningJa: row.meaning_ja,
    example1En: row.example_1_en ?? undefined,
    example1Ja: row.example_1_ja ?? undefined,
    example2En: row.example_2_en ?? undefined,
    example2Ja: row.example_2_ja ?? undefined,
    similarExpressions: row.similar_expressions ?? undefined,
    examTags: row.exam_tags ?? undefined,
    usageNotes: row.usage_notes ?? undefined,
    verificationStatus: row.verification_status as VerificationStatus,
    audioMemo: row.audio_memo ?? undefined,
    publishStatus: row.publish_status,
    createdAt: row.created_at,
    // 生パスはここで捨てる。クライアントには「あるかどうか」だけ渡す。
    hasAudioExpression: Boolean(row.audio_expression_path),
    hasAudioExample1: Boolean(row.audio_example_1_path),
    hasAudioExample2: Boolean(row.audio_example_2_path),
  };
}

// Pro限定は機能面（シーン別絞り込み・マイリスト無制限・音声再生）のみとし、
// 表現の意味・例文はプランに関わらず常に閲覧可能にする（旧is_premiumマスクは廃止）。
// 呼び出し側（page.tsx等）のシグネチャを変更せずに済むよう関数自体は残してある。
export function applyPlanGating(expressions: Expression[]): Expression[] {
  return expressions.map((expression) => ({ ...expression, locked: false }));
}

// 公開済み表現の一覧取得（新しい順）。TOEIC頻出の表現もexam_tagsが付いた状態でここに含まれる
// （単語帳・表現一覧に吸収する設計に伴い、category絞り込み専用の取得関数は廃止した）。
export async function listPublishedExpressions(): Promise<Expression[]> {
  const { data, error } = await supabaseAdmin
    .from("expressions")
    .select()
    .eq("publish_status", "公開")
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  if (error) {
    throw new Error(`表現一覧の取得に失敗しました: ${error.message}`);
  }

  return (data as DbExpressionRow[]).map(fromDbRow);
}

// マイリスト用：指定したid群の表現を取得（保存した順は呼び出し側で並び替える）
export async function listExpressionsByIds(ids: string[]): Promise<Expression[]> {
  if (ids.length === 0) return [];

  const { data, error } = await supabaseAdmin.from("expressions").select().in("id", ids);

  if (error) {
    throw new Error(`保存済み表現の取得に失敗しました: ${error.message}`);
  }

  return (data as DbExpressionRow[]).map(fromDbRow);
}
