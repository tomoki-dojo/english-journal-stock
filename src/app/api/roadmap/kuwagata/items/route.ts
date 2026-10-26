import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getUserKuwagataItems } from "@/lib/supabase/kuwagata";
import { getActionFlags, getPlacedDecos } from "@/lib/supabase/kuwagata-rewards";
import { NO_ACTION_FLAGS } from "@/lib/kuwagata-actions";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// 持ち物（色の実など）の一覧。個数が1以上のものだけ返す。
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "この機能を利用するにはログインが必要です" }, { status: 401 });
  }

  try {
    const [items, actionFlags, placedDecos] = await Promise.all([
      getUserKuwagataItems(user.id),
      getActionFlags(user.id).catch(() => NO_ACTION_FLAGS),
      getPlacedDecos(user.id).catch(() => []),
    ]);
    return NextResponse.json({ items, actionFlags, placedDecos }, { headers: { "Cache-Control": "no-store, must-revalidate" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "持ち物の取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
