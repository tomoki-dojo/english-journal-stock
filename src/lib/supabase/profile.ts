// src/lib/supabase/profile.ts
// ユーザーのplan判定まわりの共通ヘルパー。service_role（supabaseAdmin）で読むため、
// 呼び出し側で必ずuserIdを検証してから渡すこと。
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Plan } from "@/lib/plan";

// profiles.planが未設定・取得失敗時はfree扱い。
export async function getPlan(userId: string): Promise<Plan> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("plan")
    .eq("user_id", userId)
    .single();

  return (data?.plan as Plan) ?? "free";
}
