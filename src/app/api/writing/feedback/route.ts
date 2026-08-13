import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";
import { getWritingFeedback, type AiWritingProvider } from "@/lib/ai-writing";

type FeedbackRequestBody = {
  text: string;
  // provider/modelは通常クライアントからは指定しない（サーバー側のデフォルトに従う）。
  // Haiku/Gemini性能比較テスト用に、明示指定できる余地だけ残してある。
  provider?: AiWritingProvider;
  model?: string;
};

function isFeedbackRequestBody(value: unknown): value is FeedbackRequestBody {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.text !== "string" || v.text.length === 0) return false;
  if (v.provider !== undefined && v.provider !== "anthropic" && v.provider !== "gemini") return false;
  if (v.model !== undefined && typeof v.model !== "string") return false;
  return true;
}

// AI添削（実務ライティング添削）。ユーザーが入力した文章をClaude/Geminiに添削させ、
// 学習中の単語・表現を自然に使えないか提案する。文章そのものは保存しない。
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json(
      { error: "この機能を利用するにはログインが必要です" },
      { status: 401 }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json(
      { error: "リクエストボディがJSONとして不正です" },
      { status: 400 }
    );
  }

  if (!isFeedbackRequestBody(json)) {
    return NextResponse.json(
      { error: "text（string）が必要です" },
      { status: 400 }
    );
  }

  const plan = await getPlan(user.id);

  const result = await getWritingFeedback({
    userId: user.id,
    plan,
    text: json.text,
    provider: json.provider,
    model: json.model,
  });

  if (!result.ok) {
    if (result.reason === "limit_exceeded") {
      return NextResponse.json(
        { error: `今月のAI添削の利用回数上限（${result.limit}回）に達しました`, limit: result.limit },
        { status: 429 }
      );
    }
    if (result.reason === "invalid_text") {
      return NextResponse.json({ error: result.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "AI添削の実行に失敗しました", detail: result.message },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    feedback: result.feedback,
    provider: result.provider,
    model: result.model,
    usage: result.usage,
    elapsedMs: result.elapsedMs,
  });
}
