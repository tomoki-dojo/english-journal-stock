import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import { setProSkip } from "@/lib/supabase/speaking-roadmap";

type SkipRequestBody = {
  startStage: 2 | 3 | 4 | 5;
};

function isSkipRequestBody(value: unknown): value is SkipRequestBody {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return v.startStage === 2 || v.startStage === 3 || v.startStage === 4 || v.startStage === 5;
}

// Stageスキップ（#156、Pro限定）の設定を保存する。箱庭地図の「スキップする」ボタンから
// 呼ばれる。Free会員は403で弾き、フロント側はPro訴求バナーを表示する
// （expression-filters.tsxの「絞り込みはPro限定」と同じパターン）。
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "この機能を利用するにはログインが必要です" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストボディがJSONとして不正です" }, { status: 400 });
  }

  if (!isSkipRequestBody(json)) {
    return NextResponse.json({ error: "startStage（2・3・4・5のいずれか）が必要です" }, { status: 400 });
  }

  try {
    const plan = await getPlan(user.id);
    if (plan === "free") {
      return NextResponse.json(
        { error: "Stageスキップ機能はPro会員限定です" },
        { status: 403 }
      );
    }

    await setProSkip(user.id, json.startStage);

    return NextResponse.json(
      { ok: true, startStage: json.startStage },
      { headers: { "Cache-Control": "no-store, must-revalidate" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Stageスキップの設定に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
