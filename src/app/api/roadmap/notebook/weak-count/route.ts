import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import { getWeakStatus } from "@/lib/quiz-notebook";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// 苦手テストに出せる単語の数と、無料枠(手動登録の語数・今日のテスト回数)の使用状況。
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "この機能を利用するにはログインが必要です" }, { status: 401 });
  }
  try {
    const status = await getWeakStatus(user.id, await getPlan(user.id));
    return NextResponse.json(status, { headers: { "Cache-Control": "no-store, must-revalidate" } });
  } catch {
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }
}
