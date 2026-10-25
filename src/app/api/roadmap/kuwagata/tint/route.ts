import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { applyShizukuToIndividual } from "@/lib/supabase/kuwagata";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type TintRequestBody = { individualId: string; sceneKey: string };

function isTintRequestBody(value: unknown): value is TintRequestBody {
  if (typeof value !== "object" || value === null) return false;
  const body = value as Record<string, unknown>;
  return typeof body.individualId === "string" && typeof body.sceneKey === "string";
}

// 色の実を1つ使って、個体を色づけする（重ね付けは上書き）。
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

  if (!isTintRequestBody(json)) {
    return NextResponse.json({ error: "individualIdとsceneKeyが必要です" }, { status: 400 });
  }

  try {
    const applied = await applyShizukuToIndividual(user.id, json.individualId, json.sceneKey);
    if (!applied) {
      return NextResponse.json({ error: "色の実が足りないか、対象の個体が見つかりません" }, { status: 409 });
    }
    return NextResponse.json({ ok: true, tintKey: json.sceneKey }, { headers: { "Cache-Control": "no-store, must-revalidate" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "色づけに失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
