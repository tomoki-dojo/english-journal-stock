import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { reportStage2Result } from "@/lib/supabase/speaking-roadmap";

type Stage2ReportRequestBody = {
  expressionId: string;
  correct: boolean;
};

function isStage2ReportRequestBody(value: unknown): value is Stage2ReportRequestBody {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.expressionId === "string" && v.expressionId.length > 0 && typeof v.correct === "boolean";
}

// Stage2の結果を記録する。選択問題（穴埋め・全文選択）は選択後にクライアント側で正誤判定した
// 結果を受け取り、微改変（自由発話）は自己申告をそのまま受け取る（Stage1と同じ思想）。
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

  if (!isStage2ReportRequestBody(json)) {
    return NextResponse.json(
      { error: "expressionId（string）とcorrect（boolean）が必要です" },
      { status: 400 }
    );
  }

  try {
    const result = await reportStage2Result(user.id, json.expressionId, json.correct);
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "結果の保存に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
