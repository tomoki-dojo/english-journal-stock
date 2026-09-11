import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { recordExpressionReview, getTodayActivityCount } from "@/lib/supabase/speaking-roadmap";

type ReviewRequestBody = { expressionId: string };

function isReviewRequestBody(value: unknown): value is ReviewRequestBody {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.expressionId === "string" && v.expressionId.length > 0;
}

// 街の掲示板（習得済み表現一覧）からの「復習する」を記録する軽量エンドポイント（タスク#154）。
// Stage1〜3の出題ロジックには一切乗らない共通フロー。streak/statusは変えず、
// last_practiced_atの更新と「今日の賑わい度」の加算だけを行う。
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

  if (!isReviewRequestBody(json)) {
    return NextResponse.json({ error: "expressionId（string）が必要です" }, { status: 400 });
  }

  try {
    await recordExpressionReview(user.id, json.expressionId);
    const activityCount = await getTodayActivityCount(user.id);

    return NextResponse.json(
      { ok: true, activityCount },
      { headers: { "Cache-Control": "no-store, must-revalidate" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "復習の記録に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
