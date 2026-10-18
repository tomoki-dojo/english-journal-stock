// 採集ミニゲーム「10秒単語チャレンジ」のサーバー側。
// 問題の出題と正解の保持・回答の採点はすべてサーバーで行い、クライアントの申告する正解数は信用しない。
// 流れ: startMinigameSession(問題を発行・正解はDBに保存) → クライアントが制限時間内に回答 → finishMinigameSession(採点・使い切り)
import { supabaseAdmin } from "@/lib/supabase/server";
import type { KuwagataAreaCode } from "@/lib/supabase/kuwagata";
import { getMinigameDurationSec } from "@/lib/kuwagata-minigame-config";
// 難易度ごとにDBから取る単語数。重めの難易度で最大20問ほど要るので、余裕をみて40。
const WORDS_PER_DIFFICULTY = 40;

// エリアごとの出題難易度(quiz_words.difficulty の範囲)。奥のエリアほど難しい。
// 値は「その難易度の出やすさ」(出題数の比率)。重め=2、軽め=1。難易度5は難しいので軽めにしている。
const AREA_DIFFICULTY_WEIGHTS: Record<KuwagataAreaCode, Record<number, number>> = {
  area1: { 1: 1, 2: 1 },
  area2: { 2: 1, 3: 1 },
  area3: { 3: 2, 4: 1 },
  area4: { 3: 1, 4: 2 },
  area5: { 4: 2, 5: 1 },
  aquarium: { 3: 1, 4: 1, 5: 1 },
  ancient: { 4: 2, 5: 1 },
};

// 難易度の重みに従って、重複なしでcount問を選ぶ。1問ごとに難易度を重みで抽選し、その中からランダムに1語。
function pickWeighted<T extends { difficulty: number }>(
  words: T[],
  weights: Record<number, number>,
  count: number
): T[] {
  const buckets = new Map<number, T[]>();
  for (const w of shuffle(words)) {
    const list = buckets.get(w.difficulty) ?? [];
    list.push(w);
    buckets.set(w.difficulty, list);
  }
  const picked: T[] = [];
  while (picked.length < count) {
    const open = [...buckets.entries()].filter(([, list]) => list.length > 0);
    if (open.length === 0) break;
    const total = open.reduce((sum, [d]) => sum + (weights[d] ?? 1), 0);
    let r = Math.random() * total;
    let chosen = open[open.length - 1];
    for (const entry of open) {
      r -= weights[entry[0]] ?? 1;
      if (r < 0) {
        chosen = entry;
        break;
      }
    }
    picked.push(chosen[1].pop() as T);
  }
  return picked;
}

export const MINIGAME_QUESTION_COUNT = 30;
export { getMinigameDurationSec } from "@/lib/kuwagata-minigame-config";
const CHOICE_COUNT = 4;
// 発行から採点までの有効時間(説明・カウントダウン・プレイ込み)
const SESSION_TTL_MS = 3 * 60 * 1000;
// 1問に最低かかる時間(これより速い回答数は物理的に不可能として切り捨てる)
const MIN_SEC_PER_ANSWER = 0.4;
// 制限時間内で正解できる数の上限(これ以上は不正とみなして丸める)
const MAX_PLAUSIBLE_CORRECT = 25;

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
  if (correctCount >= 14) return 3;
  if (correctCount >= 10) return 2;
  if (correctCount >= 6) return 1.5;
  return 1;
}

export async function startMinigameSession(
  userId: string,
  areaCode: KuwagataAreaCode
): Promise<{ sessionId: string; questions: MinigameQuestion[]; durationSec: number }> {
  const weights = AREA_DIFFICULTY_WEIGHTS[areaCode];
  const difficulties = Object.keys(weights).map(Number);
  type Row = { word_en: string; meaning_ja: string; difficulty: number };
  // 全単語は取らず、難易度ごとにDB側でランダムに少数だけ取る(出題30問+選択肢の候補に足りる数)。
  const results = await Promise.all(
    difficulties.map((d) => supabaseAdmin.rpc("get_minigame_words", { p_difficulty: d, p_limit: WORDS_PER_DIFFICULTY }))
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(`ミニゲームの単語取得に失敗しました: ${failed.error.message}`);
  const words = results.flatMap((r) => (r.data ?? []) as Row[]);
  if (words.length < CHOICE_COUNT) throw new Error("ミニゲームの単語が足りません");

  const picked = pickWeighted(words, weights, MINIGAME_QUESTION_COUNT);
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

  return { sessionId: session.id as string, questions, durationSec: getMinigameDurationSec(areaCode) };
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
