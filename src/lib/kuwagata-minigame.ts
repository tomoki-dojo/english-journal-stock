// 採集ミニゲーム「5秒単語チャレンジ」のサーバー側。
// 問題の出題と正解の保持・回答の採点はすべてサーバーで行い、クライアントの申告する正解数は信用しない。
// 流れ: startMinigameSession(問題を発行・正解はDBに保存) → クライアントが5秒で回答 → finishMinigameSession(採点・使い切り)
import { supabaseAdmin } from "@/lib/supabase/server";
import type { KuwagataAreaCode } from "@/lib/supabase/kuwagata";

// エリアごとの出題難易度(quiz_words.difficulty の範囲)。奥のエリアほど難しい。
const AREA_DIFFICULTY_RANGE: Record<KuwagataAreaCode, [number, number]> = {
  area1: [1, 2],
  area2: [2, 3],
  area3: [3, 4],
  area4: [4, 5],
  aquarium: [3, 5],
};

export const MINIGAME_QUESTION_COUNT = 30;
export const MINIGAME_DURATION_SEC = 5;
const CHOICE_COUNT = 4;
// 発行から採点までの有効時間(説明・カウントダウン・プレイ込み)
const SESSION_TTL_MS = 3 * 60 * 1000;
// 1問に最低かかる時間(これより速い回答数は物理的に不可能として切り捨てる)
const MIN_SEC_PER_ANSWER = 0.4;
// 5秒で正解できる数の上限(これ以上は不正とみなして丸める)
const MAX_PLAUSIBLE_CORRECT = 12;

export type MinigameQuestion = { word: string; choices: string[] };

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// 正解数に応じたレア・激レアの重み倍率。コモンの重みは変えない。
export function getRareBoostMultiplier(correctCount: number): number {
  if (correctCount >= 7) return 3;
  if (correctCount >= 5) return 2;
  if (correctCount >= 3) return 1.5;
  return 1;
}

export async function startMinigameSession(
  userId: string,
  areaCode: KuwagataAreaCode
): Promise<{ sessionId: string; questions: MinigameQuestion[]; durationSec: number }> {
  const [minDifficulty, maxDifficulty] = AREA_DIFFICULTY_RANGE[areaCode];
  const { data, error } = await supabaseAdmin
    .from("quiz_words")
    .select("word_en, meaning_ja, difficulty")
    .eq("active", true)
    .eq("publish_status", "公開")
    .gte("difficulty", minDifficulty)
    .lte("difficulty", maxDifficulty);
  if (error) throw new Error(`ミニゲームの単語取得に失敗しました: ${error.message}`);
  const words = data ?? [];
  if (words.length < CHOICE_COUNT) throw new Error("ミニゲームの単語が足りません");

  const picked = shuffle(words).slice(0, MINIGAME_QUESTION_COUNT);
  const questions: MinigameQuestion[] = [];
  const correctIndices: number[] = [];
  for (const word of picked) {
    const distractors = shuffle(words.filter((w) => w.meaning_ja !== word.meaning_ja))
      .slice(0, CHOICE_COUNT - 1)
      .map((w) => w.meaning_ja as string);
    const choices = shuffle([word.meaning_ja as string, ...distractors]);
    questions.push({ word: word.word_en as string, choices });
    correctIndices.push(choices.indexOf(word.meaning_ja as string));
  }

  const { data: session, error: insertError } = await supabaseAdmin
    .from("kuwagata_minigame_sessions")
    .insert({ user_id: userId, area_code: areaCode, correct_indices: correctIndices })
    .select("id")
    .single();
  if (insertError || !session) throw new Error(`ミニゲームの開始に失敗しました: ${insertError?.message}`);

  return { sessionId: session.id as string, questions, durationSec: MINIGAME_DURATION_SEC };
}

// 回答を採点して正解数を返す。セッションは1回だけ使える。無効・期限切れ・使用済み・エリア違いは0問扱い。
export async function finishMinigameSession(
  userId: string,
  sessionId: string,
  areaCode: KuwagataAreaCode,
  answers: unknown
): Promise<number> {
  if (!Array.isArray(answers)) return 0;
  const { data, error } = await supabaseAdmin
    .from("kuwagata_minigame_sessions")
    .update({ used_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .eq("area_code", areaCode)
    .is("used_at", null)
    .select("correct_indices, created_at")
    .maybeSingle();
  if (error || !data) return 0;

  const elapsedMs = Date.now() - new Date(data.created_at as string).getTime();
  if (elapsedMs > SESSION_TTL_MS) return 0;

  const correct = data.correct_indices as number[];
  let count = 0;
  for (let i = 0; i < Math.min(answers.length, correct.length); i++) {
    if (answers[i] === correct[i]) count++;
  }
  const plausible = Math.min(MAX_PLAUSIBLE_CORRECT, Math.floor(elapsedMs / 1000 / MIN_SEC_PER_ANSWER));
  return Math.min(count, plausible);
}
