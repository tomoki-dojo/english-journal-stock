import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getStage1Next } from "@/lib/supabase/speaking-roadmap";

// Stage1で次に出題する表現を1件返す。全表現を卒業済みならdone: trueを返す。
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "この機能を利用するにはログインが必要です" }, { status: 401 });
  }

  try {
    const next = await getStage1Next(user.id);
    return NextResponse.json(next);
  } catch (err) {
    const message = err instanceof Error ? err.message : "出題データの取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
