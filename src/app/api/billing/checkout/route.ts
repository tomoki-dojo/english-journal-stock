import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getStripeClient, STRIPE_PRICE_IDS, type BillingInterval } from "@/lib/stripe";
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

  const priceId = STRIPE_PRICE_IDS.pro[interval];
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

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/settings?checkout=success`,
      cancel_url: `${origin}/settings?checkout=cancelled`,
      allow_promotion_codes: true,
      metadata: { userId: user.id, plan: "pro", interval },
      subscription_data: {
        metadata: { userId: user.id, plan: "pro", interval },
      },
    });

    if (!session.url) {
      return NextResponse.json(
        { error: "Checkout URLの取得に失敗しました" },
        { status: 502 }
      );
    }

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Checkoutセッションの作成に失敗しました",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }
}
