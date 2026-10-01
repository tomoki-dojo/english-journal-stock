import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import {
  consumePendingCatch,
  getPendingCatchState,
  getUnlockedAreas,
  type KuwagataAreaCode,
} from "@/lib/supabase/kuwagata";

// クワガタ育成機能：採集フロー刷新（2026-10-01）のAPIルート。
// プレイヤーが棚ページで「採集に出かける」→エリアを選ぶ、という操作をしたときに呼ばれる。
// GETでストック中の採集チャンス数を返し、POSTでそのうち1つを指定エリアで消費する。
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const AREA_CODES: KuwagataAreaCode[] = ["area1", "area2", "area3", "area4", "aquarium"];

function isAreaCode(value: unknown): value is KuwagataAreaCode {
  return typeof value === "string" && (AREA_CODES as string[]).includes(value);
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "この機能を利用するにはログインが必要です" }, { status: 401 });
  }

  try {
    const [pending, unlockedAreas] = await Promise.all([
      getPendingCatchState(user.id),
      getUnlockedAreas(user.id),
    ]);

    return NextResponse.json(
      {
        pendingCatchCount: pending.pendingCatchCount,
        pendingGuaranteedRareCatchCount: pending.pendingGuaranteedRareCatchCount,
        unlockedAreas,
      },
      { headers: { "Cache-Control": "no-store, must-revalidate" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "採集チャンスの取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

type CatchRequestBody = {
  areaCode: KuwagataAreaCode;
};

function isCatchRequestBody(value: unknown): value is CatchRequestBody {
  if (typeof value !== "object" || value === null) return false;
  return isAreaCode((value as Record<string, unknown>).areaCode);
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

  if (!isCatchRequestBody(json)) {
    return NextResponse.json({ error: "areaCode（area1〜area4のいずれか）が必要です" }, { status: 400 });
  }

  try {
    const unlockedAreas = await getUnlockedAreas(user.id);
    if (!unlockedAreas.includes(json.areaCode)) {
      return NextResponse.json({ error: "未解放のエリアでは採集できません" }, { status: 400 });
    }

    const result = await consumePendingCatch(user.id, json.areaCode);
    if (!result) {
      return NextResponse.json({ error: "採集チャンスがありません" }, { status: 409 });
    }

    return NextResponse.json(
      {
        ok: true,
        speciesName: result.species.name,
        speciesKind: result.species.kind,
        rarity: result.species.rarity,
        guaranteedRare: result.guaranteedRare,
        flavorTextJa: result.species.flavorTextJa,
      },
      { headers: { "Cache-Control": "no-store, must-revalidate" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "採集に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
