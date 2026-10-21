// src/lib/stripe.ts
// Stripeクライアントの初期化。
// STRIPE_SECRET_KEY未設定でもアプリのビルド・起動自体は落ちないよう、
// モジュール読み込み時ではなく実際に使う関数呼び出し時にエラーを出す遅延初期化にしている。
import Stripe from "stripe";
import { isFounderPeriod } from "@/lib/pro-offer";

let cached: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (cached) return cached;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEYが設定されていません。.env.localにStripeのシークレットキーを設定してください。"
    );
  }

  cached = new Stripe(secretKey, { apiVersion: "2026-06-24.dahlia" });
  return cached;
}

// price ID <-> plan のマッピング。Stripeダッシュボードで作成したPro（月額/年額）のprice idを
// 環境変数で渡す（プロダクトの中身はStripe側で管理し、こちらはidだけ知っていればよい設計）。
// 現状はFree/Proの2段階のみ販売（Premiumは未確定のため見送り中。将来追加する場合は
// STRIPE_PRICE_ID_PREMIUM_*を追加してSTRIPE_PRICE_IDSとplanFromPriceIdに足せばよい）。
export type BillingInterval = "monthly" | "annual";

export const STRIPE_PRICE_IDS = {
  pro: {
    monthly: process.env.STRIPE_PRICE_ID_PRO_MONTHLY,
    annual: process.env.STRIPE_PRICE_ID_PRO_ANNUAL,
    // 先行者価格（月480円）。lib/pro-offer.ts の期限までに月払いで始めた人に使う。未設定なら先行者価格は出さない。
    monthlyFounder: process.env.STRIPE_PRICE_ID_PRO_MONTHLY_FOUNDER,
  },
} as const;

export type PaidPlan = "pro";

export function planFromPriceId(priceId: string | null | undefined): PaidPlan | null {
  if (!priceId) return null;
  if (
    priceId === STRIPE_PRICE_IDS.pro.monthly ||
    priceId === STRIPE_PRICE_IDS.pro.annual ||
    priceId === STRIPE_PRICE_IDS.pro.monthlyFounder
  ) {
    return "pro";
  }
  return null;
}

// 先行者価格を今出せるか（期限内、かつStripeの価格IDが設定されている）。
export function isFounderPriceAvailable(now: Date = new Date()): boolean {
  return isFounderPeriod(now) && Boolean(STRIPE_PRICE_IDS.pro.monthlyFounder);
}

// 無料トライアルを使えるか。1アカウント1回：このStripe顧客で過去にサブスクリプション（トライアル含む）が
// 1件でもあれば使えない。顧客がまだ無い、または今のキーの環境に存在しない顧客なら使える。
export async function isTrialEligible(stripe: Stripe, customerId: string | null | undefined): Promise<boolean> {
  if (!customerId) return true;
  try {
    const subs = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 1 });
    return subs.data.length === 0;
  } catch (err) {
    const code = (err as { code?: string } | null)?.code;
    if (code === "resource_missing") return true;
    throw err;
  }
}
