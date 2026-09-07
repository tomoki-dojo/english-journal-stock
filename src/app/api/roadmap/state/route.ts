import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getUserRoadmapState } from "@/lib/supabase/speaking-roadmap";

// ロードマップの現在地取得。会話クイズ未回答なら state: null を返す（画面側でクイズを出す判定に使う）。
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "この機能を利用するにはログインが必要です" }, { status: 401 });
  }

  const state = await getUserRoadmapState(user.id);
  return NextResponse.json({ state });
}
