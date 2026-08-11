import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { addSavedVocabulary } from "@/lib/supabase/saved-vocabulary";

type SaveRequestBody = {
  vocabularyId: string;
};

function isSaveRequestBody(value: unknown): value is SaveRequestBody {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.vocabularyId === "string" && v.vocabularyId.length > 0;
}

// 単語をお気に入り（マイリスト）に保存する。Free/Pro問わず利用可能。
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "この機能を利用するにはログインが必要です" },
      { status: 401 }
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

  if (!isSaveRequestBody(json)) {
    return NextResponse.json({ error: "vocabularyIdが必要です" }, { status: 400 });
  }

  const result = await addSavedVocabulary(user.id, json.vocabularyId);

  if (!result.ok) {
    if (result.reason === "limit") {
      return NextResponse.json(
        {
          error: `保存できる単語数の上限（${result.limit}件）に達しました。プランをアップグレードすると無制限に保存できます。`,
        },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: "保存に失敗しました", detail: result.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true }, { status: 201 });
}
