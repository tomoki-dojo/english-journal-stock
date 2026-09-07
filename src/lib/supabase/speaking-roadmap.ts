// src/lib/supabase/speaking-roadmap.ts
// スピーキング・ロードマップ機能（会話クイズ・現在地・デイリーストリーク）のデータアクセス層。
// Stage1・2の出題ロジック本体（speaking_stage_progressの読み書き）は別タスクで実装する。
import { supabaseAdmin } from "@/lib/supabase/server";
import { getTodayDateKey } from "@/lib/daily-rotation";
import type {
  OnboardingQuizAnswers,
  OnboardingQuizResult,
  RoadmapStage,
  UserRoadmapState,
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
