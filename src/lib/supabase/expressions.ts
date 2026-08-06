// src/lib/supabase/expressions.ts
// 表現ストックの一覧取得。閲覧自体は未ログインでも可能な想定のため、
// service_role（supabaseAdmin）で publish_status = '公開' の表現のみ取得する
// （RLS側でもanon/authenticatedは公開分しか見えない設計と合わせている）。
//
// is_premium=trueの表現は、フレーズ本体(expression_en)はFreeユーザーにも見せつつ、
// 意味・例文・類似表現・使用上の注意はこの層でマスクしてからページに渡す
// （クライアントに生データを送らない、サーバーサイドでの防御的なゲーティング）。
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Plan } from "@/lib/plan";
import type {
  Expression,
  Formality,
  Level,
  SceneTag,
  VerificationStatus,
} from "@/components/expressions/types";

const LIST_LIMIT = 500;

// Pro/Premiumなら全表現がロック解除。Free（または未ログイン）はis_premium表現がロックされる。
const UNLOCKED_PLANS: Plan[] = ["pro", "premium"];

type DbExpressionRow = {
  id: string;
  code: string;
  category: string;
  scene_tags: string[];
  formality: string[];
  level: string;
  expression_en: string;
  meaning_ja: string;
  example_1_en: string | null;
  example_1_ja: string | null;
  example_2_en: string | null;
  example_2_ja: string | null;
  similar_expressions: string[] | null;
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
    expressionEn: row.expression_en,
    isPremium: row.is_premium,
    locked: false, // 後段のapplyPlanGatingで確定させる
    meaningJa: row.meaning_ja,
    example1En: row.example_1_en ?? undefined,
    example1Ja: row.example_1_ja ?? undefined,
    example2En: row.example_2_en ?? undefined,
    example2Ja: row.example_2_ja ?? undefined,
    similarExpressions: row.similar_expressions ?? undefined,
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

// 閲覧者のplanに応じて、is_premium表現の中身をマスクする。
// フレーズ本体(expressionEn)・シーンタグ・レベルなどは残し、
// 「答え」にあたる意味・例文・類似表現・使用上の注意だけ隠す。
export function applyPlanGating(expressions: Expression[], plan: Plan): Expression[] {
  const isUnlocked = UNLOCKED_PLANS.includes(plan);

  return expressions.map((expression) => {
    if (!expression.isPremium || isUnlocked) {
      return { ...expression, locked: false };
    }

    return {
      ...expression,
      locked: true,
      meaningJa: undefined,
      example1En: undefined,
      example1Ja: undefined,
      example2En: undefined,
      example2Ja: undefined,
      similarExpressions: undefined,
      usageNotes: undefined,
    };
  });
}

// 公開済み表現の一覧取得（新しい順）
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
