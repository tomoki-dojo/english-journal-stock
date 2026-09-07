// src/lib/supabase/speaking-roadmap.ts
// スピーキング・ロードマップ機能（会話クイズ・現在地・デイリーストリーク・Stage1出題）のデータアクセス層。
// Stage2以降の出題ロジックは別タスクで実装する。
import { supabaseAdmin } from "@/lib/supabase/server";
import { getTodayDateKey } from "@/lib/daily-rotation";
import { listPublishedExpressions } from "@/lib/supabase/expressions";
import { getExpressionAudioSignedUrl } from "@/lib/supabase/expression-audio";
import {
  STAGE1_GRADUATE_STREAK,
  getStage1SubStep,
  type OnboardingQuizAnswers,
  type OnboardingQuizResult,
  type RoadmapStage,
  type Stage1NextResponse,
  type Stage1ReportResult,
  type UserRoadmapState,
} from "@/components/roadmap/types";

type DbRoadmapStateRow = {
  current_stage: number;
  onboarding_quiz_completed: boolean;
  onboarding_track: string | null;
  total_mastered_count: number;
};

function fromDbRoadmapStateRow(row: DbRoadmapStateRow): UserRoadmapState {
  return {
    currentStage: row.current_stage as RoadmapStage,
    onboardingQuizCompleted: row.onboarding_quiz_completed,
    onboardingTrack: row.onboarding_track as UserRoadmapState["onboardingTrack"],
    totalMasteredCount: row.total_mastered_count,
  };
}

// ユーザーのロードマップ状態を取得する。まだ会話クイズに答えていない（行が存在しない）場合はnull。
export async function getUserRoadmapState(userId: string): Promise<UserRoadmapState | null> {
  const { data, error } = await supabaseAdmin
    .from("user_roadmap_state")
    .select("current_stage, onboarding_quiz_completed, onboarding_track, total_mastered_count")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`ロードマップ状態の取得に失敗しました: ${error.message}`);
  }

  return data ? fromDbRoadmapStateRow(data) : null;
}

// 会話クイズの回答から、開始Stage（1 or 2）とトラックを判定する。
// 実データがまだないため暫定ロジック：
// - 経験「ほぼ初めて」は常にStage1から
// - それ以外は、1〜3問目の正答数が2問以上ならStage2から、それ未満はStage1から
// 後で実際の完走率・離脱率を見ながら調整する前提。
export function judgeOnboardingQuiz(answers: OnboardingQuizAnswers): OnboardingQuizResult {
  const startStage: RoadmapStage =
    answers.experience !== "beginner" && answers.correctCount >= 2 ? 2 : 1;

  return { startStage, track: answers.track };
}

// 会話クイズの結果をuser_roadmap_stateに保存する（初回はinsert、以後は上書き）。
export async function completeOnboardingQuiz(
  userId: string,
  result: OnboardingQuizResult
): Promise<void> {
  const { error } = await supabaseAdmin.from("user_roadmap_state").upsert(
    {
      user_id: userId,
      current_stage: result.startStage,
      onboarding_quiz_completed: true,
      onboarding_track: result.track,
    },
    { onConflict: "user_id" }
  );

  if (error) {
    throw new Error(`会話クイズの結果保存に失敗しました: ${error.message}`);
  }
}

// 今日練習した記録をdaily_streak_logに追記する（1日1行、2回目以降の呼び出しは無視）。
export async function recordDailyPractice(userId: string): Promise<void> {
  const today = getTodayDateKey();

  const { error } = await supabaseAdmin.from("daily_streak_log").upsert(
    {
      user_id: userId,
      practiced_date: today,
    },
    { onConflict: "user_id,practiced_date", ignoreDuplicates: true }
  );

  if (error) {
    throw new Error(`ストリーク記録の保存に失敗しました: ${error.message}`);
  }
}

