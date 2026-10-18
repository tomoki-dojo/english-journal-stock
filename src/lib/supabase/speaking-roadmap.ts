// src/lib/supabase/speaking-roadmap.ts
// スピーキング・ロードマップ機能（会話クイズ・現在地・デイリーストリーク・Stage1出題）のデータアクセス層。
// Stage2以降の出題ロジックは別タスクで実装する。
import { supabaseAdmin } from "@/lib/supabase/server";
import { getTodayDateKey } from "@/lib/daily-rotation";
import { ttlCached } from "@/lib/ttl-cache";
import { getExpressionAudioSignedUrl } from "@/lib/supabase/expression-audio";
import { judgeStage3Answer, checkStage3Usage } from "@/lib/stage3-ai";
import { judgeStage4Turn, checkStage4Usage } from "@/lib/stage4-ai";
import { judgeStage5Turn, checkStage5Usage } from "@/lib/stage5-ai";
import { getOrGenerateBlankChoiceReasons } from "@/lib/stage2-choice-reasons";
import { getOrGenerateStage2Variations } from "@/lib/stage2-variation";
import { STAGE2_VARIATION_LABEL, type Stage2Variation } from "@/lib/stage2-variation-prompt";
import { getOrGenerateStage3HintBlank } from "@/lib/stage3-hint-blank";
import {
  addGrowthBoost,
  addSizeGrowthPoints,
  KUWAGATA_GRADUATION_BOOST_DAYS,
  recordStageClearCatch,
  stockCatchChanceOnMasteredCountUpdate,
  forceHatchTeppenToAdult,
} from "@/lib/supabase/kuwagata";
import type { Plan } from "@/lib/plan";
import {
  STAGE0_ACTIVE_SET_SIZE,
  STAGE0_GRADUATE_STREAK,
  STAGE0_ROUND_SIZE,
  STAGE1_ACTIVE_SET_SIZE,
  STAGE1_GRADUATE_STREAK,
  STAGE1_ROUND_SIZE,
  type Stage1Scene,
  STAGE2_ACTIVE_SET_SIZE,
  STAGE2_GRADUATE_STREAK,
  STAGE2_ROUND_SIZE,
  STAGE3_ACTIVE_SET_SIZE,
  STAGE3_GRADUATE_STREAK,
  STAGE3_UNLOCK_STAGE1_GRADUATIONS,
  STAGE4_GRADUATE_STREAK,
  STAGE4_TURN_COUNT,
  STAGE4_UNLOCK_STAGE3_GRADUATIONS,
  STAGE5_GRADUATE_STREAK,
  STAGE5_TURN_COUNT,
  STAGE5_UNLOCK_STAGE4_GRADUATIONS,
  computeWarmth,
  getStage1SubStep,
  getStage2SubStep,
  getStage3SubStep,
  type OnboardingQuizAnswers,
  type OnboardingQuizResult,
  type RoadmapStage,
  type Stage0ReportResult,
  type Stage0RoundResponse,
  type Stage1ReportResult,
  type Stage1RoundResponse,
  type Stage2ReferenceChoice,
  type Stage2ReportResult,
  type Stage2RoundQuestion,
  type Stage2RoundResponse,
  type Stage2SubStep,
  type Stage3SessionResponse,
  type Stage3Question,
  STAGE3_ROUND_SIZE,
  type Stage3JudgeResult,
  type Stage4ScenarioListItem,
  type Stage4Turn,
  type Stage4TurnOutcome,
  type Stage5ScenarioListItem,
  type Stage5Track,
  type Stage5Turn,
  type Stage5TurnOutcome,
  type UserRoadmapState,
} from "@/components/roadmap/types";

type DbRoadmapStateRow = {
  current_stage: number;
  onboarding_quiz_completed: boolean;
  onboarding_track: string | null;
  total_mastered_count: number;
  pro_skip_enabled: boolean;
  pro_skip_start_stage: number | null;
};

function fromDbRoadmapStateRow(row: DbRoadmapStateRow): UserRoadmapState {
  return {
    currentStage: row.current_stage as RoadmapStage,
    onboardingQuizCompleted: row.onboarding_quiz_completed,
    onboardingTrack: row.onboarding_track as UserRoadmapState["onboardingTrack"],
    totalMasteredCount: row.total_mastered_count,
    proSkipEnabled: row.pro_skip_enabled,
    proSkipStartStage: row.pro_skip_start_stage as UserRoadmapState["proSkipStartStage"],
  };
}

// ユーザーのロードマップ状態を取得する。まだ会話クイズに答えていない（行が存在しない）場合はnull。
export async function getUserRoadmapState(userId: string): Promise<UserRoadmapState | null> {
  const { data, error } = await supabaseAdmin
    .from("user_roadmap_state")
    .select(
      "current_stage, onboarding_quiz_completed, onboarding_track, total_mastered_count, pro_skip_enabled, pro_skip_start_stage"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`ロードマップ状態の取得に失敗しました: ${error.message}`);
  }

  return data ? fromDbRoadmapStateRow(data) : null;
}

// Stageスキップ（#156、Pro限定）の設定を保存する。オンボーディング診断済みのユーザーのみ呼ばれる
// 想定（user_roadmap_stateの行は必ず存在する）なのでupdateでよい。既に有効な状態で別のStageを
// 選び直した場合も、同じ呼び出しで単純に上書きする（無効化用の別関数は用意しない。
// 「今どこから始めたいか」を選び直すだけのUXにしているため）。
export async function setProSkip(userId: string, startStage: 2 | 3 | 4): Promise<void> {
  const { error } = await supabaseAdmin
    .from("user_roadmap_state")
    .update({ pro_skip_enabled: true, pro_skip_start_stage: startStage })
    .eq("user_id", userId);

  if (error) {
    throw new Error(`Stageスキップ設定の保存に失敗しました: ${error.message}`);
  }

  // クワガタ育成機能（#257）：Stageスキップはstreak卒業の閾値を実質的に飛び越えるため、
  // 通常なら各Stage解放のタイミングで発火するrecordStageClearCatch（既知種の確定入手）が
  // 一度も呼ばれず、スキップした区間の既知種だけ永久に手に入らなくなってしまう。
  // そのため、スキップ発動時に「スキップした区間」に対応する既知種をまとめて確定配布する
  // （設計doc「Free/Proの扱い」参照）。startStageより前のstage_trigger（2〜4の範囲）が対象。
  // stage_trigger=1（エークワたん）はサインアップ時点で既に配布済みのため対象外。
  // stage_trigger=5（テッペンクワたん）はStage5実卒業時の特別な強制羽化と結びついているため、
  // スキップの一括配布対象にはしない（Stage5自体はproSkipEnabledで即解放されるが、
  // 卵の配布はStage4卒業の実データに基づくgetStage5DomainReadiness判定を経由する）。
  const skippedTriggers = [2, 3, 4].filter((trigger) => trigger < startStage);
  for (const trigger of skippedTriggers) {
    await recordStageClearCatch(userId, trigger);
  }
  // Stage5はスキップで即解放されるので、通常の「Stage5解放の日に届く卵」と同じく、テッペンクワたんの卵もここで配る。
  // 羽化はこれまでどおりStage5の実卒業で起きる。
  await recordStageClearCatch(userId, 5);
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

// 今日の「賑わい度」（タスク#154）を+1する。Stage0〜3の練習（reportStageStreakResult経由）と
// 復習フロー（recordExpressionReview）の両方から呼ばれる。daily_streak_logと違い1日1回では
// なく、行った回数だけ加算する（読み込み→書き込みのため理論上は競合の余地があるが、
// ゲーミフィケーション用の演出値であり厳密な整合性は求めないため許容する）。
async function incrementDailyActivity(userId: string): Promise<void> {
  const dateKey = getTodayDateKey();

  const { data, error: fetchError } = await supabaseAdmin
    .from("daily_activity_log")
    .select("count")
    .eq("user_id", userId)
    .eq("date_key", dateKey)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`賑わい度の取得に失敗しました: ${fetchError.message}`);
  }

  const current = data?.count ?? 0;

  const { error: upsertError } = await supabaseAdmin.from("daily_activity_log").upsert(
    { user_id: userId, date_key: dateKey, count: current + 1 },
    { onConflict: "user_id,date_key" }
  );

  if (upsertError) {
    throw new Error(`賑わい度の保存に失敗しました: ${upsertError.message}`);
  }
}

// ロードマップホーム画面に出す「今日の賑わい度」。日をまたげば自然に0に戻る
// （その日のdate_keyの行がまだ存在しないだけなので、リセット処理は不要）。
export async function getTodayActivityCount(userId: string): Promise<number> {
  const dateKey = getTodayDateKey();

  const { data, error } = await supabaseAdmin
    .from("daily_activity_log")
    .select("count")
    .eq("user_id", userId)
    .eq("date_key", dateKey)
    .maybeSingle();

  if (error) {
    throw new Error(`賑わい度の取得に失敗しました: ${error.message}`);
  }

  return data?.count ?? 0;
}

// 連続練習の統計値（現在の連続日数／過去最長の連続日数／累計練習日数）をまとめて計算する。
// 2026-09-14追加：それまではgetCurrentStreak（現在の連続日数だけを返す）を使い、
// UI側も「◯日連続で練習中！」／「今日から練習を始めよう」の二択で表示していたが、
// 「1年続けても1日休んだだけで『今日から始めよう』になるのは違和感がある」という
// 指摘を受け、現在の連続日数だけでなく「これまでの積み上げ」も併記する方針に変更した
// （表示側の詳細は_reference/speaking-roadmap-design.md参照）。
// daily_streak_logの全履歴を1回のクエリで取得し、その1回分のデータから
// current/longest/totalDaysの3つをまとめて算出する（クエリを3回に分けない）。
export type StreakStats = {
  current: number; // 現在の連続練習日数（今日 or 昨日から遡って何日連続で記録があるか）
  longest: number; // 過去最長の連続練習日数（現在の連続記録を含む、全履歴中の最大run長）
  totalDays: number; // 累計の練習日数（連続しているかを問わない、記録がある日の総数）
};

