import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { finishMinigameSession, getRareBoostMultiplier } from "@/lib/kuwagata-minigame";
import {
  consumePendingCatch,
  getKuwagataShelfTanks,
  getPendingCatchState,
  getUnlockedAreas,
  type KuwagataAreaCode,
} from "@/lib/supabase/kuwagata";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const AREA_CODES: KuwagataAreaCode[] = ["area1", "area2", "area3", "area4", "area5", "aquarium", "ancient"];

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
    return NextResponse.json({ error: "areaCode（エリアのコード）が必要です" }, { status: 400 });
  }

  try {
    const unlockedAreas = await getUnlockedAreas(user.id);
    if (!unlockedAreas.includes(json.areaCode)) {
      return NextResponse.json({ error: "未解放のエリアでは採集できません" }, { status: 400 });
    }

    // ミニゲームの成績(サーバーで採点)に応じて、レア・激レアの出やすさを上げる。
    const body = json as unknown as Record<string, unknown>;
    const correctCount =
      typeof body.sessionId === "string"
        ? await finishMinigameSession(user.id, body.sessionId, json.areaCode, body.answers)
        : 0;
    const wantGuaranteed = typeof body.guaranteed === "boolean" ? body.guaranteed : undefined;
    const result = await consumePendingCatch(
      user.id,
      json.areaCode,
      getRareBoostMultiplier(correctCount),
      wantGuaranteed
    );
    if (!result) {
      return NextResponse.json({ error: "採集チャンスがありません" }, { status: 409 });
    }

    // Freeの棚の表示枠(新種10種類)を超えて、捕まえた子が棚に飾れないときは結果画面で伝える。
    let hiddenOnShelf = false;
    if (result.species.kind === "new") {
      const shelf = await getKuwagataShelfTanks(user.id);
      hiddenOnShelf =
        shelf.hiddenNewSpeciesTankCount > 0 && !shelf.tanks.some((t) => t.speciesId === result.species.id);
    }

    return NextResponse.json(
      {
        ok: true,
        hiddenOnShelf,
        speciesCode: result.species.code,
        speciesName: result.species.name,
        speciesKind: result.species.kind,
        rarity: result.species.rarity,
        guaranteedRare: result.guaranteedRare,
        flavorTextJa: result.species.flavorTextJa,
        correctCount,
      },
      { headers: { "Cache-Control": "no-store, must-revalidate" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "採集に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
