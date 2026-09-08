import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getStage1Round } from "@/lib/supabase/speaking-roadmap";

// Stage1のラウンド（アクティブセット最大7件から最大5件をランダム抽出したミニクイズ1回分）を返す。
// 全表現を卒業済みならstatus: "done"を返す。
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "この機能を利用するにはログインが必要です" }, { status: 401 });
  }

  try {
    const round = await getStage1Round(user.id);
    return NextResponse.json(round);
  } catch (err) {
    const message = err instanceof Error ? err.message : "出題データの取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
