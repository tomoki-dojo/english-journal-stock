// src/lib/supabase/profile.ts
// ユーザーのplan判定まわりの共通ヘルパー。service_role（supabaseAdmin）で読むため、
// 呼び出し側で必ずuserIdを検証してから渡すこと。
import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Plan } from "@/lib/plan";

// profiles.planが未設定・取得失敗時はfree扱い。
// 同じリクエスト内(layoutとpageなど)では1回だけ読む。
export const getBillingProfile = cache(
  async (userId: string): Promise<{ plan: Plan; subscriptionStatus: string | null }> => {
    const { data } = await supabaseAdmin
      .from("profiles")
      .select("plan, subscription_status")
      .eq("user_id", userId)
      .maybeSingle();

    return {
      plan: (data?.plan as Plan | undefined) ?? "free",
      subscriptionStatus: (data?.subscription_status as string | null | undefined) ?? null,
    };
  }
);

export const getPlan = cache(async (userId: string): Promise<Plan> => (await getBillingProfile(userId)).plan);

// Stageスキップを使えるのは、有料のProだけ（無料のお試し期間中＝trialingは使えない。
// お試しが終わってfreeに戻った場合も使えない）。方針は _reference/shared-board.md 参照。
export async function canUseStageSkip(userId: string): Promise<boolean> {
  const { plan, subscriptionStatus } = await getBillingProfile(userId);
  return plan !== "free" && subscriptionStatus !== "trialing";
}
