// 無料お試し中の人向けの「あと◯日でProが終わります」案内に使う情報（サーバー専用）。
// お試し中（subscription_status = trialing）の人だけStripeに問い合わせる。
import { supabaseAdmin } from "@/lib/supabase/server";
import { getStripeClient } from "@/lib/stripe";
import { getTodayDateKey } from "@/lib/daily-rotation";

export type TrialStatus = {
  // お試しが終わる日（日本時間）までの日数。0＝今日で終わる、1＝明日で終わる
  daysLeft: number;
  trialEndIso: string;
  // カード（お支払い方法）が登録済みなら、お試し後もそのまま続く
  hasPaymentMethod: boolean;
  // お試し後の月額（円）。先行者価格なら480
  monthlyAmount: number | null;
};

function jstDateKey(date: Date): string {
  return getTodayDateKey(date);
}

export async function getTrialStatus(userId: string): Promise<TrialStatus | null> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("subscription_status, stripe_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (profile?.subscription_status !== "trialing" || !profile.stripe_subscription_id) return null;

  try {
    const sub = await getStripeClient().subscriptions.retrieve(profile.stripe_subscription_id as string, {
      expand: ["customer"],
    });
    if (sub.status !== "trialing" || !sub.trial_end) return null;

    const customer = typeof sub.customer === "string" ? null : sub.customer;
    const customerDefault =
      customer && !("deleted" in customer && customer.deleted)
        ? customer.invoice_settings?.default_payment_method
        : null;
    const hasPaymentMethod = Boolean(sub.default_payment_method || customerDefault);

    const trialEnd = new Date(sub.trial_end * 1000);
    const daysLeft = Math.max(
      0,
      Math.round((Date.parse(`${jstDateKey(trialEnd)}T00:00:00Z`) - Date.parse(`${jstDateKey(new Date())}T00:00:00Z`)) / 86_400_000)
    );
    const unitAmount = sub.items.data[0]?.price?.unit_amount ?? null;

    return { daysLeft, trialEndIso: trialEnd.toISOString(), hasPaymentMethod, monthlyAmount: unitAmount };
  } catch (err) {
    console.error("[pro-trial-status] failed", err);
    return null;
  }
}
