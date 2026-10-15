import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { markAreasCelebrated, type KuwagataAreaCode } from "@/lib/supabase/kuwagata";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const AREA_CODES: KuwagataAreaCode[] = ["area1", "area2", "area3", "area4", "area5", "aquarium", "ancient"];

// エリア解放の演出を見終わったことを記録する（次回から出さない）。
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
  const raw = (json as { areaCodes?: unknown } | null)?.areaCodes;
  if (!Array.isArray(raw)) {
    return NextResponse.json({ error: "areaCodesが必要です" }, { status: 400 });
  }
  const areaCodes = raw.filter((c): c is KuwagataAreaCode => typeof c === "string" && (AREA_CODES as string[]).includes(c));

  try {
    await markAreasCelebrated(user.id, areaCodes);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "記録に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
