import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { removeSavedExpression } from "@/lib/supabase/saved-expressions";

// マイリストからブックマークを外す。
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ expressionId: string }> }
) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "この機能を利用するにはログインが必要です" },
      { status: 401 }
    );
  }

  const { expressionId } = await params;
  const result = await removeSavedExpression(user.id, expressionId);

  if (!result.ok) {
    return NextResponse.json(
      { error: "削除に失敗しました", detail: result.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
