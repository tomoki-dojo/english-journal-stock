import { supabaseAdmin } from "@/lib/supabase/server";
import { getPendingCatchState } from "@/lib/supabase/kuwagata";
import { completeOnboardingQuiz } from "@/lib/supabase/speaking-roadmap";

// ゲスト(匿名ログイン)用。会話クイズは飛ばして、Stage1から始める状態を作る(べき等)。
export async function ensureGuestRoadmapState(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("user_roadmap_state")
    .select("onboarding_quiz_completed")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(`ゲストの状態確認に失敗しました: ${error.message}`);
  if (data?.onboarding_quiz_completed) return;
  await completeOnboardingQuiz(userId, { startStage: 1, track: "daily" });
}

// ゲストがStage1を1ラウンド終えたときに、採集チャンスを1回だけ渡す。
// すでにチャンスを持っている／もう採集したことがあるなら何もしない(べき等)。
export async function grantGuestCatchChance(userId: string): Promise<boolean> {
  const pending = await getPendingCatchState(userId);
  if (pending.pendingCatchCount > 0) return true;

  const { count, error } = await supabaseAdmin
    .from("kuwagata_individuals")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("obtained_via", "roll");
  if (error) throw new Error(`ゲストの採集履歴の確認に失敗しました: ${error.message}`);
  if ((count ?? 0) > 0) return false;

  const { error: rpcError } = await supabaseAdmin.rpc("add_kuwagata_catch_chance", {
    p_user_id: userId,
    p_guaranteed: false,
  });
  if (rpcError) throw new Error(`採集チャンスの付与に失敗しました: ${rpcError.message}`);
  return true;
}
