import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPendingCatchState, getUnlockedAreas, type KuwagataAreaCode } from "@/lib/supabase/kuwagata";
import { startMinigameSession } from "@/lib/kuwagata-minigame";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const AREA_CODES: KuwagataAreaCode[] = ["area1", "area2", "area3", "area4", "area5", "aquarium"];

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
  const areaCode = (json as { areaCode?: unknown } | null)?.areaCode;
  if (typeof areaCode !== "string" || !(AREA_CODES as string[]).includes(areaCode)) {
    return NextResponse.json({ error: "areaCodeが必要です" }, { status: 400 });
  }

  try {
    const [unlockedAreas, pending] = await Promise.all([getUnlockedAreas(user.id), getPendingCatchState(user.id)]);
    if (!unlockedAreas.includes(areaCode as KuwagataAreaCode)) {
      return NextResponse.json({ error: "未解放のエリアでは採集できません" }, { status: 400 });
    }
    if (pending.pendingCatchCount <= 0) {
      return NextResponse.json({ error: "採集チャンスがありません" }, { status: 409 });
    }
    const session = await startMinigameSession(user.id, areaCode as KuwagataAreaCode);
    return NextResponse.json(session, { headers: { "Cache-Control": "no-store, must-revalidate" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "ミニゲームの開始に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
