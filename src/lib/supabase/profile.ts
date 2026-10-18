// src/lib/supabase/profile.ts
// ユーザーのplan判定まわりの共通ヘルパー。service_role（supabaseAdmin）で読むため、
// 呼び出し側で必ずuserIdを検証してから渡すこと。
import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Plan } from "@/lib/plan";

// profiles.planが未設定・取得失敗時はfree扱い。
// 同じリクエスト内(layoutとpageなど)では1回だけ読む。
export const getPlan = cache(async (userId: string): Promise<Plan> => {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("plan")
    .eq("user_id", userId)
    .single();

  return (data?.plan as Plan) ?? "free";
});
