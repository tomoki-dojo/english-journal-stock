import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import { reportStage4Turn, isStage4Unlocked } from "@/lib/supabase/speaking-roadmap";
import { STAGE4_TURN_COUNT, type Stage4Turn } from "@/components/roadmap/types";

type TurnRequestBody = {
  scenarioId: string;
  turnIndex: number;
  history: Stage4Turn[];
  userUtterance: string;
};

function isStage4Turn(value: unknown): value is Stage4Turn {
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
    v.turnIndex <= STAGE4_TURN_COUNT &&
    Array.isArray(v.history) &&
    v.history.every(isStage4Turn) &&
    typeof v.userUtterance === "string"
  );
}

// Stage4（AIロールプレイ）の1ターン分を処理する。サーバーはステートレスで、会話履歴は
// リクエストボディのhistoryで毎回受け取る（DBに永続化しない。_reference/speaking-roadmap-design.md
// 参照）。turnIndex===1のときだけ日次セッション開始回数を消費し、turnIndex===STAGE4_TURN_COUNT
// （最終ターン）のときだけシナリオのstreak更新（卒業判定）を行う。
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
    // バグ修正（2026-09-14）：ページ・シナリオ一覧APIに加えて、AI判定コール自体が
    // 発生するこのエンドポイントでも同じゲートを防御的にチェックする（コストが発生する
    // 処理のため、3箇所の中でも特に守る意味が大きい）。
    const [unlocked, plan] = await Promise.all([isStage4Unlocked(user.id), getPlan(user.id)]);
    if (!unlocked) {
      return NextResponse.json(
        { error: "Stage4はStage3の表現を6つ卒業すると開きます" },
        { status: 403 }
      );
    }

    const outcome = await reportStage4Turn(
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
