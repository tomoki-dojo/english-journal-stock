import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { markAdviceSeen, markAnnouncementSeen } from "@/lib/supabase/roadmap-notices";
import { ANNOUNCEMENTS } from "@/lib/roadmap-notices";

export const dynamic = "force-dynamic";

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

  const body = (typeof json === "object" && json !== null ? json : {}) as Record<string, unknown>;

  try {
    if (body.kind === "advice") {
      await markAdviceSeen(user.id);
      return NextResponse.json({ ok: true });
    }
    if (body.kind === "announcement" && typeof body.id === "number" && ANNOUNCEMENTS.some((a) => a.id === body.id)) {
      await markAnnouncementSeen(user.id, body.id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "kind（advice / announcement）が不正です" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "既読の保存に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
