import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { KUWAGATA_NICKNAME_MAX_LENGTH, setIndividualNickname } from "@/lib/supabase/kuwagata";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type NicknameRequestBody = {
  individualId: string;
  nickname: string | null;
};

function isNicknameRequestBody(value: unknown): value is NicknameRequestBody {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return typeof body.individualId === "string" && (typeof body.nickname === "string" || body.nickname === null);
}

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

  if (!isNicknameRequestBody(json)) {
    return NextResponse.json({ error: "individualId（文字列）とnickname（文字列またはnull）が必要です" }, { status: 400 });
  }

  // 前後の空白は取り除き、空になったら「名前なし」に戻す。
  const trimmed = json.nickname === null ? "" : json.nickname.trim();
  if ([...trimmed].length > KUWAGATA_NICKNAME_MAX_LENGTH) {
    return NextResponse.json({ error: `名前は${KUWAGATA_NICKNAME_MAX_LENGTH}文字以内にしてください` }, { status: 400 });
  }
  const nickname = trimmed === "" ? null : trimmed;

  try {
    const updated = await setIndividualNickname(user.id, json.individualId, nickname);
    if (!updated) {
      return NextResponse.json({ error: "対象の個体が見つかりません" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, nickname }, { headers: { "Cache-Control": "no-store, must-revalidate" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "名前の保存に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
