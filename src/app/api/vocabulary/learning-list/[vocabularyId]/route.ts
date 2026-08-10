import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { removeFromLearningList } from "@/lib/supabase/word-review";

// 学習リストから単語を外す。
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ vocabularyId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "この機能を利用するにはログインが必要です" },
      { status: 401 }
    );
  }

  const { vocabularyId } = await params;
  const result = await removeFromLearningList(user.id, vocabularyId);

  if (!result.ok) {
    return NextResponse.json(
      { error: "削除に失敗しました", detail: result.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
