import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getStripeClient } from "@/lib/stripe";
import { getRequestOrigin } from "@/lib/request-origin";

// 既存の契約者向け：プラン変更・解約・支払い方法変更ができるStripeのBilling Portalへのリンクを発行する。
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "この機能を利用するにはログインが必要です" },
      { status: 401 }
    );
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return NextResponse.json(
      { error: "契約情報が見つかりません。先にプランを契約してください。" },
      { status: 400 }
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

  const origin = getRequestOrigin(request);

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: `${origin}/settings`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Billing Portalセッションの作成に失敗しました",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 502 }
    );
  }
}
