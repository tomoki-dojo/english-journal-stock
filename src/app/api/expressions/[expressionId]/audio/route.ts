import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import { getExpressionAudioSignedUrl } from "@/lib/supabase/expression-audio";
import type { AudioField } from "@/components/expressions/types";

const VALID_FIELDS: AudioField[] = ["expression", "example1", "example2"];

function isValidField(value: string | null): value is AudioField {
  return value !== null && (VALID_FIELDS as string[]).includes(value);
}

// 例文音声の署名付きURLを発行する。Pro/Premium限定機能。
export async function GET(
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

  const plan = await getPlan(user.id);
  if (plan === "free") {
    return NextResponse.json(
      { error: "音声再生はPro/Premium会員限定の機能です" },
      { status: 403 }
    );
  }

  const { expressionId } = await params;
  const { searchParams } = new URL(request.url);
  const field = searchParams.get("field");

  if (!isValidField(field)) {
    return NextResponse.json(
      { error: "fieldはexpression / example1 / example2のいずれかを指定してください" },
      { status: 400 }
    );
  }

  const url = await getExpressionAudioSignedUrl(expressionId, field);
  if (!url) {
    return NextResponse.json({ error: "音声がまだ準備されていません" }, { status: 404 });
  }

  return NextResponse.json({ url });
}
