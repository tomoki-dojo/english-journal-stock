import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { grantGuestCatchChance } from "@/lib/supabase/guest";

export const dynamic = "force-dynamic";

// ゲストがStage1を1ラウンド終えたときに呼ぶ。採集チャンスを1回だけ渡す。
export async function POST() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "この機能を利用するにはログインが必要です" }, { status: 401 });
  }
  if (!user.isAnonymous) {
    return NextResponse.json({ catchChance: false });
  }
  try {
    const catchChance = await grantGuestCatchChance(user.id);
    return NextResponse.json({ catchChance }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "採集チャンスの付与に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
