// src/lib/stripe.ts
// Stripeクライアントの初期化。
// STRIPE_SECRET_KEY未設定でもアプリのビルド・起動自体は落ちないよう、
// モジュール読み込み時ではなく実際に使う関数呼び出し時にエラーを出す遅延初期化にしている。
import Stripe from "stripe";

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
  },
} as const;

export type PaidPlan = "pro";

export function planFromPriceId(priceId: string | null | undefined): PaidPlan | null {
  if (!priceId) return null;
  if (priceId === STRIPE_PRICE_IDS.pro.monthly || priceId === STRIPE_PRICE_IDS.pro.annual) {
    return "pro";
  }
  return null;
}
