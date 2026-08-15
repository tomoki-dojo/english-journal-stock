import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

type ToeicAnswerRequestBody = {
  questionId: string;
  correct: boolean;
};

function isToeicAnswerRequestBody(value: unknown): value is ToeicAnswerRequestBody {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.questionId === "string" && v.questionId.length > 0 && typeof v.correct === "boolean";
}

// TOEIC演習の回答ログを記録する（弱点タグ集計・診断機能用の素データ）。
// SRSのような状態更新はなく、履歴を1行追加するだけ。ログインしていれば誰でも利用可能（Free/Pro問わず）。
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

  if (!isToeicAnswerRequestBody(json)) {
    return NextResponse.json(
      { error: "questionId（string）とcorrect（boolean）が必要です" },
      { status: 400 }
    );
  }

  const { error } = await supabaseAdmin.from("toeic_answer_log").insert({
    user_id: user.id,
    question_id: json.questionId,
    is_correct: json.correct,
  });

  if (error) {
    return NextResponse.json(
      { error: "回答ログの記録に失敗しました", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
