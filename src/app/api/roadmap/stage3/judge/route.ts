import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import { reportStage3Result } from "@/lib/supabase/speaking-roadmap";

type JudgeRequestBody = { expressionId: string; userSpokenText: string; followUp?: { partnerReplyEn: string } };

function isJudgeRequestBody(value: unknown): value is JudgeRequestBody {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.expressionId === "string" && v.expressionId.length > 0 && typeof v.userSpokenText === "string";
}

// Stage3の発話（音声認識でテキスト化したもの）をAIに判定させ、streak・エラータグ集計を更新する。
// Stage1・2の自己申告とは違い、AIの判定結果（意味が伝わっているか）がそのままstreak進行の
// トリガーになる。1日のAI判定利用回数が上限に達している場合は429を返す。
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export async function POST(request: Request) {
  const startedAt = Date.now();
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

  if (!isJudgeRequestBody(json)) {
    return NextResponse.json(
      { error: "expressionId（string）とuserSpokenText（string）が必要です" },
      { status: 400 }
    );
  }

  const spokenText = json.userSpokenText.trim();
  if (spokenText.length === 0) {
    return NextResponse.json({ error: "発話内容が空です。もう一度声に出してみてください" }, { status: 400 });
  }

  try {
    const plan = await getPlan(user.id);
    const followUp =
      json.followUp && typeof json.followUp.partnerReplyEn === "string" && json.followUp.partnerReplyEn.length > 0
        ? { partnerReplyEn: json.followUp.partnerReplyEn.slice(0, 300) }
        : undefined;
    const outcome = await reportStage3Result(user.id, plan, json.expressionId, spokenText, followUp);

    if (outcome.status === "limit_exceeded") {
      return NextResponse.json(
        { error: `今日のAI判定の利用回数上限（${outcome.limit}回）に達しました`, limit: outcome.limit },
        { status: 429 }
      );
    }
    if (outcome.status === "error") {
      return NextResponse.json({ error: outcome.message }, { status: 502 });
    }

    console.log(`[stage3] 判定API全体: ${Date.now() - startedAt}ms`);
    return NextResponse.json(outcome.result, { headers: { "Cache-Control": "no-store, must-revalidate" } });
  } catch (err) {
    const message = err instanceof Error ? err.message : "判定処理に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
