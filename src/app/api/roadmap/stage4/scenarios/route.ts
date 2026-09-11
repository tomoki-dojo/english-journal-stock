import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import { listStage4Scenarios, getStage4UsageInfo } from "@/lib/supabase/speaking-roadmap";

// Stage4（AIロールプレイ）のシナリオ選択画面用の一覧。公開中の全シナリオに、そのユーザーの
// 進捗（習熟度・卒業状態）を重ねて返す。あわせて「今日のセッション あと◯回」の表示用に
// 日次利用回数（消費なし）も返す。
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "この機能を利用するにはログインが必要です" }, { status: 401 });
  }

  try {
    const plan = await getPlan(user.id);
    const [scenarios, usage] = await Promise.all([
      listStage4Scenarios(user.id),
      getStage4UsageInfo(user.id, plan),
    ]);

    return NextResponse.json(
      { scenarios, usage },
      { headers: { "Cache-Control": "no-store, must-revalidate" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "シナリオ一覧の取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