// 直近の連続練習日数を計算する（daily_streak_logの日付が今日または昨日から
// 何日連続で途切れずに遡れるかをその都度計算する。カウンタのズレを避けるため）。
export async function getCurrentStreak(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("daily_streak_log")
    .select("practiced_date")
    .eq("user_id", userId)
    .order("practiced_date", { ascending: false })
    .limit(400);

  if (error) {
    throw new Error(`ストリークの取得に失敗しました: ${error.message}`);
  }

  const dates = (data ?? []).map((row) => row.practiced_date as string);
  if (dates.length === 0) return 0;

  const today = getTodayDateKey();
  const yesterday = addDaysToDateKey(today, -1);

  // 今日も昨日も記録がなければストリークは途切れている
  if (dates[0] !== today && dates[0] !== yesterday) {
    return 0;
  }

  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const expectedPrev = addDaysToDateKey(dates[i - 1], -1);
    if (dates[i] === expectedPrev) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

// =========================================
// Stage1（音読・シャドーイング）
// =========================================

type Stage1ProgressRow = {
  phrase_id: string;
  status: string;
  correct_streak: number;
};

// ユーザーのStage1進捗（expressionのみ）を、phrase_idをキーにしたMapで取得する。
async function getStage1ProgressMap(userId: string): Promise<Map<string, Stage1ProgressRow>> {
  const { data, error } = await supabaseAdmin
    .from("speaking_stage_progress")
    .select("phrase_id, status, correct_streak")
    .eq("user_id", userId)
    .eq("stage", 1)
    .eq("phrase_source", "expression");

  if (error) {
    throw new Error(`Stage1進捗の取得に失敗しました: ${error.message}`);
  }

  const map = new Map<string, Stage1ProgressRow>();
  for (const row of (data ?? []) as Stage1ProgressRow[]) {
    map.set(row.phrase_id, row);
  }
  return map;
}

// 公開済み表現をcode順（安定した順序）に並べたリストを返す。
// 日常会話コンテンツができるまでは、トラックに関わらず同じ表現ライブラリを出題する。
async function listStage1PhrasePool() {
  const expressions = await listPublishedExpressions();
  return [...expressions].sort((a, b) => a.code.localeCompare(b.code));
}

// Stage1で次に出題する表現を1件決める。全表現を卒業済みならdone: trueを返す。
export async function getStage1Next(userId: string): Promise<Stage1NextResponse> {
  const pool = await listStage1PhrasePool();
  const progressMap = await getStage1ProgressMap(userId);

  const totalCount = pool.length;
  const graduatedCount = pool.filter((e) => progressMap.get(e.id)?.status === "習得済み").length;

  const next = pool.find((e) => progressMap.get(e.id)?.status !== "習得済み");

  if (!next) {
    return { done: true, totalCount };
  }

  const streak = progressMap.get(next.id)?.correct_streak ?? 0;

  return {
    done: false,
    phrase: {
      expressionId: next.id,
      expressionEn: next.expressionEn,
      meaningJa: next.meaningJa,
      hasAudio: next.hasAudioExpression,
    },
    streak,
    subStep: getStage1SubStep(streak),
    remainingCount: totalCount - graduatedCount,
    totalCount,
  };
}

// Stage1の「言えた/言えなかった」の結果を記録する。
// 失敗してもstreakは減らさない（後退させない設計）。streakが卒業ラインに達したら習得済みにする。
export async function reportStage1Result(
  userId: string,
  expressionId: string,
  correct: boolean
): Promise<Stage1ReportResult> {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("speaking_stage_progress")
    .select("correct_streak")
    .eq("user_id", userId)
    .eq("phrase_id", expressionId)
    .eq("phrase_source", "expression")
    .eq("stage", 1)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Stage1進捗の取得に失敗しました: ${fetchError.message}`);
  }

  const currentStreak = existing?.correct_streak ?? 0;
  const newStreak = correct ? Math.min(currentStreak + 1, STAGE1_GRADUATE_STREAK) : currentStreak;
  const graduated = newStreak >= STAGE1_GRADUATE_STREAK;
  const status = graduated ? "習得済み" : newStreak > 0 ? "練習中" : "未着手";

  const { error: upsertError } = await supabaseAdmin.from("speaking_stage_progress").upsert(
    {
      user_id: userId,
      phrase_id: expressionId,
      phrase_source: "expression",
      stage: 1,
      status,
      correct_streak: newStreak,
      last_result: correct ? "correct" : "incorrect",
      last_practiced_at: new Date().toISOString(),
    },
    { onConflict: "user_id,phrase_id,phrase_source,stage" }
  );

  if (upsertError) {
    throw new Error(`Stage1進捗の保存に失敗しました: ${upsertError.message}`);
  }

  // 取り組んだこと自体を「今日練習した」記録にする（正誤は問わない）
  await recordDailyPractice(userId);

  if (graduated) {
    await incrementTotalMasteredCount(userId);
  }

  return { streak: newStreak, subStep: getStage1SubStep(newStreak), graduated };
}

// user_roadmap_state.total_mastered_countを+1する（都度集計を避けるためのキャッシュ更新）。
async function incrementTotalMasteredCount(userId: string): Promise<void> {
  const { data, error: fetchError } = await supabaseAdmin
    .from("user_roadmap_state")
    .select("total_mastered_count")
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`累計習得数の取得に失敗しました: ${fetchError.message}`);
  }

  const current = data?.total_mastered_count ?? 0;

  const { error: updateError } = await supabaseAdmin
    .from("user_roadmap_state")
    .update({ total_mastered_count: current + 1 })
    .eq("user_id", userId);

  if (updateError) {
    throw new Error(`累計習得数の更新に失敗しました: ${updateError.message}`);
  }
}

// Stage1練習画面専用の音声URL発行。
// ライブラリの音声再生（Pro限定）とは別ルートで、「そのユーザーの現在のStage1出題フレーズ」
// と一致する場合のみ発行する（任意のexpressionIdを指定して聴ける汎用APIにはしない）。
export async function getStage1AudioUrl(userId: string, expressionId: string): Promise<string | null> {
  const next = await getStage1Next(userId);
  if (next.done || next.phrase.expressionId !== expressionId) {
    return null;
  }

  return getExpressionAudioSignedUrl(expressionId, "expression");
}
