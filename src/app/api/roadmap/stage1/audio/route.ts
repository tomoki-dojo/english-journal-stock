import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getStage1AudioUrl } from "@/lib/supabase/speaking-roadmap";
import { parseStage1Scene } from "@/components/roadmap/types";

// Stage1練習画面専用の音声URL発行。ライブラリの音声再生（Pro限定）とは別ルート。
// 「そのユーザーの現在のStage1出題フレーズ」と一致するexpressionIdでなければnullを返す
// （任意のexpressionIdを指定して聴ける汎用APIにはしない）。
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "この機能を利用するにはログインが必要です" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const expressionId = searchParams.get("expressionId");
  if (!expressionId) {
    return NextResponse.json({ error: "expressionIdが必要です" }, { status: 400 });
  }

  try {
    const url = await getStage1AudioUrl(user.id, expressionId, parseStage1Scene(searchParams.get("scene")));
    if (!url) {
      return NextResponse.json({ error: "現在の出題フレーズと一致しません" }, { status: 403 });
    }
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "音声URLの取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
