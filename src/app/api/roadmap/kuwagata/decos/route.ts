import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { placeDeco, removeDeco } from "@/lib/supabase/kuwagata-rewards";
import { isBaseDecoKey, isDecoKey, MAX_DECOS_PER_TANK } from "@/lib/kuwagata-decos";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

type Body =
  | { action: "place"; itemKey: string; tankId: string; u: number; v: number }
  | { action: "remove"; itemKey: string };

function parseBody(value: unknown): Body | null {
  if (typeof value !== "object" || value === null) return null;
  const b = value as Record<string, unknown>;
  if (typeof b.itemKey !== "string" || !(isDecoKey(b.itemKey) || isBaseDecoKey(b.itemKey))) return null;
  if (b.action === "remove") return { action: "remove", itemKey: b.itemKey };
  if (
    b.action === "place" &&
    typeof b.tankId === "string" &&
    b.tankId.length > 0 &&
    typeof b.u === "number" &&
    typeof b.v === "number" &&
    b.u >= 0 &&
    b.u <= 1 &&
    b.v >= 0 &&
    b.v <= 1
  ) {
    return { action: "place", itemKey: b.itemKey, tankId: b.tankId, u: b.u, v: b.v };
  }
  return null;
}

// 置物を水槽に置く・外す。
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
  const body = parseBody(json);
  if (!body) {
    return NextResponse.json({ error: "リクエストが不正です" }, { status: 400 });
  }
  try {
    if (body.action === "remove") {
      await removeDeco(user.id, body.itemKey);
      return NextResponse.json({ ok: true });
    }
    const ok = await placeDeco(user.id, body.itemKey, body.tankId, body.u, body.v, MAX_DECOS_PER_TANK);
    if (!ok) {
      return NextResponse.json({ error: "置物を置けません（持っていないか、この水槽が満杯です）" }, { status: 409 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "置物の保存に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
