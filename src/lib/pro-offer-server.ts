// Pro案内ページ・設定画面で使う「この人に先行者価格・無料トライアルを出すか」の判定（サーバー専用）。
import { supabaseAdmin } from "@/lib/supabase/server";
import { getStripeClient, isFounderPriceAvailable, isTrialEligible } from "@/lib/stripe";

export type ProOfferState = {
  isPro: boolean;
  isTrialing: boolean;
  // 先行者価格・無料トライアルはFree会員にだけ出す。判定に失敗したら出さないだけにする。
  founderActive: boolean;
  trialEligible: boolean;
};

export async function getProOfferState(userId: string): Promise<ProOfferState> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("plan, subscription_status, stripe_customer_id")
    .eq("user_id", userId)
    .maybeSingle();

  const isPro = ((profile?.plan as string | undefined) ?? "free") !== "free";
  const isTrialing = profile?.subscription_status === "trialing";
  if (isPro) return { isPro, isTrialing, founderActive: false, trialEligible: false };

  let trialEligible = false;
  try {
    trialEligible = await isTrialEligible(getStripeClient(), profile?.stripe_customer_id ?? null);
  } catch (err) {
    console.error("[pro-offer] trial eligibility check failed", err);
  }
  return { isPro, isTrialing, founderActive: isFounderPriceAvailable(), trialEligible };
}