export async function getStreakStats(userId: string): Promise<StreakStats> {
  const { data, error } = await supabaseAdmin
    .from("daily_streak_log")
    .select("practiced_date")
    .eq("user_id", userId)
    .order("practiced_date", { ascending: false })
    .limit(2000);

  if (error) {
    throw new Error(`ストリークの取得に失敗しました: ${error.message}`);
  }

  const dates = (data ?? []).map((row) => row.practiced_date as string);
  const totalDays = dates.length;

  if (totalDays === 0) {
    return { current: 0, longest: 0, totalDays: 0 };
  }

  const today = getTodayDateKey();
  const yesterday = addDaysToDateKey(today, -1);

  // 現在の連続日数：今日 or 昨日から記録がある場合だけ、そこから遡って連続日数を数える
  // （今日も昨日も記録がなければストリークは途切れているので0のまま）
  let current = 0;
  if (dates[0] === today || dates[0] === yesterday) {
    current = 1;
    for (let i = 1; i < dates.length; i++) {
      const expectedPrev = addDaysToDateKey(dates[i - 1], -1);
      if (dates[i] === expectedPrev) {
        current += 1;
      } else {
        break;
      }
    }
  }

  // 過去最長の連続日数：datesは新しい順に並んでいるので、そのまま連続run長の
  // 最大値を数える（現在進行中のrunも含めて比較するので「連続記録更新中」の判定に使える）。
  let longest = 1;
  let run = 1;
  for (let i = 1; i < dates.length; i++) {
    const expectedPrev = addDaysToDateKey(dates[i - 1], -1);
    if (dates[i] === expectedPrev) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > longest) longest = run;
  }

  return { current, longest, totalDays };
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

type Stage1PoolRow = {
  id: string;
  expressionEn: string;
  meaningJa?: string;
  hasAudioExpression: boolean;
  sceneTags: string[];
};

// 日常会話向けのシーンタグ（2026-09-09追加）。design doc「Stage1〜3は日常会話寄りのコンテンツで
// 進め、Stage4〜5でビジネスシーンに橋渡しする」という方針に対し、Stage1・2の出題プールが
// 単純なcode順だとビジネス表現（会議・交渉など、code順で先に登録されている）が優先されてしまい、
// 日常会話コンテンツにほぼ辿り着けない状態だった。そのため出題順は「日常会話タグを含むものを
// 先に、それ以外は従来通りcode順」という優先度付けに変更する。
const DAILY_SCENE_TAGS = ["買い物", "外食", "旅行", "友人", "体調"] as const;

function isDailyScene(sceneTags: string[]): boolean {
  return sceneTags.some((tag) => (DAILY_SCENE_TAGS as readonly string[]).includes(tag));
}

// 日常会話タグを含む行を先頭に寄せる安定ソート（各グループ内の元の順序＝code順は維持される）。
function sortDailyFirst<T extends { sceneTags: string[] }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => Number(isDailyScene(b.sceneTags)) - Number(isDailyScene(a.sceneTags)));
}

// 公開済み表現を「日常会話タグを含むもの」「含まないもの」に分けてそれぞれcode順に取得し、
// 前者→後者の順に連結する。
// 【2026-09-09 発覚したバグの記録】以前は.order("code").limit(5000)で全件を一括取得してから
// JS側のsortDailyFirst()で並べ替えていたが、SupabaseのPostgREST側にはクライアントの.limit()指定
// より優先されるデフォルトの行数上限（db-max-rows、既定1000件）があり、これを超える分は
// 「取得された後」ではなく「取得される前」に切り捨てられる。公開表現がちょうど1000件を超え、
// かつ新規追加した日常会話20件のcodeが末尾（EX-1071〜）だったため、JS側の並べ替えが実行される
// 前にデータごと届かず、並べ替えが一切効いていないように見える不具合が起きていた。
// 対策として、日常会話タグを含む行は専用のクエリ（.overlaps）で別出しにして取得することで、
// 全体件数が1000件を超えても日常会話タグの行だけは常に取得漏れしないようにする。
// 出題プールは全ユーザー共通のマスタなので、サーバーのメモリに5分だけ持つ(毎ラウンド最大2000行を取り直さない)。
const MASTER_CACHE_TTL_MS = 5 * 60 * 1000;
const listStage1PhrasePool = ttlCached(
  MASTER_CACHE_TTL_MS,
  (scene?: Stage1Scene | null) => fetchStage1PhrasePool(scene),
  (scene) => scene ?? ""
);

async function fetchStage1PhrasePool(scene?: Stage1Scene | null): Promise<Stage1PoolRow[]> {
  const selectCols = "id, expression_en, meaning_ja, audio_expression_path, scene_tags";

  // シーンが選ばれているときは、そのシーンの表現だけをcode順に返す（1シーン最大でも数百件のため1回の取得で足りる）。
  if (scene) {
    const { data, error } = await supabaseAdmin
      .from("expressions")
      .select(selectCols)
      .eq("publish_status", "公開")
      .contains("scene_tags", [scene])
      .order("code", { ascending: true })
      .limit(1000);

    if (error) {
      throw new Error(`Stage1出題プールの取得に失敗しました: ${error.message}`);
    }
    return (data ?? []).map((row) => ({
      id: row.id as string,
      expressionEn: row.expression_en as string,
      meaningJa: (row.meaning_ja as string | null) ?? undefined,
      hasAudioExpression: Boolean(row.audio_expression_path),
      sceneTags: (row.scene_tags as string[] | null) ?? [],
    }));
  }
  const dailyTagsLiteral = `{${DAILY_SCENE_TAGS.join(",")}}`;

  const [dailyRes, restRes] = await Promise.all([
    supabaseAdmin
      .from("expressions")
      .select(selectCols)
      .eq("publish_status", "公開")
      .overlaps("scene_tags", DAILY_SCENE_TAGS as unknown as string[])
      .order("code", { ascending: true })
      .limit(1000),
    supabaseAdmin
      .from("expressions")
      .select(selectCols)
      .eq("publish_status", "公開")
      .not("scene_tags", "ov", dailyTagsLiteral)
      .order("code", { ascending: true })
      .limit(1000),
  ]);

  if (dailyRes.error) {
    throw new Error(`Stage1出題プールの取得に失敗しました: ${dailyRes.error.message}`);
  }
  if (restRes.error) {
    throw new Error(`Stage1出題プールの取得に失敗しました: ${restRes.error.message}`);
  }

  const mapRow = (row: Record<string, unknown>): Stage1PoolRow => ({
    id: row.id as string,
    expressionEn: row.expression_en as string,
    meaningJa: (row.meaning_ja as string | null) ?? undefined,
    hasAudioExpression: Boolean(row.audio_expression_path),
    sceneTags: (row.scene_tags as string[] | null) ?? [],
  });

  // 日常会話タグの行は既にoverlapsクエリで絞り込み済みなので、ここでのsortDailyFirstは
  // 「万一分類が重複・漏れした場合の保険」程度の意味。実質的な並び順は上のクエリ2本の連結で決まる。
  return [...(dailyRes.data ?? []).map(mapRow), ...(restRes.data ?? []).map(mapRow)];
}

// Stage1のアクティブセット（未卒業フレーズの先頭からSTAGE1_ACTIVE_SET_SIZE件）を計算する。
// 新しい状態は持たず、毎回動的に計算するだけでよい（あるフレーズが卒業した瞬間、
// 自動的にアクティブセットから外れ、次のフレーズが繰り上がる）。
async function getStage1ActiveSet(userId: string, scene?: Stage1Scene | null): Promise<{
  activeSet: (Stage1PoolRow & { streak: number })[];
  totalCount: number;
  remainingCount: number;
}> {
  const [pool, progressMap] = await Promise.all([listStage1PhrasePool(scene), getStage1ProgressMap(userId)]);

  const totalCount = pool.length;
  const nonGraduated = pool.filter((e) => progressMap.get(e.id)?.status !== "習得済み");
  const remainingCount = nonGraduated.length;

  const activeSet = nonGraduated.slice(0, STAGE1_ACTIVE_SET_SIZE).map((e) => ({
    ...e,
    streak: progressMap.get(e.id)?.correct_streak ?? 0,
  }));

  return { activeSet, totalCount, remainingCount };
}

// Stage1のラウンド（ミニクイズ1回分）を決める。
// アクティブセット（最大7件）から最大5件をランダムに選んで返す。全て卒業済みならdoneを返す。
export async function getStage1Round(userId: string, scene?: Stage1Scene | null): Promise<Stage1RoundResponse> {
  const { activeSet, totalCount, remainingCount } = await getStage1ActiveSet(userId, scene);

  if (activeSet.length === 0) {
    return { status: "done", totalCount };
  }

  const sampled = shuffleArray(activeSet).slice(0, Math.min(STAGE1_ROUND_SIZE, activeSet.length));

  return {
    status: "round",
    questions: sampled.map((e) => ({
      expressionId: e.id,
      expressionEn: e.expressionEn,
      meaningJa: e.meaningJa,
      hasAudio: e.hasAudioExpression,
      warmth: computeWarmth(e.streak, STAGE1_GRADUATE_STREAK),
    })),
    remainingCount,
    totalCount,
  };
}

