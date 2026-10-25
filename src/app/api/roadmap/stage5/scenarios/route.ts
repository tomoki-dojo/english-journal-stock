import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import {
  listStage5Scenarios,
  getStage5UsageInfo,
  isStage5TrackUnlocked,
} from "@/lib/supabase/speaking-roadmap";
import type { Stage5Track } from "@/components/roadmap/types";

// Stage5（上級ロールプレイ）のシナリオ選択画面用の一覧。?track=daily|businessでトラックを
// 指定する（Stage4と違い、日常編・ビジネス編は完全に独立したトラックのため）。
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function isStage5Track(value: string | null): value is Stage5Track {
  return value === "daily" || value === "business";
}

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "この機能を利用するにはログインが必要です" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const track = searchParams.get("track");
  if (!isStage5Track(track)) {
    return NextResponse.json({ error: "trackはdailyまたはbusinessを指定してください" }, { status: 400 });
  }

  try {
    const unlocked = await isStage5TrackUnlocked(user.id, track);
    if (!unlocked) {
      const label = track === "daily" ? "日常編" : "ビジネス編";
      return NextResponse.json(
        { error: `Stage5${label}は対応するStage4シナリオを5つ習得すると開きます` },
        { status: 403 }
      );
    }

    const plan = await getPlan(user.id);
    const [scenarios, usage] = await Promise.all([
      listStage5Scenarios(user.id, track),
      getStage5UsageInfo(user.id, plan),
    ]);

    return NextResponse.json(
      { scenarios, usage },
      { headers: { "Cache-Control": "no-store, must-revalidate" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "シナリオ一覧の取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
