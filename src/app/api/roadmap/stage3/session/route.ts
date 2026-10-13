import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import { getStage3Session } from "@/lib/supabase/speaking-roadmap";

// Stage3の「今回の1問」を返す。Stage1・2のラウンド（まとめて5問）とは違い、
// アクティブセットの先頭にある表現1件について、現在のサブステップの問題を都度1問だけ返す
// （1回のAI判定＝1回の本番の発話として扱うため。_reference/speaking-roadmap-design.md参照）。
// 1日のAI判定利用回数が上限に達している場合はstatus: "limit_exceeded"を返す。
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  const startedAt = Date.now();
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "この機能を利用するにはログインが必要です" }, { status: 401 });
  }

  try {
    const plan = await getPlan(user.id);
    const session = await getStage3Session(user.id, plan);
    console.log(`[stage3] 出題API全体: ${Date.now() - startedAt}ms`);
    return NextResponse.json(session, { headers: { "Cache-Control": "no-store, must-revalidate" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "出題データの取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
