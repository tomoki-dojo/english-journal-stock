// src/lib/supabase/word-review.ts
// 単語学習機能の間隔反復（Leitner箱方式）・小テストまわりのロジック。
// Pro/Premium限定機能（呼び出し側でプラン判定してからガードすること。ここではガードしない）。
import { supabaseAdmin } from "@/lib/supabase/server";
import { getTodayDateKey } from "@/lib/daily-rotation";
import { listPublishedVocabulary, listVocabularyByIds } from "@/lib/supabase/vocabulary";
import { ensureSavedVocabulary, listSavedVocabularyIds } from "@/lib/supabase/saved-vocabulary";
import type {
  BoxLevel,
  LearningVocabulary,
  QuizDirection,
  QuizQuestion,
  Vocabulary,
  WordReviewProgress,
} from "@/components/vocabulary/types";

// 箱ごとの復習間隔（日数）。正解でこの表の通り先に進み、不正解で箱1に戻る。
const BOX_INTERVAL_DAYS: Record<BoxLevel, number> = {
  1: 1,
  2: 3,
  3: 7,
  4: 30,
  5: 90,
};

const MAX_BOX_LEVEL: BoxLevel = 5;
const QUIZ_QUESTION_COUNT = 10;
const DISTRACTOR_COUNT = 3;

// ランダム学習（誰でも利用可・SRS状態は変更しない練習モード）の設定
const RANDOM_PRACTICE_QUESTION_COUNT = 10;
// マイリストの単語のうち、学習を始めていない（進捗データがない）単語の重み
const NO_PROGRESS_WEIGHT = 3;
// 直近の回答が不正解だった単語に加算する重み
const INCORRECT_BONUS_WEIGHT = 2;

// YYYY-MM-DD形式の日付文字列にN日足す（UTC基準の暦日演算なのでDST等の影響を受けない）。
function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function nextBoxLevel(current: BoxLevel, correct: boolean): BoxLevel {
  if (!correct) return 1;
  return Math.min(current + 1, MAX_BOX_LEVEL) as BoxLevel;
}

type DbProgressRow = {
  vocabulary_id: string;
  box_level: number;
  next_review_date: string;
  correct_streak: number;
  total_reviews: number;
  last_result: string | null;
};

function fromDbProgressRow(row: DbProgressRow): WordReviewProgress {
  return {
    vocabularyId: row.vocabulary_id,
    boxLevel: row.box_level as BoxLevel,
    nextReviewDate: row.next_review_date,
    correctStreak: row.correct_streak,
    totalReviews: row.total_reviews,
    lastResult: (row.last_result as "correct" | "incorrect" | null) ?? null,
  };
}

// ユーザーの学習リストに入っている単語idの一覧（カード側の「追加済みか」の初期表示に使う）
export async function listLearningVocabularyIds(userId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("word_review_progress")
    .select("vocabulary_id")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`学習リストの取得に失敗しました: ${error.message}`);
  }

  return (data ?? []).map((row) => row.vocabulary_id as string);
}

type AddToLearningListResult = { ok: true } | { ok: false; message: string };

// 単語を学習リストに追加する（箱1・今日から復習開始）。既に追加済みなら何もしない。
// 「学習を始める」は「保存」の上位概念なので、まだ保存（マイリスト）されていなければ自動的に保存もする。
export async function addToLearningList(
  userId: string,
  vocabularyId: string
): Promise<AddToLearningListResult> {
  const today = getTodayDateKey();

  const { error } = await supabaseAdmin.from("word_review_progress").upsert(
    {
      user_id: userId,
      vocabulary_id: vocabularyId,
      box_level: 1,
      next_review_date: today,
      correct_streak: 0,
      total_reviews: 0,
      last_result: null,
    },
    { onConflict: "user_id,vocabulary_id", ignoreDuplicates: true }
  );

  if (error) {
    return { ok: false, message: error.message };
  }

  await ensureSavedVocabulary(userId, vocabularyId);

  return { ok: true };
}

