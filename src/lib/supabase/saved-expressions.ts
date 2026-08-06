// src/lib/supabase/saved-expressions.ts
// お気に入り（マイリスト）まわりのロジック。保存件数の上限はFreeプランのみ適用。
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPlan } from "@/lib/supabase/profile";
import type { Plan } from "@/lib/plan";

const SAVED_LIMIT: Record<Plan, number | null> = {
  free: 15,
  pro: null,
  premium: null,
};

export async function getSavedLimit(userId: string): Promise<number | null> {
  const plan = await getPlan(userId);
  return SAVED_LIMIT[plan];
}

// 保存済み表現の件数（無料プランの上限チェック用）
export async function countSavedExpressions(userId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("saved_expressions")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) {
    throw new Error(`保存件数の取得に失敗しました: ${error.message}`);
  }

  return count ?? 0;
}

// お気に入りカードの初期表示（保存済みかどうか）に使う、保存済みexpression idの一覧
export async function listSavedExpressionIds(userId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("saved_expressions")
    .select("expression_id")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`保存済み一覧の取得に失敗しました: ${error.message}`);
  }

  return (data ?? []).map((row) => row.expression_id as string);
}

type AddSavedExpressionResult =
  | { ok: true }
  | { ok: false; reason: "limit"; limit: number }
  | { ok: false; reason: "error"; message: string };

export async function addSavedExpression(
  userId: string,
  expressionId: string
): Promise<AddSavedExpressionResult> {
  const limit = await getSavedLimit(userId);

  if (limit !== null) {
    const current = await countSavedExpressions(userId);
    if (current >= limit) {
      return { ok: false, reason: "limit", limit };
    }
  }

  const { error } = await supabaseAdmin
    .from("saved_expressions")
    .upsert(
      { user_id: userId, expression_id: expressionId },
      { onConflict: "user_id,expression_id", ignoreDuplicates: true }
    );

  if (error) {
    return { ok: false, reason: "error", message: error.message };
  }

  return { ok: true };
}

type RemoveSavedExpressionResult = { ok: true } | { ok: false; message: string };

export async function removeSavedExpression(
  userId: string,
  expressionId: string
): Promise<RemoveSavedExpressionResult> {
  const { error } = await supabaseAdmin
    .from("saved_expressions")
    .delete()
    .eq("user_id", userId)
    .eq("expression_id", expressionId);

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}