// Stage1・2共通：speaking_stage_progressのcorrect_streakを更新する。
// 失敗してもstreakは減らさない（後退させない設計）。streakが卒業ラインに達したら習得済みにする。
// 取り組んだこと自体を「今日練習した」記録にする（正誤は問わない）。
async function reportStageStreakResult(
  userId: string,
  stage: 0 | 1 | 2 | 3 | 4 | 5,
  expressionId: string,
  graduateStreak: number,
  correct: boolean,
  phraseSource: "expression" | "usage_rule" | "stage4_scenario" | "stage5_scenario" = "expression"
): Promise<{ streak: number; graduated: boolean }> {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("speaking_stage_progress")
    .select("correct_streak, status")
    .eq("user_id", userId)
    .eq("phrase_id", expressionId)
    .eq("phrase_source", phraseSource)
    .eq("stage", stage)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Stage${stage}進捗の取得に失敗しました: ${fetchError.message}`);
  }

  const wasGraduated = existing?.status === "習得済み";
  const currentStreak = existing?.correct_streak ?? 0;
  const newStreak = correct ? Math.min(currentStreak + 1, graduateStreak) : currentStreak;
  const graduated = newStreak >= graduateStreak;
  const status = graduated ? "習得済み" : newStreak > 0 ? "練習中" : "未着手";

  // 進捗の保存・今日の練習記録・賑わい度は互いに依存しないので同時に行う。
  // 卒業時の累計+1と成長ブーストも、進捗の内容を使わないので同じ段で走らせる。
  const saveProgress = async () => {
    const { error: upsertError } = await supabaseAdmin.from("speaking_stage_progress").upsert(
      {
        user_id: userId,
        phrase_id: expressionId,
        phrase_source: phraseSource,
        stage,
        status,
        correct_streak: newStreak,
        last_result: correct ? "correct" : "incorrect",
        last_practiced_at: new Date().toISOString(),
      },
      { onConflict: "user_id,phrase_id,phrase_source,stage" }
    );
    if (upsertError) {
      throw new Error(`Stage${stage}進捗の保存に失敗しました: ${upsertError.message}`);
    }
  };

  // クワガタ育成機能：初めて習得済みになった回だけ、育成中の個体の成長をブーストし、成虫の個体を大きくする
  // （同じ項目を再挑戦して稼げないよう、既に習得済みだった場合は対象外）。
  // Stage5は卒業でテッペンクワたんが即成虫になるため、ブースト対象外。
  const grantBoost = async () => {
    if (!(graduated && !wasGraduated && stage <= 4)) return;
    try {
      const reward = KUWAGATA_GRADUATION_BOOST_DAYS[stage as 0 | 1 | 2 | 3 | 4];
      // 育成中の個体は成長日数、成虫の個体は成長ポイント（サイズレベルの元）として同じ重みで加算する。
      await Promise.all([addGrowthBoost(userId, reward), addSizeGrowthPoints(userId, reward)]);
    } catch (err) {
      // ご褒美の加算に失敗しても、練習の記録自体は成功扱いにする。
      console.error(err);
    }
  };

  await Promise.all([
    saveProgress(),
    recordDailyPractice(userId),
    incrementDailyActivity(userId),
    graduated ? incrementTotalMasteredCount(userId) : Promise.resolve(),
    grantBoost(),
  ]);

  return { streak: newStreak, graduated };
}

// Stage1の「言えた/言えなかった」の結果を記録する。
export async function reportStage1Result(
  userId: string,
  expressionId: string,
  correct: boolean
): Promise<Stage1ReportResult> {
  const { streak, graduated } = await reportStageStreakResult(
    userId,
    1,
    expressionId,
    STAGE1_GRADUATE_STREAK,
    correct
  );

  // 卒業した回だけ、その卒業がStage2の解放条件（アクティブセットが7件に届く）を
  // ちょうど満たした瞬間かどうかを調べる（そうでなければ無駄なクエリを避ける）。
  const stage2JustUnlocked = graduated ? await checkStage2JustUnlocked(userId, expressionId) : false;

  // クワガタ育成機能：Stage2解放＝ヒビクワたんの確定採集タイミング
  // （エークワタンはサインアップ時点で確定済み。handle_new_userトリガー参照）。
  if (stage2JustUnlocked) {
    await recordStageClearCatch(userId, 2);
  }

  // クワガタ育成機能：Stage3解放＝シャベクワタンの確定採集タイミング。Stage3解放もStage1の
  // 卒業数（graduatedStage1Ids.size）に紐づくため、stage2JustUnlockedと同じくStage1卒業時に
  // 判定する。「ちょうど閾値を超えた瞬間」だけを捉えるため、閾値との完全一致で判定する
  // （checkStage2JustUnlockedのcountBefore/countAfter比較と同じ考え方の簡易版）。
  if (graduated) {
    const graduatedStage1Ids = await getStage1GraduatedExpressionIds(userId);
    if (graduatedStage1Ids.size === STAGE3_UNLOCK_STAGE1_GRADUATIONS) {
      await recordStageClearCatch(userId, 3);
    }
  }

  return { streak, subStep: getStage1SubStep(streak), graduated, stage2JustUnlocked };
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
  const newTotal = current + 1;

  const { error: updateError } = await supabaseAdmin
    .from("user_roadmap_state")
    .update({ total_mastered_count: newTotal })
    .eq("user_id", userId);

  if (updateError) {
    throw new Error(`累計習得数の更新に失敗しました: ${updateError.message}`);
  }

  // クワガタ育成機能：新種の採集チャンスのストック（間隔の倍数に達した回だけ内部で+1される。
  // 実際の抽選はプレイヤーが「採集に出かける」を選んだ時にconsumePendingCatchで行う）。
  await stockCatchChanceOnMasteredCountUpdate(userId, newTotal);
}

// Stage1練習画面専用の音声URL発行。
// ライブラリの音声再生（Pro限定）とは別ルートで、「そのユーザーの現在のアクティブセットに
// 含まれるフレーズ」と一致する場合のみ発行する（任意のexpressionIdを指定して聴ける汎用APIにはしない）。
export async function getStage1AudioUrl(
  userId: string,
  expressionId: string,
  scene?: Stage1Scene | null
): Promise<string | null> {
  const { activeSet } = await getStage1ActiveSet(userId, scene);
  if (!activeSet.some((e) => e.id === expressionId)) {
    return null;
  }

  return getExpressionAudioSignedUrl(expressionId, "expression");
}

// =========================================
// Stage2（瞬間英作文）
// =========================================

type DbStage2ContentRow = {
  expression_id: string;
  blank_target: string;
  blank_choices: string[];
  sentence_choices: string[];
  // 「文脈からの想起」用の状況説明文。未入力の間はmeaning_jaにフォールバックする
  // （コンテンツ制作が追いつくまでの暫定措置。詳細はDBカラムコメント参照）。
  context_prompt_ja: string | null;
  // 穴埋め音読の答え合わせで見せる「なぜ不自然か」の理由のキャッシュ。null=未生成
  // （getOrGenerateBlankChoiceReasonsが初回アクセス時に生成してこのカラムに書き戻す）。
  blank_choice_reasons: Stage2ReferenceChoice[] | null;
  // 微改変の2パターン（初回アクセス時にAI生成して書き戻す）。null=未生成
  variations: Stage2Variation[] | null;
  expressions: {
    code: string;
    expression_en: string;
    meaning_ja: string | null;
    scene_tags: string[] | null;
  } | null;
};

// Fisher-Yatesシャッフル（選択肢の並び順をランダムにする）
function shuffleArray<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Stage1を卒業済み（stage1で習得済み）のexpression_idの集合を取得する。
// Stage2はStage1で覚えたフレーズを引き出す練習のため、Stage1卒業済みのフレーズだけを対象にする。
async function getStage1GraduatedExpressionIds(userId: string): Promise<Set<string>> {
  const { data, error } = await supabaseAdmin
    .from("speaking_stage_progress")
    .select("phrase_id")
    .eq("user_id", userId)
    .eq("stage", 1)
    .eq("phrase_source", "expression")
    .eq("status", "習得済み");

  if (error) {
    throw new Error(`Stage1卒業済みフレーズの取得に失敗しました: ${error.message}`);
  }

  return new Set((data ?? []).map((row) => row.phrase_id as string));
}

// Stage2用に作り込まれたコンテンツ（stage2_quiz_content）を、Stage1卒業済みのものに絞り、
// code順に並べたうえで、Stage1と同じく日常会話タグを優先する順に並べ替えて取得する。
// 全ユーザー共通のStage2コンテンツ(code順→日常会話優先の並び済み)。マスタなのでメモリに5分持つ。
// blank_choice_reasons・variationsは、初回アクセス時にAIで生成してDBへ書き戻される列なので、
// ここには含めない(含めると、書き戻し後も古いnullが残ってAIを呼び直してしまう)。
// 出題する数件の分だけ、fillStage2GeneratedColumnsで都度読む。
const listAllStage2Content = ttlCached(MASTER_CACHE_TTL_MS, async (): Promise<DbStage2ContentRow[]> => {
  const { data, error } = await supabaseAdmin
    .from("stage2_quiz_content")
    .select(
      "expression_id, blank_target, blank_choices, sentence_choices, context_prompt_ja, expressions(code, expression_en, meaning_ja, scene_tags)"
    );

  if (error) {
    throw new Error(`Stage2コンテンツの取得に失敗しました: ${error.message}`);
  }

  const rows = ((data ?? []) as unknown as DbStage2ContentRow[]).map((row) => ({
    ...row,
    blank_choice_reasons: null,
    variations: null,
  }));
  const sortedByCode = rows
    .filter((row) => row.expressions)
    .sort((a, b) => a.expressions!.code.localeCompare(b.expressions!.code));

  return sortDailyFirst(sortedByCode.map((row) => ({ ...row, sceneTags: row.expressions!.scene_tags ?? [] })));
});

async function listStage2ContentPool(userId: string): Promise<DbStage2ContentRow[]> {
  const [graduatedIds, all] = await Promise.all([getStage1GraduatedExpressionIds(userId), listAllStage2Content()]);
  if (graduatedIds.size === 0) return [];
  // 並び済みのマスタからStage1卒業済みだけを抜き出す(安定ソート済みなので順序は保たれる)。
  return all.filter((row) => graduatedIds.has(row.expression_id));
}

// Stage1のあるフレーズが今まさに卒業した直後、その卒業でStage2が「今まさに解放された」かどうかを判定する。
// Stage2プールは「Stage1卒業済み ∩ Stage2コンテンツあり」の集合なので、卒業後のプール件数から、
// 今回卒業したフレーズ自体がStage2コンテンツを持つ場合だけ1件差し引けば卒業前の件数が求まる
// （二度クエリを打って前後を比較する必要はない）。
async function checkStage2JustUnlocked(userId: string, justGraduatedExpressionId: string): Promise<boolean> {
  const poolAfter = await listStage2ContentPool(userId);
  const graduatedHasStage2Content = poolAfter.some((row) => row.expression_id === justGraduatedExpressionId);
  const countAfter = poolAfter.length;
  const countBefore = graduatedHasStage2Content ? countAfter - 1 : countAfter;

  return countBefore < STAGE2_ACTIVE_SET_SIZE && countAfter >= STAGE2_ACTIVE_SET_SIZE;
}

// Stage2のアクティブセット（未卒業フレーズの先頭からSTAGE2_ACTIVE_SET_SIZE件）を計算する。
// Stage1と同じく新しい状態は持たず、毎回動的に計算するだけでよい。
async function getStage2ActiveSet(userId: string): Promise<{
  activeSet: (DbStage2ContentRow & { streak: number; subStep: Stage2SubStep })[];
  totalCount: number;
  remainingCount: number;
}> {
  const [pool, { data: progressData, error: progressError }] = await Promise.all([
    listStage2ContentPool(userId),
    supabaseAdmin
      .from("speaking_stage_progress")
      .select("phrase_id, status, correct_streak")
      .eq("user_id", userId)
      .eq("stage", 2)
      .eq("phrase_source", "expression"),
  ]);

  if (progressError) {
    throw new Error(`Stage2進捗の取得に失敗しました: ${progressError.message}`);
  }

  const progressMap = new Map<string, { status: string; correct_streak: number }>();
  for (const row of progressData ?? []) {
    progressMap.set(row.phrase_id as string, {
      status: row.status as string,
      correct_streak: row.correct_streak as number,
    });
  }

  const totalCount = pool.length;
  const nonGraduated = pool.filter((row) => progressMap.get(row.expression_id)?.status !== "習得済み");
  const remainingCount = nonGraduated.length;

  const activeSet = nonGraduated.slice(0, STAGE2_ACTIVE_SET_SIZE).map((row) => {
    const streak = progressMap.get(row.expression_id)?.correct_streak ?? 0;
    return { ...row, streak, subStep: getStage2SubStep(streak) };
  });

  return { activeSet, totalCount, remainingCount };
}

// アクティブセットの1件から、出題形式（穴埋め／全文瞬間英作文／文脈からの想起／微改変）に応じた
// 問題を組み立てる。「声に出すこと」が全Stage共通の大前提のため、微改変以外の3ステップも
// クリックで正誤判定する形にはせず、「声に出す→答えを確認する→自己申告」のkind:"produce"にする
// （2026-09-09の設計変更。経緯は_reference/speaking-roadmap-design.md参照）。
// 以前の選択肢データ(blank_choices/sentence_choices)は、答え合わせ画面の
// 「似ているけど違う表現」の参考表示(referenceChoices)として引き続き活用する。
// 穴埋め音読だけAI生成の理由(getOrGenerateBlankChoiceReasons)を要するため非同期関数にしている。
async function buildStage2Question(
  row: DbStage2ContentRow,
  subStep: Stage2SubStep,
  streak: number
): Promise<Stage2RoundQuestion> {
  const meaningJa = row.expressions!.meaning_ja ?? undefined;
  const expressionEn = row.expressions!.expression_en;
  const warmth = computeWarmth(streak, STAGE2_GRADUATE_STREAK);

  if (subStep === "微改変") {
    // 2パターンを連続正解数で切り替える（6回目と7回目で別のパターンが出る）。
    const variations = await getOrGenerateStage2Variations({
      expressionId: row.expression_id,
      cached: row.variations,
      expressionEn,
      meaningJa: meaningJa ?? "",
    });
    if (variations) {
      const variation = variations[(streak - 6) % variations.length] ?? variations[0];
      return {
        kind: "produce",
        subStep,
        expressionId: row.expression_id,
        promptJa: variation.promptJa,
        variationLabel: STAGE2_VARIATION_LABEL[variation.kind],
        baseExpressionEn: expressionEn,
        answerText: variation.answerEn,
        referenceChoices: [],
        warmth,
      };
    }
    // 生成に失敗したときは従来どおり（もとの表現をそのまま見せる自己申告）
    return {
      kind: "free",
      subStep,
      expressionId: row.expression_id,
      expressionEn,
      meaningJa,
      warmth,
    };
  }

  if (subStep === "穴埋め音読") {
    const promptEn = expressionEn.replace(row.blank_target, "___");
    const candidates = shuffleArray(row.blank_choices.filter((c) => c !== row.blank_target));
    // 「似ているけど不自然」という判定を人間に見せる以上、理由を添える（2026-09-11
    // 実機フィードバック）。フレーズごとに初回だけAI生成し、以降はDBキャッシュから返す
    // （全ユーザー共通で使い回せるため実質ゼロコストに収束する）。本当に紛らわしいものだけ
    // 最大2件に絞るのもこの関数の役割。
    const referenceChoices = await getOrGenerateBlankChoiceReasons({
      expressionId: row.expression_id,
      cached: row.blank_choice_reasons,
      expressionEn,
      meaningJa: meaningJa ?? "",
      candidates,
    });

    return {
      kind: "produce",
      subStep,
      expressionId: row.expression_id,
      meaningJa,
      promptEn,
      answerText: expressionEn,
      referenceChoices,
      warmth,
    };
  }

  // 全文瞬間英作文・文脈からの想起：答え合わせで見せる参考表現(sentence_choices)は共通で使い回すが、
  // 声に出す前に見せる日本語文(promptJa)を変えることで問い方を差別化する。
  // ・全文瞬間英作文：直訳ヒント(meaningJa)を見せて、その英文を声に出させる
  // ・文脈からの想起：直訳ヒントは見せず、状況説明文(context_prompt_ja)だけを見せて
  //   場面から表現を思い出して声に出させる（直訳できなくても場面から引き出す力を試す）。
  //   context_prompt_jaが未入力のフレーズは、コンテンツ制作が追いつくまでmeaningJaにフォールバックする。
  // こちらは「間違い」ではなく「似た場面で使う他の表現」という参考表示のため、穴埋め音読と違い
  // 不自然な理由をAI生成する対象ではない（reasonJaは空文字のまま。UI側は理由行を出さない）。
  const referenceChoices: Stage2ReferenceChoice[] = shuffleArray(
    row.sentence_choices.filter((c) => c !== expressionEn)
  ).map((text) => ({ text, reasonJa: "" }));
  const promptJa = subStep === "文脈からの想起" ? row.context_prompt_ja ?? meaningJa : meaningJa;

  return {
    kind: "produce",
    subStep,
    expressionId: row.expression_id,
    meaningJa,
    promptJa,
    answerText: expressionEn,
    referenceChoices,
    warmth,
  };
}

// Stage2のラウンド（ミニクイズ1回分）を決める。
// アクティブセットがSTAGE2_ACTIVE_SET_SIZE（7件）に届いていない間は、初解放前・補充後の
// 再開待ちを区別せず、常にnot_readyを返す（母数が少ないと同じような問題ばかりになるため）。
// 対象プール内を全て卒業済みならdoneを返す。
export async function getStage2Round(userId: string): Promise<Stage2RoundResponse> {
  const { activeSet, totalCount, remainingCount } = await getStage2ActiveSet(userId);

  if (activeSet.length < STAGE2_ACTIVE_SET_SIZE) {
    if (remainingCount === 0 && totalCount > 0) {
      return { status: "done", totalCount };
    }
    return {
      status: "not_ready",
      remainingToUnlock: STAGE2_ACTIVE_SET_SIZE - activeSet.length,
    };
  }

  const sampled = shuffleArray(activeSet).slice(0, Math.min(STAGE2_ROUND_SIZE, activeSet.length));

  // 出題する分だけ、AI生成の書き戻し列(理由・微改変)を最新の状態で読む。
  const { data: generated, error: generatedError } = await supabaseAdmin
    .from("stage2_quiz_content")
    .select("expression_id, blank_choice_reasons, variations")
    .in(
      "expression_id",
      sampled.map((row) => row.expression_id)
    );
  if (generatedError) {
    throw new Error(`Stage2生成済みデータの取得に失敗しました: ${generatedError.message}`);
  }
  const generatedById = new Map((generated ?? []).map((g) => [g.expression_id as string, g]));
  const withGenerated = sampled.map((row) => {
    const g = generatedById.get(row.expression_id);
    return {
      ...row,
      blank_choice_reasons: (g?.blank_choice_reasons as Stage2ReferenceChoice[] | null) ?? null,
      variations: (g?.variations as Stage2Variation[] | null) ?? null,
    };
  });

  return {
    status: "round",
    questions: await Promise.all(withGenerated.map((row) => buildStage2Question(row, row.subStep, row.streak))),
    remainingCount,
    totalCount,
  };
}

// Stage2の結果を記録する（選択問題はクライアント側で正誤判定した結果を、微改変は自己申告を受け取る）。
export async function reportStage2Result(
  userId: string,
  expressionId: string,
  correct: boolean
): Promise<Stage2ReportResult> {
  const { streak, graduated } = await reportStageStreakResult(
    userId,
    2,
    expressionId,
    STAGE2_GRADUATE_STREAK,
    correct
  );
  return { streak, subStep: getStage2SubStep(streak), graduated };
}

// ============================================================
// Stage0（使い分けパーツ）
// Stage1〜5の一本道とは別の、いつでも寄れる独立エリア（ゲートにはしない）。
// _reference/speaking-roadmap-design.md「使い分けパーツコンテンツ」の節を参照。
// ============================================================

type UsageRulePoolRow = {
  id: string;
  errorTag: string;
  title: string;
  coreImageJa: string;
  deepDiveJa: string | null;
  prompts: { promptJa: string; answerEn: string; noteJa: string | null }[];
};

// 公開済みのusage_rulesを、紐づくusage_rule_prompts込みでcode順に取得する。
// errorTagを指定すると、そのカテゴリ（冠詞・可算不可算など）だけに絞り込む
// （「冠詞だけ集中的に練習したい」というカテゴリ別練習に対応するため）。
// 現状件数が少ない（数十件規模の見込み）ため、Stage1で踏んだPostgRESTの行数上限バグの
// リスクは当面ない。件数が増えてきたら同種の対策を検討する。
async function listUsageRulePool(errorTag?: string): Promise<UsageRulePoolRow[]> {
  let query = supabaseAdmin
    .from("usage_rules")
    .select("id, code, error_tag, title, core_image_ja, deep_dive_ja, usage_rule_prompts(prompt_ja, answer_en, note_ja)")
    .eq("publish_status", "公開");

  if (errorTag) {
    query = query.eq("error_tag", errorTag);
  }

  const { data, error } = await query.order("code", { ascending: true });

  if (error) {
    throw new Error(`Stage0出題プールの取得に失敗しました: ${error.message}`);
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    errorTag: row.error_tag as string,
    title: row.title as string,
    coreImageJa: row.core_image_ja as string,
    deepDiveJa: (row.deep_dive_ja as string | null) ?? null,
    prompts: ((row.usage_rule_prompts ?? []) as { prompt_ja: string; answer_en: string; note_ja: string | null }[]).map(
      (p) => ({
        promptJa: p.prompt_ja,
        answerEn: p.answer_en,
        noteJa: p.note_ja,
      })
    ),
  }));
}

// カテゴリ選択UI用に、現在公開済みのusage_rulesが実際に持っているerror_tagの一覧を返す
// （まだコンテンツが無いカテゴリを選択肢に出さないようにするため、固定リストではなく実データから導出する）。
export async function listUsageRuleErrorTags(): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("usage_rules")
    .select("error_tag")
    .eq("publish_status", "公開");

  if (error) {
    throw new Error(`Stage0カテゴリ一覧の取得に失敗しました: ${error.message}`);
  }

  return Array.from(new Set((data ?? []).map((row) => row.error_tag as string)));
}

// Stage0のアクティブセット（未卒業の「感覚」の先頭からSTAGE0_ACTIVE_SET_SIZE件）を計算する。
// errorTagを指定すると、そのカテゴリの感覚だけを対象にする。
// Stage1・2と同じく新しい状態は持たず、毎回動的に計算する。
async function getStage0ActiveSet(
  userId: string,
  errorTag?: string
): Promise<{
  activeSet: (UsageRulePoolRow & { streak: number })[];
  totalCount: number;
  remainingCount: number;
}> {
  const pool = await listUsageRulePool(errorTag);

  const { data: progressData, error: progressError } = await supabaseAdmin
    .from("speaking_stage_progress")
    .select("phrase_id, status, correct_streak")
    .eq("user_id", userId)
    .eq("stage", 0)
    .eq("phrase_source", "usage_rule");

  if (progressError) {
    throw new Error(`Stage0進捗の取得に失敗しました: ${progressError.message}`);
  }

  const progressMap = new Map<string, { status: string; correct_streak: number }>();
  for (const row of progressData ?? []) {
    progressMap.set(row.phrase_id as string, {
      status: row.status as string,
      correct_streak: row.correct_streak as number,
    });
  }

  const totalCount = pool.length;
  const nonGraduated = pool.filter((rule) => progressMap.get(rule.id)?.status !== "習得済み");
  const remainingCount = nonGraduated.length;

  const activeSet = nonGraduated.slice(0, STAGE0_ACTIVE_SET_SIZE).map((rule) => ({
    ...rule,
    streak: progressMap.get(rule.id)?.correct_streak ?? 0,
  }));

  return { activeSet, totalCount, remainingCount };
}

// Stage0のラウンド（ミニクイズ1回分）を決める。
// アクティブセットから最大STAGE0_ROUND_SIZE件を選び、各ruleにつき出題文を1つランダムに選ぶ
// （同じ感覚でも毎回語彙を変えて出題することで、暗記ではなく感覚そのものの定着を狙う）。
// coreImageJaは答え合わせの時点で必ずUI側に表示する（自己申告の正誤に関係なく毎回）。
// errorTagを指定すると、そのカテゴリ（冠詞・可算不可算など）だけに絞って出題する。
export async function getStage0Round(userId: string, errorTag?: string): Promise<Stage0RoundResponse> {
  const { activeSet, totalCount, remainingCount } = await getStage0ActiveSet(userId, errorTag);

  if (activeSet.length === 0) {
    return { status: "done", totalCount };
  }

  const sampled = shuffleArray(activeSet).slice(0, Math.min(STAGE0_ROUND_SIZE, activeSet.length));

  return {
    status: "round",
    questions: sampled
      .filter((rule) => rule.prompts.length > 0)
      .map((rule) => {
        const prompt = rule.prompts[Math.floor(Math.random() * rule.prompts.length)];
        return {
          usageRuleId: rule.id,
          errorTag: rule.errorTag,
          title: rule.title,
          promptJa: prompt.promptJa,
          answerEn: prompt.answerEn,
          // 出題文ごとの解説(note_ja)があればそれを、無ければルール全体の解説を出す。
          coreImageJa: prompt.noteJa?.trim() ? prompt.noteJa : rule.coreImageJa,
          deepDiveJa: rule.deepDiveJa,
          warmth: computeWarmth(rule.streak, STAGE0_GRADUATE_STREAK),
        };
      }),
    remainingCount,
    totalCount,
  };
}

// Stage0の結果を記録する（「言えた/言えなかった」の自己申告）。
export async function reportStage0Result(
  userId: string,
  usageRuleId: string,
  correct: boolean
): Promise<Stage0ReportResult> {
  const { streak, graduated } = await reportStageStreakResult(
    userId,
    0,
    usageRuleId,
    STAGE0_GRADUATE_STREAK,
    correct,
    "usage_rule"
  );
  return { streak, graduated };
}

// ============================================================
// Stage3（型を崩して自分の言葉で言う）
// Stage1・2とは違い「ラウンドでまとめて出す」設計をやめ、1回のAI判定＝1回の本番の発話として
// 扱う（2026-09-10 設計議論・_reference/speaking-roadmap-design.md参照）。
// アクティブセットの先頭にある表現1件について、現在のサブステップの問題を都度1問だけ返す。
// ============================================================

type Stage3PoolRow = {
  id: string;
  expressionEn: string;
  meaningJa?: string;
  // 「ヒント付き言い換え」で見せる穴埋めヒントのキャッシュ（expressions.stage3_hint_blank_en）。
  // 未生成ならnull（getStage3Sessionで初回アクセス時にAI生成してキャッシュする）。
  stage3HintBlankEn: string | null;
};

// Stage1卒業済みのexpressionsを対象プールとする（Stage2と同じ考え方）。件数がまだ少ないため
// Stage1で踏んだPostgRESTの行数上限バグのリスクは当面ない（増えたら同種の対策を検討する）。
// 【2026-09-11 発覚したバグの記録】Stage1・Stage2は日常会話タグを先頭に並べ替える対応
// （sortDailyFirst）が入っていたが、Stage3のプールだけこの対応が漏れており、単純にcode昇順の
// ままだった。ビジネス表現の方が先に投入されておりcodeが若いため、Stage1をどんな順で卒業しても
// Stage3の出題は常にビジネス表現から先に出てしまっていた（実機フィードバックで発覚）。
async function listStage3ContentPool(userId: string, knownGraduatedIds?: Set<string>): Promise<Stage3PoolRow[]> {
  const graduatedIds = knownGraduatedIds ?? (await getStage1GraduatedExpressionIds(userId));
  if (graduatedIds.size === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("expressions")
    .select("id, code, expression_en, meaning_ja, scene_tags, stage3_hint_blank_en")
    .eq("publish_status", "公開")
    .in("id", Array.from(graduatedIds))
    .order("code", { ascending: true });

  if (error) {
    throw new Error(`Stage3出題プールの取得に失敗しました: ${error.message}`);
  }

  return sortDailyFirst(
    (data ?? []).map((row) => ({
      id: row.id as string,
      expressionEn: row.expression_en as string,
      meaningJa: (row.meaning_ja as string | null) ?? undefined,
      stage3HintBlankEn: (row.stage3_hint_blank_en as string | null) ?? null,
      sceneTags: (row.scene_tags as string[] | null) ?? [],
    }))
  );
}

async function getStage3ProgressMap(
  userId: string
): Promise<Map<string, { status: string; correct_streak: number; last_practiced_at: string | null }>> {
  const { data, error } = await supabaseAdmin
    .from("speaking_stage_progress")
    .select("phrase_id, status, correct_streak, last_practiced_at")
    .eq("user_id", userId)
    .eq("stage", 3)
    .eq("phrase_source", "expression");

  if (error) {
    throw new Error(`Stage3進捗の取得に失敗しました: ${error.message}`);
  }

  const map = new Map<string, { status: string; correct_streak: number; last_practiced_at: string | null }>();
  for (const row of data ?? []) {
    map.set(row.phrase_id as string, {
      status: row.status as string,
      correct_streak: row.correct_streak as number,
      last_practiced_at: (row.last_practiced_at as string | null) ?? null,
    });
  }
  return map;
}

// 箱庭地図（RoadmapMap）でStage2・Stage3を「解放済み」として表示してよいかを判定する。
// user_roadmap_state.current_stage（オンボーディング時に1回だけ書かれ、以後更新されない値）は
// 使わず、各Stageの練習ページ自身が「出題できるか」を判定するのと全く同じ基準
// （アクティブセットが規定数に届いているか）をその場で計算する。新しい永続状態は持たない
// （_reference/speaking-roadmap-design.mdの「一度きりの永続フラグは持たない」方針を地図にも適用）。
// Stage4はStage1〜3のようなアクティブセット（表現プール）方式ではなく固定シナリオ方式のため、
// 「解放できる問題があるか」ではなく「Stage3で何か1つでも卒業できたか」を解放条件にする
// （Stage3の実績があってはじめて、より高度な会話に進める、という自然な区切り）。
//
// バグ修正（2026-09-14）：当初この関数は箱庭地図の表示（鍵アイコン）専用で、Stage4の
// 練習ページ・APIルート自体はこの条件を一切チェックしていなかった。Stage2/3は
// 「出せる問題があるか」というコンテンツ量の話なのでURL直打ちでもnot_readyが返るだけで
// 実害はないが、Stage4は固定シナリオを持つため、Stage3を1問もやっていないユーザーでも
// URLを直打ちすればAIロールプレイにフルアクセスできてしまう抜け穴だった。この関数を
// exportし、/roadmap/stage4のページ・/api/roadmap/stage4/scenarios・/api/roadmap/stage4/turn
// の3箇所でもサーバー側ゲートとして使うように修正した。
// Stage3卒業済みフレーズの累計数。2026-09-16改訂前は「1件でもあるか」のbooleanだったが、
// Stage4解放条件を「1個卒業でOK」から「STAGE4_UNLOCK_STAGE3_GRADUATIONS個卒業」に引き上げた
// ため、件数そのものを返す形に変更した。
export async function countStage3Graduations(userId: string): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("speaking_stage_progress")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("stage", 3)
    .eq("phrase_source", "expression")
    .eq("status", "習得済み");

  if (error) {
    throw new Error(`Stage3卒業実績の取得に失敗しました: ${error.message}`);
  }

  return count ?? 0;
}

// Stage4への実アクセス可否（#156 Stageスキップ、2026-09-14。しきい値は2026-09-16改訂）。
// 「Stage3をSTAGE4_UNLOCK_STAGE3_GRADUATIONS個卒業したか」に加えて、Pro限定のスキップ設定
// （pro_skip_enabled）が有効な場合も解放する。/roadmap/stage4ページ・
// /api/roadmap/stage4/scenarios・/api/roadmap/stage4/turnの3箇所すべてで、
// countStage3Graduations単体ではなくこの関数を使うこと（そうしないと、地図上はスキップで
// 解放表示されるのに実際のページ・APIでは弾かれるという矛盾が起きる）。
export async function isStage4Unlocked(userId: string): Promise<boolean> {
  const [graduationCount, state] = await Promise.all([
    countStage3Graduations(userId),
    getUserRoadmapState(userId),
  ]);
  return graduationCount >= STAGE4_UNLOCK_STAGE3_GRADUATIONS || (state?.proSkipEnabled ?? false);
}

// Stage4卒業済みシナリオのscene_tagから、日常/ビジネスそれぞれのドメインで
// STAGE5_UNLOCK_STAGE4_GRADUATIONS本以上卒業しているかを返す。Stage5は日常編・ビジネス編が
// 独立したトラックのため、単一のbooleanではなくドメインごとに判定する
// （_reference/speaking-roadmap-design.md「Stage5：スキーマ・解放ロジック設計」参照）。
// Stage4自体はtrack列を持たないため、既存のisDailyScene()でscene_tagから逆算する
// （Stage5シナリオ側はtrack列で直接判定するので、この関数はStage4→Stage5の解放判定専用）。
// Stage4シナリオのid→scene_tag対応(公開状態を問わない全件)。全ユーザー共通のマスタなのでメモリに5分持つ。
const listStage4SceneTags = ttlCached(MASTER_CACHE_TTL_MS, async (): Promise<{ id: string; scene_tag: string }[]> => {
  const { data, error } = await supabaseAdmin.from("stage4_scenarios").select("id, scene_tag");
  if (error) {
    throw new Error(`Stage4シナリオの取得に失敗しました: ${error.message}`);
  }
  return (data ?? []) as { id: string; scene_tag: string }[];
});

async function getStage5DomainReadiness(
  userId: string
): Promise<{ dailyReady: boolean; businessReady: boolean }> {
  // 卒業実績とシナリオ対応表は互いに依存しないので同時に取り、絞り込みはこちらで行う。
  const [progressRes, sceneTags] = await Promise.all([
    supabaseAdmin
      .from("speaking_stage_progress")
      .select("phrase_id")
      .eq("user_id", userId)
      .eq("stage", 4)
      .eq("phrase_source", "stage4_scenario")
      .eq("status", "習得済み"),
    listStage4SceneTags(),
  ]);

  if (progressRes.error) {
    throw new Error(`Stage4卒業実績の取得に失敗しました: ${progressRes.error.message}`);
  }

  const graduatedIds = new Set((progressRes.data ?? []).map((row) => row.phrase_id as string));
  if (graduatedIds.size === 0) return { dailyReady: false, businessReady: false };

  const tags = sceneTags.filter((row) => graduatedIds.has(row.id)).map((row) => row.scene_tag);
  const dailyCount = tags.filter((tag) => isDailyScene([tag])).length;
  const businessCount = tags.length - dailyCount;

  return {
    dailyReady: dailyCount >= STAGE5_UNLOCK_STAGE4_GRADUATIONS,
    businessReady: businessCount >= STAGE5_UNLOCK_STAGE4_GRADUATIONS,
  };
}

// Stage5への実アクセス可否。トラック別に独立して判定する（proSkipEnabledが有効な場合は
// 両トラックとも一律で解放——スキップ自体が「全ゲートを一律で通す」既存の意味を踏襲するため、
// トラックで差をつける理由がない）。Stage4と同じく、地図の表示・scenarios API・turn APIの
// 3箇所すべてでこの関数を使うこと。
export async function isStage5TrackUnlocked(userId: string, track: Stage5Track): Promise<boolean> {
  const [readiness, state] = await Promise.all([
    getStage5DomainReadiness(userId),
    getUserRoadmapState(userId),
  ]);
  const proSkipEnabled = state?.proSkipEnabled ?? false;
  const domainReady = track === "daily" ? readiness.dailyReady : readiness.businessReady;
  return domainReady || proSkipEnabled;
}

// knownState: 呼び出し側が取得済みのstateがあれば渡す(同じ行を二度読まないため)。
export async function getRoadmapStageReadiness(
  userId: string,
  knownState?: UserRoadmapState | null
): Promise<{
  stage2Ready: boolean;
  stage3Ready: boolean;
  stage4Ready: boolean;
  stage5DailyReady: boolean;
  stage5BusinessReady: boolean;
}> {
  const [stage2, graduatedStage1Ids, stage3GraduationCount, stage5Readiness, state] = await Promise.all([
    getStage2ActiveSet(userId),
    getStage1GraduatedExpressionIds(userId),
    countStage3Graduations(userId),
    getStage5DomainReadiness(userId),
    knownState !== undefined ? Promise.resolve(knownState) : getUserRoadmapState(userId),
  ]);
  const proSkipEnabled = state?.proSkipEnabled ?? false;

  return {
    stage2Ready: stage2.activeSet.length >= STAGE2_ACTIVE_SET_SIZE || proSkipEnabled,
    stage3Ready: graduatedStage1Ids.size >= STAGE3_UNLOCK_STAGE1_GRADUATIONS || proSkipEnabled,
    stage4Ready: stage3GraduationCount >= STAGE4_UNLOCK_STAGE3_GRADUATIONS || proSkipEnabled,
    stage5DailyReady: stage5Readiness.dailyReady || proSkipEnabled,
    stage5BusinessReady: stage5Readiness.businessReady || proSkipEnabled,
  };
}

// Stage3の「今回の1問」を決める。ラウンドではなく、アクティブセットの先頭（＝一番手をつけている
// 途中の表現）を毎回返す。1日のAI判定利用回数が上限に達している場合は先に判定して弾く
// （判定を受けられない問題を見せても価値が薄いため）。
export async function getStage3Session(userId: string, plan: Plan): Promise<Stage3SessionResponse> {
  // 解放条件チェック（2026-09-16改訂）：以前は出題プールに1件でもあれば解放だったが、
  // Stage3の出題プールはStage1卒業フレーズそのものから作られるため実質「Stage1を1個卒業すれば
  // 即解放」も同然で、Stage2解放（7個）よりゆるい基準になっていた。Stage1卒業の累計数が
  // STAGE3_UNLOCK_STAGE1_GRADUATIONSに届くまでは、AI判定コストを払う前に弾く。
  // 互いに独立した問い合わせ(卒業済みの取得・今日の利用回数・Stage3の進捗)は並列に実行する。
  // 判定の順序(not_ready→limit_exceeded→出題)は従来どおり。
  const [graduatedStage1Ids, usageCheck, progressMap] = await Promise.all([
    getStage1GraduatedExpressionIds(userId),
    checkStage3Usage(userId, plan),
    getStage3ProgressMap(userId),
  ]);
  if (graduatedStage1Ids.size < STAGE3_UNLOCK_STAGE1_GRADUATIONS) {
    return {
      status: "not_ready",
      remainingToUnlock: STAGE3_UNLOCK_STAGE1_GRADUATIONS - graduatedStage1Ids.size,
    };
  }

  if (!usageCheck.allowed) {
    return { status: "limit_exceeded", limit: usageCheck.limit };
  }

  const pool = await listStage3ContentPool(userId, graduatedStage1Ids);
  const totalCount = pool.length;
  const activeSet = pool
    .filter((row) => progressMap.get(row.id)?.status !== "習得済み")
    .slice(0, STAGE3_ACTIVE_SET_SIZE)
    .map((row) => ({
      ...row,
      streak: progressMap.get(row.id)?.correct_streak ?? 0,
      lastPracticedAt: progressMap.get(row.id)?.last_practiced_at ?? null,
    }));
  if (activeSet.length === 0) {
    return { status: "done", totalCount };
  }

  // 同じ表現が続かないよう、アクティブセットの中で「最後に練習してから一番時間が経っている」
  // ものを出す（未練習は最優先）。同順ならプールの並び（日常会話優先）のまま。
  // Array.prototype.sortは安定ソートなので、同値のときは元の順序が保たれる。
  const byLeastRecent = [...activeSet].sort((a, b) => {
    if (a.lastPracticedAt === b.lastPracticedAt) return 0;
    if (a.lastPracticedAt === null) return -1;
    if (b.lastPracticedAt === null) return 1;
    return a.lastPracticedAt < b.lastPracticedAt ? -1 : 1;
  });
  // 1ラウンド分（最大STAGE3_ROUND_SIZE件）の別々の表現をまとめて出す。各問のsubStepは
  // ラウンド開始時のstreakで決まり、同じ表現を同じラウンドに2回出さないので途中で変わらない。
  const roundItems = byLeastRecent.slice(0, STAGE3_ROUND_SIZE);

  // 「ヒント付き言い換え」のときだけ穴埋めヒントが必要（他のサブステップでは呼ばない）。
  // 公開中の表現は生成済みでキャッシュを読むだけ。未生成の新規表現のみAI生成する。
  const questions: Stage3Question[] = await Promise.all(
    roundItems.map(async (item) => {
      const subStep = getStage3SubStep(item.streak);
      const hintExpressionEn =
        subStep === "ヒント付き言い換え"
          ? await getOrGenerateStage3HintBlank({
              expressionId: item.id,
              cached: item.stage3HintBlankEn,
              expressionEn: item.expressionEn,
              meaningJa: item.meaningJa ?? "",
            })
          : undefined;
      return {
        expressionId: item.id,
        subStep,
        meaningJa: item.meaningJa,
        hintExpressionEn,
        warmth: computeWarmth(item.streak, STAGE3_GRADUATE_STREAK),
      };
    })
  );

  return {
    status: "session",
    questions,
    usage: { remaining: usageCheck.remaining, limit: usageCheck.limit },
    poolSize: totalCount,
  };
}

// 該当ユーザーの該当エラータグのmiss_countを+1する（存在しなければ新規作成）。
// errorTagsは1回の判定につき0〜2件程度の想定のため、N+1で問題ない。
async function recordErrorTags(userId: string, errorTags: string[]): Promise<void> {
  for (const tag of errorTags) {
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("user_error_tag_stats")
      .select("miss_count")
      .eq("user_id", userId)
      .eq("error_tag", tag)
      .maybeSingle();

    if (fetchError) {
      throw new Error(`エラータグ集計の取得に失敗しました: ${fetchError.message}`);
    }

    const { error: upsertError } = await supabaseAdmin.from("user_error_tag_stats").upsert(
      {
        user_id: userId,
        error_tag: tag,
        miss_count: (existing?.miss_count ?? 0) + 1,
        mastered: false,
        last_missed_at: new Date().toISOString(),
      },
      { onConflict: "user_id,error_tag" }
    );

    if (upsertError) {
      throw new Error(`エラータグ集計の更新に失敗しました: ${upsertError.message}`);
    }
  }
}

export type Stage3ReportOutcome =
  | { status: "ok"; result: Stage3JudgeResult }
  | { status: "limit_exceeded"; limit: number }
  | { status: "error"; message: string };

// Stage3の発話結果を記録する。Stage1・2と違い自己申告ではなく、AIの判定結果（意味が
// 伝わっているか）がそのままstreak進行のトリガーになる。不正解時はerrorTagsを
// user_error_tag_statsに集計する（Stage0と同じ15種のエラータグ体系）。
export async function reportStage3Result(
  userId: string,
  plan: Plan,
  expressionId: string,
  userSpokenText: string,
  followUp?: { partnerReplyEn: string }
): Promise<Stage3ReportOutcome> {
  const { data: expr, error: exprError } = await supabaseAdmin
    .from("expressions")
    .select("expression_en, meaning_ja")
    .eq("id", expressionId)
    .maybeSingle();

  if (exprError) {
    throw new Error(`表現の取得に失敗しました: ${exprError.message}`);
  }
  if (!expr) {
    return { status: "error", message: "対象の表現が見つかりませんでした" };
  }

  const progressMap = await getStage3ProgressMap(userId);
  const currentStreak = progressMap.get(expressionId)?.correct_streak ?? 0;
  const subStep = getStage3SubStep(currentStreak);
  const isFollowUp = followUp !== undefined && subStep === "ミニ拡張";

  const judged = await judgeStage3Answer({
    userId,
    plan,
    expressionEn: expr.expression_en as string,
    meaningJa: (expr.meaning_ja as string | null) ?? "",
    subStep,
    userSpokenText,
    phase: isFollowUp ? "followUp" : "first",
    partnerReplyEn: followUp?.partnerReplyEn,
    skipUsageCount: isFollowUp,
  });

  if (!judged.ok) {
    if (judged.reason === "limit_exceeded") {
      return { status: "limit_exceeded", limit: judged.limit };
    }
    return { status: "error", message: judged.message };
  }

  // ミニ拡張の1つ目の発話が通ったら、相手の返答を返して返事を待つ（streakは返事の判定で動かす）
  if (subStep === "ミニ拡張" && !isFollowUp && judged.judgment.correct && judged.judgment.partnerReplyEn) {
    return {
      status: "ok",
      result: {
        correct: true,
        errorTags: [],
        feedbackJa: judged.judgment.feedbackJa,
        modelAnswerEn: expr.expression_en as string,
        awaitingFollowUp: true,
        partnerReplyEn: judged.judgment.partnerReplyEn,
        partnerReplyJa: judged.judgment.partnerReplyJa ?? "",
        streak: currentStreak,
        subStep,
        graduated: false,
        usage: judged.usage,
      },
    };
  }

  const { streak: newStreak, graduated } = await reportStageStreakResult(
    userId,
    3,
    expressionId,
    STAGE3_GRADUATE_STREAK,
    judged.judgment.correct
  );

  if (!judged.judgment.correct && judged.judgment.errorTags.length > 0) {
    await recordErrorTags(userId, judged.judgment.errorTags);
  }

  // クワガタ育成機能：Stage4解放＝フルクワたんの確定採集タイミング。Stage4解放はStage3の
  // 卒業数（countStage3Graduations）に紐づくため、Stage3卒業時に閾値との完全一致で判定する
  // （reportStage1Result内のStage3解放チェックと同じ考え方）。
  if (graduated) {
    const stage3GraduationCount = await countStage3Graduations(userId);
    if (stage3GraduationCount === STAGE4_UNLOCK_STAGE3_GRADUATIONS) {
      await recordStageClearCatch(userId, 4);
    }
  }

  return {
    status: "ok",
    result: {
      correct: judged.judgment.correct,
      errorTags: judged.judgment.errorTags,
      feedbackJa: judged.judgment.feedbackJa,
      modelAnswerEn: isFollowUp
        ? (judged.judgment.exampleReplyEn ?? (expr.expression_en as string))
        : (expr.expression_en as string),
      streak: newStreak,
      subStep: getStage3SubStep(newStreak),
      graduated,
      usage: judged.usage,
    },
  };
}

// ============================================================
// Stage4（AIロールプレイ）
// Stage1〜3の「表現プールから動的に出題」方式とは違い、固定シナリオ（stage4_scenarios）を
// 一覧から選んでもらう方式（2026-09-12 設計・ユーザーとの議論で決定）。会話ログや発話内容は
// DBに保存せず、サーバーは各ターンのリクエストでhistoryを受け取って都度AIに渡すだけの
// 完全ステートレス設計（セッション用の永続テーブルを持たない）。
// ============================================================

// 公開中の全シナリオに、そのユーザーの進捗（speaking_stage_progress, stage=4,
// phrase_source='stage4_scenario'）を重ねて返す。Stage1〜3と違いアクティブセットの概念がなく、
// 全シナリオを常に選択肢として見せる（数が少ないうちは絞り込む必要がないため）。
// 公開中のStage4シナリオ(全ユーザー共通のマスタ。code順)。メモリに5分持つ。会話ターンの設定取得にも使う。
const listPublishedStage4Scenarios = ttlCached(MASTER_CACHE_TTL_MS, async () => {
  const { data, error } = await supabaseAdmin
    .from("stage4_scenarios")
    .select("id, code, scene_tag, title_ja, situation_ja, goal_ja, opening_line_en, level, ai_persona_ja")
    .eq("publish_status", "公開")
    .order("code", { ascending: true });

  if (error) {
    throw new Error(`Stage4シナリオ一覧の取得に失敗しました: ${error.message}`);
  }
  return data ?? [];
});

// track を指定すると、そのドメイン(日常=DAILY_SCENE_TAGSのシーン、ビジネス=それ以外)のシナリオだけを返す。
export async function listStage4Scenarios(
  userId: string,
  track?: "daily" | "business"
): Promise<Stage4ScenarioListItem[]> {
  const [scenarios, { data: progressRows, error: progressError }] = await Promise.all([
    listPublishedStage4Scenarios(),
    supabaseAdmin
      .from("speaking_stage_progress")
      .select("phrase_id, status, correct_streak")
      .eq("user_id", userId)
      .eq("stage", 4)
      .eq("phrase_source", "stage4_scenario"),
  ]);

  if (progressError) {
    throw new Error(`Stage4進捗の取得に失敗しました: ${progressError.message}`);
  }

  const progressMap = new Map<string, { status: string; correct_streak: number }>();
  for (const row of progressRows ?? []) {
    progressMap.set(row.phrase_id as string, {
      status: row.status as string,
      correct_streak: row.correct_streak as number,
    });
  }

  const inTrack = (sceneTag: string) =>
    !track || (track === "daily") === isDailyScene([sceneTag]);

  return (scenarios ?? []).filter((row) => inTrack(row.scene_tag as string)).map((row) => {
    const progress = progressMap.get(row.id as string);
    const streak = progress?.correct_streak ?? 0;
    return {
      id: row.id as string,
      code: row.code as string,
      sceneTag: row.scene_tag as string,
      titleJa: row.title_ja as string,
      situationJa: row.situation_ja as string,
      goalJa: row.goal_ja as string,
      openingLineEn: row.opening_line_en as string,
      level: row.level as "初級" | "中級" | "上級",
      status: (progress?.status as "未着手" | "練習中" | "習得済み" | undefined) ?? "未着手",
      warmth: computeWarmth(streak, STAGE4_GRADUATE_STREAK),
    };
  });
}

// シナリオ選択画面で「今日のセッション あと◯回」を表示するための、消費なしの残数確認。
export async function getStage4UsageInfo(
  userId: string,
  plan: Plan
): Promise<{ remaining: number; limit: number; welcomeDaysLeft?: number }> {
  const check = await checkStage4Usage(userId, plan);
  return check.allowed
    ? { remaining: check.remaining + 1, limit: check.limit, welcomeDaysLeft: check.welcomeDaysLeft }
    : { remaining: 0, limit: check.limit, welcomeDaysLeft: check.welcomeDaysLeft };
}

// Stage4の1ターン分を処理する。turnIndex===1のときだけ日次セッション開始回数をチェック・消費し、
// turnIndex===STAGE4_TURN_COUNT（最終ターン）のときだけstreak更新（シナリオ別卒業判定）を行う。
// Stage3と同様、不正解（誤り）というより「そのターンで検出されたerrorTags」を毎ターン
// user_error_tag_statsに集計する（最終ターンだけでなく、会話全体のエラー傾向を拾うため）。
export async function reportStage4Turn(
  userId: string,
  plan: Plan,
  scenarioId: string,
  turnIndex: number,
  history: Stage4Turn[],
  userUtterance: string
): Promise<Stage4TurnOutcome> {
  const scenario = (await listPublishedStage4Scenarios()).find((s) => s.id === scenarioId);
  if (!scenario) {
    return { status: "error", message: "対象のシナリオが見つかりませんでした" };
  }

  const judged = await judgeStage4Turn({
    userId,
    plan,
    scenarioTitleJa: scenario.title_ja as string,
    situationJa: scenario.situation_ja as string,
    aiPersonaJa: scenario.ai_persona_ja as string,
    goalJa: scenario.goal_ja as string,
    turnIndex,
    history,
    userUtterance,
  });

  if (!judged.ok) {
    if (judged.reason === "limit_exceeded") {
      return { status: "limit_exceeded", limit: judged.limit };
    }
    return { status: "error", message: judged.message };
  }

  // エラータグの記録は、最終ターンの卒業判定の更新と並行して行える(互いに依存しない)。
  const tagsDone =
    judged.turn.errorTags.length > 0 ? recordErrorTags(userId, judged.turn.errorTags) : Promise.resolve();

  const isFinalTurn = turnIndex >= STAGE4_TURN_COUNT;

  if (!isFinalTurn) {
    await tagsDone;
    return {
      status: "ok",
      result: {
        aiReplyEn: judged.turn.aiReplyEn,
        turnIndex,
        sessionComplete: false,
        errorTags: judged.turn.errorTags,
        usage: judged.usage,
      },
    };
  }

  const [{ streak, graduated }] = await Promise.all([
    reportStageStreakResult(
      userId,
      4,
      scenarioId,
      STAGE4_GRADUATE_STREAK,
      judged.turn.overallPass === true,
      "stage4_scenario"
    ),
    tagsDone,
  ]);

  // Stage5解放（テッペンクワたんの卵配布）。日常/ビジネスどちらのドメインで解放条件を
  // 満たしたかをこのシナリオのscene_tagから判定する。recordStageClearCatchはべき等なので、
  // 閾値を跨いだ「その回」だけでなく、既に解放済みの状態で再度満たしても安全に無視される。
  if (graduated) {
    const domain: "daily" | "business" = isDailyScene([scenario.scene_tag as string])
      ? "daily"
      : "business";
    const readiness = await getStage5DomainReadiness(userId);
    const domainReady = domain === "daily" ? readiness.dailyReady : readiness.businessReady;
    if (domainReady) {
      await recordStageClearCatch(userId, 5);
    }
  }

  return {
    status: "ok",
    result: {
      aiReplyEn: judged.turn.aiReplyEn,
      turnIndex,
      sessionComplete: true,
      errorTags: judged.turn.errorTags,
      overallPass: judged.turn.overallPass === true,
      feedbackJa: judged.turn.feedbackJa,
      streak,
      graduated,
      usage: judged.usage,
    },
  };
}

// ============================================================
// Stage5（上級ロールプレイ）
// Stage4と全く同じ「固定シナリオを一覧から選んで会話する」方式（stage5_scenarios）。
// 違いは一覧・利用回数・卒業判定がすべてtrack（daily/business）でスコープされる点のみ
// （_reference/speaking-roadmap-design.md参照）。
// ============================================================

// 指定トラックの公開中シナリオに、そのユーザーの進捗を重ねて返す。
// 公開中のStage5シナリオ(両トラック分、code順)。全ユーザー共通のマスタなのでメモリに5分持つ。
// 一覧・トラック判定・会話ターンの設定取得で共通に使う。
const listPublishedStage5Scenarios = ttlCached(MASTER_CACHE_TTL_MS, async () => {
  const { data, error } = await supabaseAdmin
    .from("stage5_scenarios")
    .select("id, code, track, scene_tag, title_ja, situation_ja, goal_ja, opening_line_en, level, ai_persona_ja")
    .eq("publish_status", "公開")
    .order("code", { ascending: true });

  if (error) {
    throw new Error(`Stage5シナリオ一覧の取得に失敗しました: ${error.message}`);
  }
  return data ?? [];
});

export async function listStage5Scenarios(
  userId: string,
  track: Stage5Track
): Promise<Stage5ScenarioListItem[]> {
  const dbTrack = track === "daily" ? "日常" : "ビジネス";

  const [allScenarios, { data: progressRows, error: progressError }] = await Promise.all([
    listPublishedStage5Scenarios(),
    supabaseAdmin
      .from("speaking_stage_progress")
      .select("phrase_id, status, correct_streak")
      .eq("user_id", userId)
      .eq("stage", 5)
      .eq("phrase_source", "stage5_scenario"),
  ]);
  const scenarios = allScenarios.filter((row) => row.track === dbTrack);

  if (progressError) {
    throw new Error(`Stage5進捗の取得に失敗しました: ${progressError.message}`);
  }

  const progressMap = new Map<string, { status: string; correct_streak: number }>();
  for (const row of progressRows ?? []) {
    progressMap.set(row.phrase_id as string, {
      status: row.status as string,
      correct_streak: row.correct_streak as number,
    });
  }

  return (scenarios ?? []).map((row) => {
    const progress = progressMap.get(row.id as string);
    const streak = progress?.correct_streak ?? 0;
    return {
      id: row.id as string,
      code: row.code as string,
      track,
      sceneTag: row.scene_tag as string,
      titleJa: row.title_ja as string,
      situationJa: row.situation_ja as string,
      goalJa: row.goal_ja as string,
      openingLineEn: row.opening_line_en as string,
      level: row.level as "中級" | "上級",
      status: (progress?.status as "未着手" | "練習中" | "習得済み" | undefined) ?? "未着手",
      warmth: computeWarmth(streak, STAGE5_GRADUATE_STREAK),
    };
  });
}

// turn APIが「このシナリオはどのトラックか」をゲートチェックのために引くための軽量ルックアップ。
// クライアントからのtrack指定を信用せず、scenarioIdからDBの実データで判定する。
export async function getStage5ScenarioTrack(scenarioId: string): Promise<Stage5Track | null> {
  const data = (await listPublishedStage5Scenarios()).find((s) => s.id === scenarioId);
  if (!data) return null;

  return (data.track as string) === "日常" ? "daily" : "business";
}

// シナリオ選択画面で「今日のセッション あと◯回」を表示するための、消費なしの残数確認。
export async function getStage5UsageInfo(
  userId: string,
  plan: Plan
): Promise<{ remaining: number; limit: number; welcomeDaysLeft?: number }> {
  const check = await checkStage5Usage(userId, plan);
  return check.allowed
    ? { remaining: check.remaining + 1, limit: check.limit, welcomeDaysLeft: check.welcomeDaysLeft }
    : { remaining: 0, limit: check.limit, welcomeDaysLeft: check.welcomeDaysLeft };
}

// Stage5の1ターン分を処理する。turnIndexが1のときだけ日次セッション開始回数をチェック・消費し、
// STAGE5_TURN_COUNT（最終ターン）のときだけstreak更新（シナリオ別卒業判定）を行う。
// trackはクライアントの指定を信用せず、scenarioIdからDB側のtrack列を引いて使う
// （turnIndex>1のリクエストでもtrackを都度取得し直すことで、解放判定を常に正しいドメインで行う）。
export async function reportStage5Turn(
  userId: string,
  plan: Plan,
  scenarioId: string,
  turnIndex: number,
  history: Stage5Turn[],
  userUtterance: string
): Promise<Stage5TurnOutcome> {
  const scenario = (await listPublishedStage5Scenarios()).find((s) => s.id === scenarioId);
  if (!scenario) {
    return { status: "error", message: "対象のシナリオが見つかりませんでした" };
  }

  const judged = await judgeStage5Turn({
    userId,
    plan,
    scenarioTitleJa: scenario.title_ja as string,
    situationJa: scenario.situation_ja as string,
    aiPersonaJa: scenario.ai_persona_ja as string,
    goalJa: scenario.goal_ja as string,
    turnIndex,
    history,
    userUtterance,
  });

  if (!judged.ok) {
    if (judged.reason === "limit_exceeded") {
      return { status: "limit_exceeded", limit: judged.limit };
    }
    return { status: "error", message: judged.message };
  }

  const tagsDone =
    judged.turn.errorTags.length > 0 ? recordErrorTags(userId, judged.turn.errorTags) : Promise.resolve();

  const isFinalTurn = turnIndex >= STAGE5_TURN_COUNT;

  if (!isFinalTurn) {
    await tagsDone;
    return {
      status: "ok",
      result: {
        aiReplyEn: judged.turn.aiReplyEn,
        turnIndex,
        sessionComplete: false,
        errorTags: judged.turn.errorTags,
        usage: judged.usage,
      },
    };
  }

  const [{ streak, graduated }] = await Promise.all([
    reportStageStreakResult(
      userId,
      5,
      scenarioId,
      STAGE5_GRADUATE_STREAK,
      judged.turn.overallPass === true,
      "stage5_scenario"
    ),
    tagsDone,
  ]);

  // テッペンクワたん強制羽化（ロードマップ完走の瞬間）。日常・ビジネスどちらのトラックで
  // 初めてStage5シナリオを卒業しても、この瞬間を「完走」として扱う。forceHatchTeppenToAdultは
  // べき等なので、2本目以降のトラックで再度graduatedになっても安全に無視される。
  if (graduated) {
    await forceHatchTeppenToAdult(userId);
  }

  return {
    status: "ok",
    result: {
      aiReplyEn: judged.turn.aiReplyEn,
      turnIndex,
      sessionComplete: true,
      errorTags: judged.turn.errorTags,
      overallPass: judged.turn.overallPass === true,
      feedbackJa: judged.turn.feedbackJa,
      streak,
      graduated,
      usage: judged.usage,
    },
  };
}

// ============================================================
// 街の掲示板（タスク#153）
// ゼロから作らず、既存の/library等の検索基盤（ExpressionStockList/ExpressionCard）を流用し、
// 「ロードマップ（Stage1〜3）で一度でも触れた表現」だけに絞った一覧＋検索を提供する。
// Stage0のusage_rulesはexpressionsと別物のため対象外（phrase_source='expression'のみ見る）。
// ============================================================

export type ExpressionRoadmapStageProgress = {
  status: string; // "習得済み" | "練習中" | "未着手"
  correctStreak: number;
};

export type ExpressionRoadmapProgress = {
  stage1?: ExpressionRoadmapStageProgress;
  stage2?: ExpressionRoadmapStageProgress;
  stage3?: ExpressionRoadmapStageProgress;
};

// そのユーザーがStage1〜3で一度でも触れた表現の進捗を、expression id単位でまとめて返す。
// 1つの表現がStage1・2・3それぞれで別々に進捗を持ちうる（各Stageは独立した進捗行）ため、
// phrase_idごとに複数stageの結果を1つのオブジェクトへ集約する。
export async function listTouchedExpressionProgress(
  userId: string
): Promise<Map<string, ExpressionRoadmapProgress>> {
  const { data, error } = await supabaseAdmin
    .from("speaking_stage_progress")
    .select("phrase_id, stage, status, correct_streak")
    .eq("user_id", userId)
    .eq("phrase_source", "expression");

  if (error) {
    throw new Error(`ロードマップ進捗の取得に失敗しました: ${error.message}`);
  }

  const map = new Map<string, ExpressionRoadmapProgress>();
  for (const row of data ?? []) {
    const phraseId = row.phrase_id as string;
    const stage = row.stage as number;
    if (stage !== 1 && stage !== 2 && stage !== 3) continue;

    const entry = map.get(phraseId) ?? {};
    const stageKey = `stage${stage}` as "stage1" | "stage2" | "stage3";
    entry[stageKey] = {
      status: row.status as string,
      correctStreak: row.correct_streak as number,
    };
    map.set(phraseId, entry);
  }

  return map;
}

// 街の掲示板からの「復習する」で呼ばれる、共通の軽量復習フロー（タスク#154）。
// Stage1〜3それぞれの出題ロジック（アクティブセット・サブステップ・AI判定など）には一切乗せない。
// 対象は必ず習得済みのフレーズなので、卒業判定をやり直す必要がなく、記録するのも
// 「今日これに触れた」という事実（last_practiced_at）と賑わい度カウントだけでよいため。
// Stage3の再プレイをまともに作るとAI判定コールが毎回走ってしまう（すでに習得済みなのに
// コストがかかる）という問題も、このアプローチなら発生しない。
export async function recordExpressionReview(userId: string, expressionId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("speaking_stage_progress")
    .update({ last_practiced_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("phrase_id", expressionId)
    .eq("phrase_source", "expression")
    .eq("status", "習得済み");

  if (error) {
    throw new Error(`復習記録の保存に失敗しました: ${error.message}`);
  }

  await recordDailyPractice(userId);
  await incrementDailyActivity(userId);
}