type RemoveFromLearningListResult = { ok: true } | { ok: false; message: string };

export async function removeFromLearningList(
  userId: string,
  vocabularyId: string
): Promise<RemoveFromLearningListResult> {
  const { error } = await supabaseAdmin
    .from("word_review_progress")
    .delete()
    .eq("user_id", userId)
    .eq("vocabulary_id", vocabularyId);

  if (error) {
    return { ok: false, message: error.message };
  }

  return { ok: true };
}

export type ProgressSummary = {
  dueToday: number;
  learning: number; // box 1〜4（まだ卒業していない）
  mastered: number; // box 5
  total: number;
};

// 進捗ダッシュボード用のサマリー
export async function getProgressSummary(userId: string): Promise<ProgressSummary> {
  const { data, error } = await supabaseAdmin
    .from("word_review_progress")
    .select("box_level, next_review_date")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`学習進捗の取得に失敗しました: ${error.message}`);
  }

  const today = getTodayDateKey();
  const rows = data ?? [];

  let dueToday = 0;
  let mastered = 0;
  for (const row of rows) {
    if (row.next_review_date <= today) dueToday += 1;
    if (row.box_level >= MAX_BOX_LEVEL) mastered += 1;
  }

  return {
    dueToday,
    learning: rows.length - mastered,
    mastered,
    total: rows.length,
  };
}

// 今日復習すべき単語（学習中の単語 + 進捗）を取得
async function getDueLearningVocabulary(
  userId: string,
  limit: number
): Promise<LearningVocabulary[]> {
  const today = getTodayDateKey();

  const { data, error } = await supabaseAdmin
    .from("word_review_progress")
    .select("vocabulary_id, box_level, next_review_date, correct_streak, total_reviews, last_result")
    .eq("user_id", userId)
    .lte("next_review_date", today)
    .order("next_review_date", { ascending: true })
    .limit(limit);

  if (error) {
    throw new Error(`復習対象の取得に失敗しました: ${error.message}`);
  }

  const rows = (data ?? []) as DbProgressRow[];
  if (rows.length === 0) return [];

  const vocabList = await listVocabularyByIds(rows.map((r) => r.vocabulary_id));
  const vocabById = new Map(vocabList.map((v) => [v.id, v]));

  return rows
    .map((row) => {
      const vocab = vocabById.get(row.vocabulary_id);
      if (!vocab) return null;
      return { ...vocab, progress: fromDbProgressRow(row) };
    })
    .filter((v): v is LearningVocabulary => v !== null);
}

