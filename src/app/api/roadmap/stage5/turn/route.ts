import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import {
  reportStage5Turn,
  isStage5TrackUnlocked,
  getStage5ScenarioTrack,
} from "@/lib/supabase/speaking-roadmap";
import { STAGE5_TURN_COUNT, type Stage5Turn } from "@/components/roadmap/types";

type TurnRequestBody = {
  scenarioId: string;
  turnIndex: number;
  history: Stage5Turn[];
  userUtterance: string;
};

function isStage5Turn(value: unknown): value is Stage5Turn {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (v.role === "ai" || v.role === "user") && typeof v.text === "string";
}

function isTurnRequestBody(value: unknown): value is TurnRequestBody {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.scenarioId === "string" &&
    v.scenarioId.length > 0 &&
    typeof v.turnIndex === "number" &&
    Number.isInteger(v.turnIndex) &&
    v.turnIndex >= 1 &&
    v.turnIndex <= STAGE5_TURN_COUNT &&
    Array.isArray(v.history) &&
    v.history.every(isStage5Turn) &&
    typeof v.userUtterance === "string"
  );
}

// Stage5（上級ロールプレイ）の1ターン分を処理する。仕組みはStage4と同じ完全ステートレス設計
// （_reference/speaking-roadmap-design.md参照）。trackはリクエストボディで受け取らず、
// scenarioIdからDB側のtrackを引いてゲートチェックする（クライアント指定のtrackを信用しない）。
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

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

  if (!isTurnRequestBody(json)) {
    return NextResponse.json(
      { error: "scenarioId・turnIndex（1〜5の整数）・history・userUtteranceが必要です" },
      { status: 400 }
    );
  }

  const utterance = json.userUtterance.trim();
  if (utterance.length === 0) {
    return NextResponse.json({ error: "発話内容が空です。もう一度声に出してみてください" }, { status: 400 });
  }

  try {
    const track = await getStage5ScenarioTrack(json.scenarioId);
    if (!track) {
      return NextResponse.json({ error: "対象のシナリオが見つかりませんでした" }, { status: 404 });
    }

    // ページ・scenarios APIに加えて、AI判定コール自体が発生するこのエンドポイントでも
    // 同じゲートを防御的にチェックする（Stage4のときの教訓と同じ理由）。
    const unlocked = await isStage5TrackUnlocked(user.id, track);
    if (!unlocked) {
      const label = track === "daily" ? "日常編" : "ビジネス編";
      return NextResponse.json(
        { error: `Stage5${label}は対応するStage4シナリオを5つ卒業すると開きます` },
        { status: 403 }
      );
    }

    const plan = await getPlan(user.id);
    const outcome = await reportStage5Turn(
      user.id,
      plan,
      json.scenarioId,
      json.turnIndex,
      json.history,
      utterance
    );

    if (outcome.status === "limit_exceeded") {
      return NextResponse.json(
        { error: `今日のセッション開始回数の上限（${outcome.limit}回）に達しました`, limit: outcome.limit },
        { status: 429 }
      );
    }
    if (outcome.status === "error") {
      return NextResponse.json({ error: outcome.message }, { status: 502 });
    }

    return NextResponse.json(outcome.result, { headers: { "Cache-Control": "no-store, must-revalidate" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "会話処理に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
