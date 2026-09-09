// src/lib/supabase/speaking-roadmap.ts
// スピーキング・ロードマップ機能（会話クイズ・現在地・デイリーストリーク・Stage1出題）のデータアクセス層。
// Stage2以降の出題ロジックは別タスクで実装する。
import { supabaseAdmin } from "@/lib/supabase/server";
import { getTodayDateKey } from "@/lib/daily-rotation";
import { getExpressionAudioSignedUrl } from "@/lib/supabase/expression-audio";
import {
  STAGE1_ACTIVE_SET_SIZE,
  STAGE1_GRADUATE_STREAK,
  STAGE1_ROUND_SIZE,
  STAGE2_ACTIVE_SET_SIZE,
  STAGE2_GRADUATE_STREAK,
  STAGE2_ROUND_SIZE,
  computeWarmth,
  getStage1SubStep,
  getStage2SubStep,
  type OnboardingQuizAnswers,
  type OnboardingQuizResult,
  type RoadmapStage,
  type Stage1ReportResult,
  type Stage1RoundResponse,
  type Stage2ReportResult,
  type Stage2RoundQuestion,
  type Stage2RoundResponse,
  type Stage2SubStep,
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

// 公開済み表現を全件・code順（安定した順序）に取得し、日常会話タグを優先する順に並べ替える。
// listPublishedExpressions()は/library向けにcreated_at降順+1000件上限で作られており、
// 全1060件超のような場合に古いバッチが不定順で切り捨てられてしまうため、
// Stage1・2の出題プールにはそれを流用せず、専用にcode順の全件取得を行う。
async function listStage1PhrasePool(): Promise<Stage1PoolRow[]> {
  const { data, error } = await supabaseAdmin
    .from("expressions")
    .select("id, expression_en, meaning_ja, audio_expression_path, scene_tags")
    .eq("publish_status", "公開")
    .order("code", { ascending: true })
    .limit(5000);

  if (error) {
    throw new Error(`Stage1出題プールの取得に失敗しました: ${error.message}`);
  }

  const rows = (data ?? []).map((row) => ({
    id: row.id as string,
    expressionEn: row.expression_en as string,
    meaningJa: (row.meaning_ja as string | null) ?? undefined,
    hasAudioExpression: Boolean(row.audio_expression_path),
    sceneTags: (row.scene_tags as string[] | null) ?? [],
  }));

  return sortDailyFirst(rows);
}

// Stage1のアクティブセット（未卒業フレーズの先頭からSTAGE1_ACTIVE_SET_SIZE件）を計算する。
// 新しい状態は持たず、毎回動的に計算するだけでよい（あるフレーズが卒業した瞬間、
// 自動的にアクティブセットから外れ、次のフレーズが繰り上がる）。
async function getStage1ActiveSet(userId: string): Promise<{
  activeSet: (Stage1PoolRow & { streak: number })[];
  totalCount: number;
  remainingCount: number;
}> {
  const pool = await listStage1PhrasePool();
  const progressMap = await getStage1ProgressMap(userId);

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
export async function getStage1Round(userId: string): Promise<Stage1RoundResponse> {
  const { activeSet, totalCount, remainingCount } = await getStage1ActiveSet(userId);

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
  stage: 1 | 2,
  expressionId: string,
  graduateStreak: number,
  correct: boolean
): Promise<{ streak: number; graduated: boolean }> {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("speaking_stage_progress")
    .select("correct_streak")
    .eq("user_id", userId)
    .eq("phrase_id", expressionId)
    .eq("phrase_source", "expression")
    .eq("stage", stage)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`Stage${stage}進捗の取得に失敗しました: ${fetchError.message}`);
  }

  const currentStreak = existing?.correct_streak ?? 0;
  const newStreak = correct ? Math.min(currentStreak + 1, graduateStreak) : currentStreak;
  const graduated = newStreak >= graduateStreak;
  const status = graduated ? "習得済み" : newStreak > 0 ? "練習中" : "未着手";

  const { error: upsertError } = await supabaseAdmin.from("speaking_stage_progress").upsert(
    {
      user_id: userId,
      phrase_id: expressionId,
      phrase_source: "expression",
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

  await recordDailyPractice(userId);

  if (graduated) {
    await incrementTotalMasteredCount(userId);
  }

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
  return { streak, subStep: getStage1SubStep(streak), graduated };
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
// ライブラリの音声再生（Pro限定）とは別ルートで、「そのユーザーの現在のアクティブセットに
// 含まれるフレーズ」と一致する場合のみ発行する（任意のexpressionIdを指定して聴ける汎用APIにはしない）。
export async function getStage1AudioUrl(userId: string, expressionId: string): Promise<string | null> {
  const { activeSet } = await getStage1ActiveSet(userId);
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
async function listStage2ContentPool(userId: string): Promise<DbStage2ContentRow[]> {
  const graduatedIds = await getStage1GraduatedExpressionIds(userId);
  if (graduatedIds.size === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("stage2_quiz_content")
    .select(
      "expression_id, blank_target, blank_choices, sentence_choices, context_prompt_ja, expressions(code, expression_en, meaning_ja, scene_tags)"
    );

  if (error) {
    throw new Error(`Stage2コンテンツの取得に失敗しました: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as DbStage2ContentRow[];
  const sortedByCode = rows
    .filter((row) => graduatedIds.has(row.expression_id) && row.expressions)
    .sort((a, b) => (a.expressions!.code).localeCompare(b.expressions!.code));

  return sortDailyFirst(sortedByCode.map((row) => ({ ...row, sceneTags: row.expressions!.scene_tags ?? [] })));
}

// Stage2のアクティブセット（未卒業フレーズの先頭からSTAGE2_ACTIVE_SET_SIZE件）を計算する。
// Stage1と同じく新しい状態は持たず、毎回動的に計算するだけでよい。
async function getStage2ActiveSet(userId: string): Promise<{
  activeSet: (DbStage2ContentRow & { streak: number; subStep: Stage2SubStep })[];
  totalCount: number;
  remainingCount: number;
}> {
  const pool = await listStage2ContentPool(userId);

  const { data: progressData, error: progressError } = await supabaseAdmin
    .from("speaking_stage_progress")
    .select("phrase_id, status, correct_streak")
    .eq("user_id", userId)
    .eq("stage", 2)
    .eq("phrase_source", "expression");

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
function buildStage2Question(
  row: DbStage2ContentRow,
  subStep: Stage2SubStep,
  streak: number
): Stage2RoundQuestion {
  const meaningJa = row.expressions!.meaning_ja ?? undefined;
  const expressionEn = row.expressions!.expression_en;
  const warmth = computeWarmth(streak, STAGE2_GRADUATE_STREAK);

  if (subStep === "微改変") {
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
    const referenceChoices = shuffleArray(row.blank_choices.filter((c) => c !== row.blank_target));

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
  const referenceChoices = shuffleArray(row.sentence_choices.filter((c) => c !== expressionEn));
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

  return {
    status: "round",
    questions: sampled.map((row) => buildStage2Question(row, row.subStep, row.streak)),
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