function pickRandom<T>(items: T[], count: number, exclude: Set<string>, keyOf: (item: T) => string): T[] {
  const pool = items.filter((item) => !exclude.has(keyOf(item)));
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function shuffleWithCorrectIndex(choices: string[], correctValue: string): { choices: string[]; correctIndex: number } {
  const shuffled = [...choices].sort(() => Math.random() - 0.5);
  return { choices: shuffled, correctIndex: shuffled.indexOf(correctValue) };
}

// 単語1つぶんの4択クイズを組み立てる共通ロジック（今日の復習／ランダム学習の両方で使う）。
// 出題方向（英語→意味 / 意味→英語）はランダム。誤答は同レベル帯の他の公開単語から選ぶ
// （同レベルの候補が足りない場合は全体からフォールバックする。それでも足りなければnullを返す）。
function buildQuestionForVocabulary(
  vocab: Vocabulary,
  allVocab: Vocabulary[],
  excludeIds: Set<string>
): QuizQuestion | null {
  const direction: QuizDirection = Math.random() < 0.5 ? "en-to-ja" : "ja-to-en";

  const sameLevelPool = allVocab.filter((v) => v.level === vocab.level);
  const exclude = new Set([vocab.id, ...excludeIds]);
  let distractorPool = pickRandom(sameLevelPool, DISTRACTOR_COUNT, exclude, (v) => v.id);

  if (distractorPool.length < DISTRACTOR_COUNT) {
    const fallbackExclude = new Set([...exclude, ...distractorPool.map((v) => v.id)]);
    const fallback = pickRandom(
      allVocab,
      DISTRACTOR_COUNT - distractorPool.length,
      fallbackExclude,
      (v) => v.id
    );
    distractorPool = [...distractorPool, ...fallback];
  }

  // 誤答すら十分に集まらない場合（コンテンツがごく少ない場合）はこの単語をスキップ
  if (distractorPool.length < DISTRACTOR_COUNT) return null;

  const correctValue = direction === "en-to-ja" ? vocab.meaningJa : vocab.wordEn;
  const distractorValues = distractorPool.map((v) =>
    direction === "en-to-ja" ? v.meaningJa : v.wordEn
  );

  const { choices, correctIndex } = shuffleWithCorrectIndex(
    [correctValue, ...distractorValues],
    correctValue
  );

  return {
    vocabularyId: vocab.id,
    direction,
    prompt: direction === "en-to-ja" ? vocab.wordEn : vocab.meaningJa,
    choices,
    correctIndex,
  };
}

// 今日の復習対象から4択クイズを組み立てる。回答結果はsubmitReviewResultでSRS状態に反映される。
export async function buildQuizQuestions(userId: string): Promise<QuizQuestion[]> {
  const dueVocab = await getDueLearningVocabulary(userId, QUIZ_QUESTION_COUNT);
  if (dueVocab.length === 0) return [];

  const allVocab = await listPublishedVocabulary();
  const dueIds = new Set(dueVocab.map((v) => v.id));

  const questions: QuizQuestion[] = [];
  for (const vocab of dueVocab) {
    const question = buildQuestionForVocabulary(vocab, allVocab, dueIds);
    if (question) questions.push(question);
  }

  return questions;
}

// 重み付き非復元抽出（Efraimidis-Spirakisのアルゴリズム）。
// 重みが大きいアイテムほど選ばれやすくなるが、重み0のアイテムも選ばれる可能性は残る。
function weightedSampleWithoutReplacement<T>(
  entries: { item: T; weight: number }[],
  count: number
): T[] {
  const keyed = entries.map(({ item, weight }) => ({
    item,
    key: Math.random() ** (1 / Math.max(weight, 0.0001)),
  }));
  keyed.sort((a, b) => b.key - a.key);
  return keyed.slice(0, count).map((k) => k.item);
}

// ランダム学習：マイリスト（保存済み）の単語からランダムに出題する練習モード。誰でも利用可能。
// SRS状態（word_review_progress）は一切変更しない。
// 進捗データ（学習を始めている単語）があれば、苦手な単語（箱レベルが低い／直近の回答が不正解）を
// 優先的に出題する。マイリストが空の場合は公開単語全体から均等ランダムにフォールバックする。
export async function buildRandomPracticeQuestions(userId: string): Promise<QuizQuestion[]> {
  const allVocab = await listPublishedVocabulary();
  if (allVocab.length === 0) return [];

  const savedIds = await listSavedVocabularyIds(userId);

  let pool: Vocabulary[];
  let weightOf: (vocabularyId: string) => number;

  if (savedIds.length > 0) {
    pool = await listVocabularyByIds(savedIds);

    const { data: progressRows, error } = await supabaseAdmin
      .from("word_review_progress")
      .select("vocabulary_id, box_level, last_result")
      .eq("user_id", userId);

    if (error) {
      throw new Error(`学習進捗の取得に失敗しました: ${error.message}`);
    }

    const progressByVocabId = new Map(
      (progressRows ?? []).map((row) => [
        row.vocabulary_id as string,
        {
          boxLevel: row.box_level as BoxLevel,
          lastResult: row.last_result as "correct" | "incorrect" | null,
        },
      ])
    );

    weightOf = (vocabularyId) => {
      const progress = progressByVocabId.get(vocabularyId);
      if (!progress) return NO_PROGRESS_WEIGHT;
      const base = MAX_BOX_LEVEL + 1 - progress.boxLevel; // 箱1→重み5、箱5→重み1
      return base + (progress.lastResult === "incorrect" ? INCORRECT_BONUS_WEIGHT : 0);
    };
  } else {
    // マイリストが空：公開単語全体から均等ランダムにフォールバック
    pool = allVocab;
    weightOf = () => 1;
  }

  if (pool.length === 0) return [];

  const picked = weightedSampleWithoutReplacement(
    pool.map((vocab) => ({ item: vocab, weight: weightOf(vocab.id) })),
    Math.min(RANDOM_PRACTICE_QUESTION_COUNT, pool.length)
  );

  const pickedIds = new Set(picked.map((v) => v.id));
  const questions: QuizQuestion[] = [];
  for (const vocab of picked) {
    const question = buildQuestionForVocabulary(vocab, allVocab, pickedIds);
    if (question) questions.push(question);
  }

  return questions;
}

export type SubmitReviewResult =
  | { ok: true; newBoxLevel: BoxLevel; nextReviewDate: string }
  | { ok: false; message: string };

// 回答結果を反映し、次の箱レベル・復習日を更新する
export async function submitReviewResult(
  userId: string,
  vocabularyId: string,
  correct: boolean
): Promise<SubmitReviewResult> {
  const { data: existing, error: fetchError } = await supabaseAdmin
    .from("word_review_progress")
    .select("box_level, correct_streak, total_reviews")
    .eq("user_id", userId)
    .eq("vocabulary_id", vocabularyId)
    .single();

  if (fetchError || !existing) {
    return { ok: false, message: "学習リストにこの単語が見つかりませんでした" };
  }

  const currentBox = existing.box_level as BoxLevel;
  const newBoxLevel = nextBoxLevel(currentBox, correct);
  const today = getTodayDateKey();
  const nextReviewDate = addDaysToDateKey(today, BOX_INTERVAL_DAYS[newBoxLevel]);

  const { error: updateError } = await supabaseAdmin
    .from("word_review_progress")
    .update({
      box_level: newBoxLevel,
      next_review_date: nextReviewDate,
      correct_streak: correct ? existing.correct_streak + 1 : 0,
      total_reviews: existing.total_reviews + 1,
      last_result: correct ? "correct" : "incorrect",
    })
    .eq("user_id", userId)
    .eq("vocabulary_id", vocabularyId);

  if (updateError) {
    return { ok: false, message: updateError.message };
  }

  return { ok: true, newBoxLevel, nextReviewDate };
}

// マイリスト（学習リスト）画面用：進捗つきの単語一覧を取得
export async function listLearningVocabularyWithProgress(
  userId: string
): Promise<LearningVocabulary[]> {
  const { data, error } = await supabaseAdmin
    .from("word_review_progress")
    .select("vocabulary_id, box_level, next_review_date, correct_streak, total_reviews, last_result")
    .eq("user_id", userId)
    .order("next_review_date", { ascending: true });

  if (error) {
    throw new Error(`学習リストの取得に失敗しました: ${error.message}`);
  }

  const rows = (data ?? []) as DbProgressRow[];
  if (rows.length === 0) return [];

  const vocabList = await listVocabularyByIds(rows.map((r) => r.vocabulary_id));
  const vocabById = new Map<string, Vocabulary>(vocabList.map((v) => [v.id, v]));

  return rows
    .map((row) => {
      const vocab = vocabById.get(row.vocabulary_id);
      if (!vocab) return null;
      return { ...vocab, progress: fromDbProgressRow(row) };
    })
    .filter((v): v is LearningVocabulary => v !== null);
}
