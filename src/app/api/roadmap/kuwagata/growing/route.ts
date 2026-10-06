import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getGrowingKuwagata } from "@/lib/supabase/kuwagata";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "この機能を利用するにはログインが必要です" }, { status: 401 });
  }

  try {
    const { individuals, adults, hiddenCount, stageUps, maxSizeUps } = await getGrowingKuwagata(user.id);
    return NextResponse.json({ individuals, adults, hiddenCount, stageUps, maxSizeUps }, { headers: { "Cache-Control": "no-store, must-revalidate" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "育成中のクワたんの取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
