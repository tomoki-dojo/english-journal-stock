import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getStage0Round } from "@/lib/supabase/speaking-roadmap";

// Stage0（使い分けパーツ）のラウンド（アクティブセット最大7件から最大5件をランダム抽出したミニクイズ1回分）を返す。
// Stage1・2と同じ理由でキャッシュを明示的に無効化する。
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "この機能を利用するにはログインが必要です" }, { status: 401 });
  }

  // ?errorTag=冠詞 のようにカテゴリを指定すると、そのカテゴリだけに絞って出題する。
  // 未指定なら全カテゴリを対象にする（従来通り）。
  const errorTag = new URL(request.url).searchParams.get("errorTag") ?? undefined;

  try {
    const round = await getStage0Round(user.id, errorTag);
    return NextResponse.json(round, { headers: { "Cache-Control": "no-store, must-revalidate" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "出題データの取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
