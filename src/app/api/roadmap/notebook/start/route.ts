import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import { isNotebookDifficulty, startNotebookRound, WeakLimitError } from "@/lib/quiz-notebook";

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
  const difficulty = (json as { difficulty?: unknown } | null)?.difficulty;
  if (difficulty !== "weak" && !isNotebookDifficulty(difficulty)) {
    return NextResponse.json({ error: "difficultyが必要です" }, { status: 400 });
  }

  try {
    const round = await startNotebookRound(user.id, difficulty, await getPlan(user.id));
    return NextResponse.json(round, { headers: { "Cache-Control": "no-store, must-revalidate" } });
  } catch (err) {
    if (err instanceof WeakLimitError) {
      return NextResponse.json({ error: err.message, limit: err.kind }, { status: 429 });
    }
    const message = err instanceof Error ? err.message : "開始に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
