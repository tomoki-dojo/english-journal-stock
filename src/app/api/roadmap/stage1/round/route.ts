import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getStage1Round } from "@/lib/supabase/speaking-roadmap";
import { parseStage1Scene } from "@/components/roadmap/types";

// Stage1のラウンド（アクティブセット最大7件から最大5件をランダム抽出したミニクイズ1回分）を返す。
// 全表現を卒業済みならstatus: "done"を返す。
// 毎回サーバー側で動的に（ランダム抽出込みで）計算する必要があるため、
// Next.js側・ブラウザ側どちらのキャッシュにも乗らないよう明示的に無効化する
// （同一URLへのGETがキャッシュされると、出題プールの並び替えなどサーバー側の変更が
// 反映されず古いラウンドが表示され続ける事象が起きるため）。
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "この機能を利用するにはログインが必要です" }, { status: 401 });
  }

  try {
    const scene = parseStage1Scene(new URL(request.url).searchParams.get("scene"));
    const round = await getStage1Round(user.id, scene);
    return NextResponse.json(round, { headers: { "Cache-Control": "no-store, must-revalidate" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "出題データの取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
