import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPlan } from "@/lib/supabase/profile";
import { assertCanFlagWord, WeakLimitError } from "@/lib/quiz-notebook";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function readWordId(request: Request): Promise<string | null> {
  try {
    const body = (await request.json()) as { wordId?: unknown };
    return typeof body.wordId === "string" && UUID_RE.test(body.wordId) ? body.wordId : null;
  } catch {
    return null;
  }
}

// 単語を「苦手」に入れる（手動）。
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  const wordId = await readWordId(request);
  if (!wordId) return NextResponse.json({ error: "単語が指定されていません" }, { status: 400 });
  try {
    await assertCanFlagWord(user.id, await getPlan(user.id), wordId);
  } catch (err) {
    if (err instanceof WeakLimitError) {
      return NextResponse.json({ error: err.message, limit: "flag" }, { status: 429 });
    }
    return NextResponse.json({ error: "保存できませんでした" }, { status: 500 });
  }
  const { error } = await supabaseAdmin
    .from("quiz_word_weak_flags")
    .upsert({ user_id: user.id, word_id: wordId }, { onConflict: "user_id,word_id" });
  if (error) return NextResponse.json({ error: "保存できませんでした" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// 苦手から外す。
export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  const wordId = await readWordId(request);
  if (!wordId) return NextResponse.json({ error: "単語が指定されていません" }, { status: 400 });
  const { error } = await supabaseAdmin
    .from("quiz_word_weak_flags")
    .delete()
    .eq("user_id", user.id)
    .eq("word_id", wordId);
  if (error) return NextResponse.json({ error: "削除できませんでした" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
