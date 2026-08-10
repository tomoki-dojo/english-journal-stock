import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import { addToLearningList } from "@/lib/supabase/word-review";

type AddRequestBody = {
  vocabularyId: string;
};

function isAddRequestBody(value: unknown): value is AddRequestBody {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.vocabularyId === "string" && v.vocabularyId.length > 0;
}

// 単語を学習リスト（間隔反復の対象）に追加する。Pro/Premium限定機能。
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "この機能を利用するにはログインが必要です" },
      { status: 401 }
    );
  }

  const plan = await getPlan(user.id);
  if (plan === "free") {
    return NextResponse.json(
      { error: "単語学習リストへの追加はPro/Premium会員限定の機能です" },
      { status: 403 }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "リクエストボディがJSONとして不正です" },
      { status: 400 }
    );
  }

  if (!isAddRequestBody(json)) {
    return NextResponse.json({ error: "vocabularyIdが必要です" }, { status: 400 });
  }

  const result = await addToLearningList(user.id, json.vocabularyId);

  if (!result.ok) {
    return NextResponse.json(
      { error: "学習リストへの追加に失敗しました", detail: result.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
