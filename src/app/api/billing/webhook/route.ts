import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getStripeClient, planFromPriceId } from "@/lib/stripe";

// Stripeからのイベント通知を受け取り、profiles.plan / subscription_status を同期する。
// 生の署名検証が必要なため、bodyはJSONパースせず文字列のまま扱う（App Routerではデフォルトでこれが可能）。
export const runtime = "nodejs";

async function updateProfileByCustomerId(
  customerId: string,
  fields: {
    plan?: "free" | "pro" | "premium";
    stripe_subscription_id?: string | null;
    subscription_status?: string | null;
  }
) {
  const { error } = await supabaseAdmin
    .from("profiles")
    .update(fields)
    .eq("stripe_customer_id", customerId);

  if (error) {
    console.error("[stripe webhook] profiles update failed", error.message);
  }
}

export async function POST(request: Request) {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRETが設定されていません" },
      { status: 500 }
    );
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "stripe-signatureヘッダーがありません" }, { status: 400 });
  }

  const rawBody = await request.text();

  let stripe;
  let event: Stripe.Event;
  try {
    stripe = getStripeClient();
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    return NextResponse.json(
      { error: "署名検証に失敗しました", detail: err instanceof Error ? err.message : String(err) },
      { status: 400 }
    );
  }

  switch (event.type) {
    // Checkout完了時：メタデータのplanを信頼して即座に反映する
    // （customer.subscription.updatedでも後追いで同期されるので二重に安全）
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const plan = session.metadata?.plan as "pro" | "premium" | undefined;
      const customerId =
        typeof session.customer === "string" ? session.customer : session.customer?.id;
      const subscriptionId =
        typeof session.subscription === "string"
          ? session.subscription
          : session.subscription?.id;

      if (userId && plan && customerId) {
        const { error } = await supabaseAdmin
          .from("profiles")
          .update({
            plan,
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId ?? null,
            subscription_status: "active",
          })
          .eq("user_id", userId);

        if (error) {
          console.error("[stripe webhook] checkout.session.completed update failed", error.message);
        }
      }
      break;
    }

    // プラン変更・更新・ステータス変化（active/past_due/canceled等）を同期
    case "customer.subscription.updated":
    case "customer.subscription.created": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;
      const priceId = subscription.items.data[0]?.price?.id;
      const plan = planFromPriceId(priceId);

      await updateProfileByCustomerId(customerId, {
        ...(plan ? { plan } : {}),
        stripe_subscription_id: subscription.id,
        subscription_status: subscription.status,
      });
      break;
    }

    // 解約完了：freeに戻す
    case "customer.subscription.deleted": {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string"
          ? subscription.customer
          : subscription.customer.id;

      await updateProfileByCustomerId(customerId, {
        plan: "free",
        stripe_subscription_id: null,
        subscription_status: "canceled",
      });
      break;
    }

    default:
      // その他のイベントは無視
      break;
  }

  return NextResponse.json({ received: true });
}
