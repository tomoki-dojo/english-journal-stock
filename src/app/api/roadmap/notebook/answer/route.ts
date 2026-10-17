import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { answerNotebookQuestion } from "@/lib/quiz-notebook";

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
  const body = (json ?? {}) as { sessionId?: unknown; index?: unknown; choice?: unknown };
  if (typeof body.sessionId !== "string") {
    return NextResponse.json({ error: "sessionIdが必要です" }, { status: 400 });
  }

  try {
    const result = await answerNotebookQuestion(user.id, body.sessionId, Number(body.index), Number(body.choice));
    if (!result) {
      return NextResponse.json({ error: "このクイズは無効か、すでに終了しています" }, { status: 409 });
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, must-revalidate" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "答え合わせに失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
