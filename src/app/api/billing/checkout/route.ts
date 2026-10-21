import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  getStripeClient,
  isFounderPriceAvailable,
  isTrialEligible,
  STRIPE_PRICE_IDS,
  type BillingInterval,
} from "@/lib/stripe";
import { PRO_TRIAL_DAYS } from "@/lib/pro-offer";
import { getRequestOrigin } from "@/lib/request-origin";

// Pro（月額/年額）アップグレード用のStripe Checkoutセッションを作る。
// 現状販売しているプランはProのみなので、planは受け取らずintervalだけで決める。
// 既にStripe顧客がいれば使い回し、いなければここで作成してprofilesに保存する。
function isBillingInterval(value: unknown): value is BillingInterval {
  return value === "monthly" || value === "annual";
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "この機能を利用するにはログインが必要です" },
      { status: 401 }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "リクエストボディがJSONとして不正です" },
      { status: 400 }
    );
  }

  const interval = (json as Record<string, unknown> | null)?.interval;
  if (!isBillingInterval(interval)) {
    return NextResponse.json(
      { error: 'intervalは"monthly"または"annual"を指定してください' },
      { status: 400 }
    );
  }

  // 英クワたん(/roadmap)から来た場合は、決済後も英クワたんのPro案内ページに戻す。
  const returnTo = (json as Record<string, unknown> | null)?.returnTo;
  const returnPath = returnTo === "roadmap" ? "/roadmap/pro" : "/settings";
  // どのPro導線から来たか（/roadmap/pro?from=...）。決済後の戻り先とStripeの記録に引き継いで、
  // 「どこから来た人が課金したか」を測れるようにする。英小文字・数字・_のみ、20文字まで。
  const rawFrom = (json as Record<string, unknown> | null)?.from;
  const from = typeof rawFrom === "string" && /^[a-z0-9_]{1,20}$/.test(rawFrom) ? rawFrom : "";
  const trackingQuery = `&interval=${interval}${from ? `&from=${from}` : ""}`;

  // 月払いは、先行者価格の期間中なら先行者価格（lib/pro-offer.ts）。年払いは常に通常価格。
  const useFounderPrice = interval === "monthly" && isFounderPriceAvailable();
  const priceId = useFounderPrice ? STRIPE_PRICE_IDS.pro.monthlyFounder : STRIPE_PRICE_IDS.pro[interval];
  if (!priceId) {
    const envKey = interval === "monthly" ? "STRIPE_PRICE_ID_PRO_MONTHLY" : "STRIPE_PRICE_ID_PRO_ANNUAL";
    return NextResponse.json(
      { error: `Proプラン（${interval}）のStripe価格IDが未設定です。環境変数（${envKey}）を設定してください。` },
      { status: 500 }
    );
  }

  let stripe;
  try {
    stripe = getStripeClient();
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Stripeの初期化に失敗しました" },
      { status: 500 }
    );
  }

  // 1. Stripe顧客を取得または作成
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .single();

  let customerId = profile?.stripe_customer_id ?? null;

  if (!customerId) {
    try {
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { userId: user.id },
      });
      customerId = customer.id;

      await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("user_id", user.id);
    } catch (err) {
      return NextResponse.json(
        {
          error: "Stripe顧客の作成に失敗しました",
          detail: err instanceof Error ? err.message : String(err),
        },
        { status: 502 }
      );
    }
  }

  // 2. Checkoutセッションを作成
  const origin = getRequestOrigin(request);

  // 無料トライアル（月払いのみ・1アカウント1回・カード登録なし）。期限までにカードを登録しなければ
  // サブスクリプションは自動でキャンセルされ、課金はされない。判定に失敗したらトライアルなしで続ける。
  let withTrial = false;
  if (interval === "monthly") {
    try {
      withTrial = await isTrialEligible(stripe, customerId);
    } catch (err) {
      console.error("[checkout] trial eligibility check failed", err);
    }
  }
  const offerQuery = `${withTrial ? "&trial=1" : ""}${useFounderPrice ? "&founder=1" : ""}`;

  const createSession = (customer: string) =>
    stripe.checkout.sessions.create({
      mode: "subscription",
      customer,
      line_items: [{ price: priceId, quantity: 1 }],
      // {CHECKOUT_SESSION_ID}はStripeが実際のセッションIDに置き換える（GA4のpurchaseの重複防止に使う）。
      success_url: `${origin}${returnPath}?checkout=success${trackingQuery}${offerQuery}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${returnPath}?checkout=cancelled${trackingQuery}`,
      allow_promotion_codes: true,
      metadata: { userId: user.id, plan: "pro", interval, from },
      subscription_data: {
        metadata: { userId: user.id, plan: "pro", interval, from, founder: useFounderPrice ? "1" : "0" },
        ...(withTrial
          ? {
              trial_period_days: PRO_TRIAL_DAYS,
              trial_settings: { end_behavior: { missing_payment_method: "cancel" as const } },
            }
          : {}),
      },
      ...(withTrial ? { payment_method_collection: "if_required" as const } : {}),
    });

  try {
    let session;
    try {
      session = await createSession(customerId!);
    } catch (err) {
      // 保存済みのStripe顧客が、いま使っているキーの環境(テスト/本番)に存在しないとき(DBを開発と本番で共有しているため起こる)は、
      // 顧客を作り直して1回だけやり直す。
      const code = (err as { code?: string } | null)?.code;
      if (code !== "resource_missing") throw err;
      const customer = await stripe.customers.create({
        email: user.email ?? undefined,
        metadata: { userId: user.id },
      });
      await supabaseAdmin
        .from("profiles")
        .update({ stripe_customer_id: customer.id })
        .eq("user_id", user.id);
      session = await createSession(customer.id);
    }

    if (!session.url) {
      return NextResponse.json(
        { error: "Checkout URLの取得に失敗しました" },
        { status: 502 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error("Checkoutセッションの作成に失敗しました", err);
    return NextResponse.json(
      {
        error: "Checkoutセッションの作成に失敗しました",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }
}
