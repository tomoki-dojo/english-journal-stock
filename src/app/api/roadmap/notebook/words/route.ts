import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import {
  isNotebookDifficulty,
  isNotebookWordStatus,
  listNotebookWords,
  NOTEBOOK_WORD_POS,
} from "@/lib/quiz-notebook";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "この機能を利用するにはログインが必要です" }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const d = Number(params.get("difficulty"));
  const status = params.get("status");
  const pos = params.get("pos");
  const page = Number(params.get("page") ?? 1);
  try {
    const result = await listNotebookWords(user.id, {
      difficulty: isNotebookDifficulty(d) ? d : undefined,
      status: isNotebookWordStatus(status) ? status : undefined,
      pos: pos && (NOTEBOOK_WORD_POS as readonly string[]).includes(pos) ? pos : undefined,
      page: Number.isFinite(page) ? page : 1,
    });
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store, must-revalidate" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
