import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { removeSavedVocabulary } from "@/lib/supabase/saved-vocabulary";
import { removeFromLearningList } from "@/lib/supabase/word-review";

// マイリストからブックマークを外す。
// 保存は学習の親概念のため、保存を外すと学習リスト（間隔反復の対象）からも一緒に外れる。
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
  const result = await removeSavedVocabulary(user.id, vocabularyId);

  if (!result.ok) {
    return NextResponse.json(
      { error: "削除に失敗しました", detail: result.message },
      { status: 500 }
    );
  }

  // 学習中だった場合も一緒に外す（失敗しても保存の削除自体は成功しているので無視する）
  await removeFromLearningList(user.id, vocabularyId);

  return NextResponse.json({ ok: true });
}
