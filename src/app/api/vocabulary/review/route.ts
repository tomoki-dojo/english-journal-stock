import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import { submitReviewResult } from "@/lib/supabase/word-review";

type ReviewRequestBody = {
  vocabularyId: string;
  correct: boolean;
};

function isReviewRequestBody(value: unknown): value is ReviewRequestBody {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.vocabularyId === "string" && v.vocabularyId.length > 0 && typeof v.correct === "boolean";
}

// 小テストの回答結果を反映し、間隔反復の箱レベル・次回復習日を更新する。Pro/Premium限定機能。
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "この機能を利用するにはログインが必要です" },
      { status: 401 }
    );
  }

  const plan = await getPlan(user.id);
  if (plan === "free") {
    return NextResponse.json(
      { error: "単語学習はPro/Premium会員限定の機能です" },
      { status: 403 }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "リクエストボディがJSONとして不正です" },
      { status: 400 }
    );
  }

  if (!isReviewRequestBody(json)) {
    return NextResponse.json(
      { error: "vocabularyId（string）とcorrect（boolean）が必要です" },
      { status: 400 }
    );
  }

  const result = await submitReviewResult(user.id, json.vocabularyId, json.correct);

  if (!result.ok) {
    return NextResponse.json(
      { error: "回答結果の反映に失敗しました", detail: result.message },
      { status: 500 }
    );
  }

  return NextResponse.json({
    ok: true,
    newBoxLevel: result.newBoxLevel,
    nextReviewDate: result.nextReviewDate,
  });
}
