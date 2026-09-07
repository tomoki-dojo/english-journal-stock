import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { completeOnboardingQuiz, judgeOnboardingQuiz } from "@/lib/supabase/speaking-roadmap";
import { OnboardingTrackValues } from "@/components/roadmap/types";
import type { OnboardingQuizAnswers } from "@/components/roadmap/types";

const EXPERIENCE_VALUES = ["beginner", "some", "confident"] as const;

function isOnboardingQuizAnswers(value: unknown): value is OnboardingQuizAnswers {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.correctCount === "number" &&
    v.correctCount >= 0 &&
    v.correctCount <= 3 &&
    typeof v.track === "string" &&
    (OnboardingTrackValues as readonly string[]).includes(v.track) &&
    typeof v.experience === "string" &&
    (EXPERIENCE_VALUES as readonly string[]).includes(v.experience)
  );
}

// 会話クイズの回答を受け取り、開始Stage・トラックを判定してuser_roadmap_stateに保存する。
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

  if (!isOnboardingQuizAnswers(json)) {
    return NextResponse.json(
      { error: "correctCount（0〜3）・track（daily/business）・experienceが必要です" },
      { status: 400 }
    );
  }

  const result = judgeOnboardingQuiz(json);

  try {
    await completeOnboardingQuiz(user.id, result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "保存に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ result });
}
