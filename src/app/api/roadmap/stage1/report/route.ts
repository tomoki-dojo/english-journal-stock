import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { reportStage1Result } from "@/lib/supabase/speaking-roadmap";

type Stage1ReportRequestBody = {
  expressionId: string;
  correct: boolean;
};

function isStage1ReportRequestBody(value: unknown): value is Stage1ReportRequestBody {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.expressionId === "string" && v.expressionId.length > 0 && typeof v.correct === "boolean";
}

// Stage1の「言えた/言えなかった」の結果を記録する。
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

  if (!isStage1ReportRequestBody(json)) {
    return NextResponse.json(
      { error: "expressionId（string）とcorrect（boolean）が必要です" },
      { status: 400 }
    );
  }

  try {
    const result = await reportStage1Result(user.id, json.expressionId, json.correct);
    return NextResponse.json({ result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "結果の保存に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
