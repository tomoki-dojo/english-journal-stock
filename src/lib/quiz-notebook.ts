// 「単語ノート」(部屋の入口から遊ぶ単語4択クイズ)のサーバー側。
// 出題と正解はサーバーで保持・採点し、クライアントの申告は信用しない。
// 流れ: startNotebookRound(問題を発行・正解はDBに保存) → 10問に回答 → finishNotebookRound(採点・進捗更新・成長ブースト付与)
import { supabaseAdmin } from "@/lib/supabase/server";
import { addGrowthBoost } from "@/lib/supabase/kuwagata";
import type { Plan } from "@/lib/plan";

// 出題の単位は難易度(1〜5)。1・2=初級(中学)、3・4=中級(高校)、5=上級(大学)。
export type NotebookDifficulty = 1 | 2 | 3 | 4 | 5;
export const NOTEBOOK_DIFFICULTIES: NotebookDifficulty[] = [1, 2, 3, 4, 5];

export const NOTEBOOK_QUESTION_COUNT = 10;
const WEAK_QUESTION_COUNT = 3;
const CHOICE_COUNT = 4;
const SESSION_TTL_MS = 30 * 60 * 1000;
// 「覚えた」の目安: 通算2回以上正解していて、直近も正解。覚えた単語は、未出題・苦手・それ以外が尽きたときの補充にだけ出る。
export const MASTERED_CORRECT_COUNT = 2;

// 1問正解あたりの基本ブースト(日)と、1日の付与上限(日)。Proは多め。
const BASE_BOOST_PER_CORRECT: Record<Plan, number> = { free: 0.003, pro: 0.006, premium: 0.006 };
const DAILY_BOOST_CAP: Record<Plan, number> = { free: 0.1, pro: 0.2, premium: 0.2 };
const DIFFICULTY_MULTIPLIER: Record<NotebookDifficulty, number> = { 1: 1, 2: 1, 3: 1.5, 4: 1.5, 5: 2 };

export type NotebookQuestion = {
  word: string;
  exampleEn: string | null;
  choices: string[];
};

type WordRow = {
  id: string;
  word_en: string;
  part_of_speech: string | null;
  meaning_ja: string;
  example_en: string | null;
  example_ja: string | null;
  difficulty: NotebookDifficulty;
  distractors_ja: string[] | null;
  other_meanings_ja: string[] | null;
};

// ダミー候補プールから使う個数。残りは同じ品詞の他の単語の意味で埋めるので、組み合わせが毎回変わる。
const POOL_PICK_COUNT = 2;

// 選択肢が正解と同じ・包含関係にある(「母」と「祖母」など)かどうか。意味の重なりを避けるための簡易判定。
function overlapsMeaning(candidate: string, correct: string): boolean {
  const core = (s: string) => s.replace(/[（(].*?[）)]|〜|～/g, "");
  const a = core(candidate);
  const b = core(correct);
  if (a === b) return true;
  return a.length >= 2 && b.length >= 2 && (a.includes(b) || b.includes(a));
}

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function isNotebookDifficulty(value: unknown): value is NotebookDifficulty {
  return typeof value === "number" && (NOTEBOOK_DIFFICULTIES as number[]).includes(value);
}

// 今日(日本時間)のブースト付与状況。上限に達しているかを部屋の見た目に使う。
export async function isNotebookBoostCapped(userId: string, plan: Plan): Promise<boolean> {
  const day = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const { data } = await supabaseAdmin
    .from("quiz_word_daily_boost")
    .select("boost_days")
    .eq("user_id", userId)
    .eq("day", day)
    .maybeSingle();
  const used = Number(data?.boost_days ?? 0);
  return used >= DAILY_BOOST_CAP[plan] - 1e-9;
}

export async function startNotebookRound(
  userId: string,
  difficulty: NotebookDifficulty
): Promise<{ sessionId: string; questions: NotebookQuestion[] }> {
  const { data, error } = await supabaseAdmin
    .from("quiz_words")
    .select("id, word_en, part_of_speech, meaning_ja, example_en, example_ja, difficulty, distractors_ja, other_meanings_ja")
    .eq("active", true)
    .eq("publish_status", "公開")
    .eq("difficulty", difficulty);
  if (error) throw new Error(`単語の取得に失敗しました: ${error.message}`);
  const words = (data ?? []) as WordRow[];
  if (words.length < CHOICE_COUNT) throw new Error("単語が足りません");
  const byId = new Map(words.map((w) => [w.id, w]));

  const { data: progress, error: progressError } = await supabaseAdmin
    .from("quiz_word_progress")
    .select("word_id, last_result, last_answered_at, correct_count")
    .eq("user_id", userId);
  if (progressError) throw new Error(`進捗の取得に失敗しました: ${progressError.message}`);
  const seen = new Set((progress ?? []).map((p) => p.word_id as string));
  const masteredIds = new Set(
    (progress ?? [])
      .filter((p) => p.last_result === true && (p.correct_count as number) >= MASTERED_CORRECT_COUNT)
      .map((p) => p.word_id as string)
  );
  const answeredAt = new Map((progress ?? []).map((p) => [p.word_id as string, String(p.last_answered_at)]));

  // 苦手(直近で間違えた)単語を新しい順に、この難易度の分だけ最大WEAK_QUESTION_COUNT問。
  const weakIds = (progress ?? [])
    .filter((p) => p.last_result === false && byId.has(p.word_id as string))
    .sort((a, b) => String(b.last_answered_at).localeCompare(String(a.last_answered_at)))
    .slice(0, WEAK_QUESTION_COUNT)
    .map((p) => p.word_id as string);
  const weakWords = weakIds.map((id) => byId.get(id)!);

  // 残りは未出題の単語から。足りなければ出題済みの単語から補う。
  const weakSet = new Set(weakIds);
  const unseen = shuffle(words.filter((w) => !seen.has(w.id)));
  const restNeeded = NOTEBOOK_QUESTION_COUNT - weakWords.length;
  let rest = unseen.slice(0, restNeeded);
  if (rest.length < restNeeded) {
    // 出題済みの補充は、覚えていない単語を古い順に。それでも足りないときだけ覚えた単語から。
    const oldestFirst = (a: WordRow, b: WordRow) => (answeredAt.get(a.id) ?? "").localeCompare(answeredAt.get(b.id) ?? "");
    const candidates = words.filter((w) => seen.has(w.id) && !weakSet.has(w.id));
    const filler = [
      ...candidates.filter((w) => !masteredIds.has(w.id)).sort(oldestFirst),
      ...shuffle(candidates.filter((w) => masteredIds.has(w.id))),
    ];
    rest = [...rest, ...filler.slice(0, restNeeded - rest.length)];
  }
  const picked = shuffle([...weakWords, ...rest]);

  const questions: NotebookQuestion[] = [];
  const correctIndices: number[] = [];
  for (const word of picked) {
    const distractorMeanings: string[] = [];
    const addDistractor = (m: string) => {
      if (distractorMeanings.length >= CHOICE_COUNT - 1 || distractorMeanings.includes(m) || overlapsMeaning(m, word.meaning_ja)) return;
      // その単語の別の意味(多義語)と重なる選択肢は、正解とも取れてしまうので除く。
      if ((word.other_meanings_ja ?? []).some((o) => overlapsMeaning(m, o))) return;
      distractorMeanings.push(m);
    };
    // 1) 単語ごとに用意した「それらしい間違い」の候補から、毎回ランダムに最大POOL_PICK_COUNT個(組み合わせが固定にならないように)。
    for (const m of shuffle(word.distractors_ja ?? []).slice(0, POOL_PICK_COUNT)) addDistractor(m);
    // 2) 残りは、同じ品詞の他の単語の意味から(意味が重複するもの・正解と重なるものは除く)。
    const others = words.filter((w) => w.id !== word.id && w.meaning_ja !== word.meaning_ja);
    const samePos = shuffle(others.filter((w) => w.part_of_speech === word.part_of_speech));
    const otherPos = shuffle(others.filter((w) => w.part_of_speech !== word.part_of_speech));
    for (const w of [...samePos, ...otherPos]) addDistractor(w.meaning_ja);
    // 候補が足りないときの保険(重なりの判定を外して埋める)。
    for (const w of [...samePos, ...otherPos]) {
      if (distractorMeanings.length >= CHOICE_COUNT - 1) break;
      if (!distractorMeanings.includes(w.meaning_ja)) distractorMeanings.push(w.meaning_ja);
    }
    const choices = shuffle([word.meaning_ja, ...distractorMeanings]);
    questions.push({ word: word.word_en, exampleEn: word.example_en, choices });
    correctIndices.push(choices.indexOf(word.meaning_ja));
  }

  const { data: session, error: insertError } = await supabaseAdmin
    .from("quiz_word_sessions")
    .insert({ user_id: userId, word_ids: picked.map((w) => w.id), correct_indices: correctIndices })
    .select("id")
    .single();
  if (insertError || !session) throw new Error(`開始に失敗しました: ${insertError?.message}`);
  return { sessionId: session.id as string, questions };
}

export type NotebookAnswerFeedback = {
  correct: boolean;
  correctIndex: number;
  meaning: string;
  exampleEn: string | null;
  exampleJa: string | null;
};

// 1問ごとの答え合わせ。回答はここでサーバーに記録され(順番どおり・変更不可)、finishはこの記録で採点する。
export async function answerNotebookQuestion(
  userId: string,
  sessionId: string,
  index: number,
  choice: number
): Promise<NotebookAnswerFeedback | null> {
  if (!Number.isInteger(index) || !Number.isInteger(choice) || index < 0 || choice < 0 || choice >= CHOICE_COUNT) return null;
  const { data: session } = await supabaseAdmin
    .from("quiz_word_sessions")
    .select("word_ids, correct_indices, answers, created_at, used_at")
    .eq("id", sessionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!session || session.used_at) return null;
  if (Date.now() - new Date(session.created_at as string).getTime() > SESSION_TTL_MS) return null;
  const wordIds = session.word_ids as string[];
  const correctIndices = session.correct_indices as number[];
  const answers = (session.answers as number[] | null) ?? [];
  if (index >= wordIds.length || answers.length !== index) return null;

  const { error } = await supabaseAdmin
    .from("quiz_word_sessions")
    .update({ answers: [...answers, choice] })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .is("used_at", null);
  if (error) throw new Error(`回答の保存に失敗しました: ${error.message}`);

  const { data: word } = await supabaseAdmin
    .from("quiz_words")
    .select("meaning_ja, example_en, example_ja")
    .eq("id", wordIds[index])
    .maybeSingle();
  return {
    correct: choice === correctIndices[index],
    correctIndex: correctIndices[index],
    meaning: (word?.meaning_ja as string) ?? "",
    exampleEn: (word?.example_en as string | null) ?? null,
    exampleJa: (word?.example_ja as string | null) ?? null,
  };
}

export type NotebookResultItem = {
  word: string;
  meaning: string;
  exampleEn: string | null;
  exampleJa: string | null;
  correct: boolean;
};

export type NotebookRoundResult = {
  correctCount: number;
  total: number;
  boostDays: number;
  capped: boolean;
  items: NotebookResultItem[];
};

// 回答を採点し、進捗を更新して、正解数に応じた成長ブーストを(1日の上限内で)付与する。セッションは1回だけ使える。
export async function finishNotebookRound(
  userId: string,
  plan: Plan,
  sessionId: string,
): Promise<NotebookRoundResult | null> {
  const { data: session } = await supabaseAdmin
    .from("quiz_word_sessions")
    .update({ used_at: new Date().toISOString() })
    .eq("id", sessionId)
    .eq("user_id", userId)
    .is("used_at", null)
    .select("word_ids, correct_indices, answers, created_at")
    .maybeSingle();
  if (!session) return null;
  if (Date.now() - new Date(session.created_at as string).getTime() > SESSION_TTL_MS) return null;

  const wordIds = session.word_ids as string[];
  const correctIndices = session.correct_indices as number[];
  // 採点は、1問ごとにサーバーへ記録された回答で行う(未回答は不正解)。
  const answers = (session.answers as number[] | null) ?? [];

  const [{ data: wordRows }, { data: progressRows }] = await Promise.all([
    supabaseAdmin
      .from("quiz_words")
      .select("id, word_en, meaning_ja, example_en, example_ja, difficulty")
      .in("id", wordIds),
    supabaseAdmin
      .from("quiz_word_progress")
      .select("word_id, correct_count, wrong_count, last_result")
      .eq("user_id", userId)
      .in("word_id", wordIds),
  ]);
  const wordMap = new Map((wordRows ?? []).map((w) => [w.id as string, w]));
  const progressMap = new Map((progressRows ?? []).map((p) => [p.word_id as string, p]));

  let requested = 0;
  let correctCount = 0;
  const items: NotebookResultItem[] = [];
  const upserts: {
    user_id: string;
    word_id: string;
    correct_count: number;
    wrong_count: number;
    last_result: boolean;
    last_answered_at: string;
  }[] = [];
  const now = new Date().toISOString();

  wordIds.forEach((wordId, i) => {
    const word = wordMap.get(wordId);
    if (!word) return;
    const isCorrect = answers[i] === correctIndices[i];
    const prev = progressMap.get(wordId);
    if (isCorrect) {
      correctCount++;
      // 苦手倍率: 直近で間違えていた単語を正解し直したときだけ。間違いが2回以上なら2.0、1回なら1.5。
      let weak = 1;
      if (prev && prev.last_result === false) weak = (prev.wrong_count as number) >= 2 ? 2 : 1.5;
      requested += BASE_BOOST_PER_CORRECT[plan] * DIFFICULTY_MULTIPLIER[word.difficulty as NotebookDifficulty] * weak;
    }
    upserts.push({
      user_id: userId,
      word_id: wordId,
      correct_count: ((prev?.correct_count as number) ?? 0) + (isCorrect ? 1 : 0),
      wrong_count: ((prev?.wrong_count as number) ?? 0) + (isCorrect ? 0 : 1),
      last_result: isCorrect,
      last_answered_at: now,
    });
    items.push({
      word: word.word_en as string,
      meaning: word.meaning_ja as string,
      exampleEn: word.example_en as string | null,
      exampleJa: word.example_ja as string | null,
      correct: isCorrect,
    });
  });

  if (upserts.length > 0) {
    const { error } = await supabaseAdmin.from("quiz_word_progress").upsert(upserts, { onConflict: "user_id,word_id" });
    if (error) throw new Error(`進捗の保存に失敗しました: ${error.message}`);
  }

  let boostDays = 0;
  if (requested > 0) {
    const rounded = Math.round(requested * 10000) / 10000;
    const { data: granted, error } = await supabaseAdmin.rpc("reserve_quiz_word_boost", {
      p_user_id: userId,
      p_requested: rounded,
      p_cap: DAILY_BOOST_CAP[plan],
    });
    if (error) throw new Error(`ブーストの付与に失敗しました: ${error.message}`);
    boostDays = Number(granted ?? 0);
    if (boostDays > 0) await addGrowthBoost(userId, boostDays);
  }

  return {
    correctCount,
    total: items.length,
    boostDays,
    capped: requested > 0 && boostDays < requested - 1e-9,
    items,
  };
}

// ---- 単語一覧 ----
export type NotebookWordStatus = "mastered" | "weak" | "learning" | "unseen";
export const NOTEBOOK_WORD_STATUSES: NotebookWordStatus[] = ["mastered", "weak", "learning", "unseen"];
export const NOTEBOOK_WORD_POS = ["名詞", "動詞", "形容詞", "副詞", "その他"] as const;
export const NOTEBOOK_WORDS_PAGE_SIZE = 50;

export type NotebookWordItem = {
  id: string;
  word: string;
  pos: string | null;
  meaning: string;
  difficulty: number;
  status: NotebookWordStatus;
  exampleEn: string | null;
  exampleJa: string | null;
  otherMeanings: string[];
  note: string | null;
};

export function isNotebookWordStatus(value: unknown): value is NotebookWordStatus {
  return typeof value === "string" && (NOTEBOOK_WORD_STATUSES as string[]).includes(value);
}

// 絞り込み(難易度・状態・品詞)つきの単語一覧。状態はユーザーごとの進捗(quiz_word_progress)から決める。
export async function listNotebookWords(
  userId: string,
  filter: { difficulty?: NotebookDifficulty; status?: NotebookWordStatus; pos?: string; page?: number }
): Promise<{ items: NotebookWordItem[]; total: number; page: number; pageSize: number }> {
  let query = supabaseAdmin
    .from("quiz_words")
    .select("id, code, word_en, part_of_speech, meaning_ja, difficulty, example_en, example_ja, other_meanings_ja, note_ja")
    .eq("active", true)
    .eq("publish_status", "公開")
    .order("difficulty", { ascending: true })
    .order("code", { ascending: true })
    .limit(3000);
  if (filter.difficulty) query = query.eq("difficulty", filter.difficulty);
  if (filter.pos) {
    if (filter.pos === "その他") query = query.not("part_of_speech", "in", "(名詞,動詞,形容詞,副詞)");
    else query = query.eq("part_of_speech", filter.pos);
  }
  const { data, error } = await query;
  if (error) throw new Error(`単語の取得に失敗しました: ${error.message}`);

  const { data: progress, error: progressError } = await supabaseAdmin
    .from("quiz_word_progress")
    .select("word_id, last_result, correct_count")
    .eq("user_id", userId);
  if (progressError) throw new Error(`進捗の取得に失敗しました: ${progressError.message}`);
  const progressMap = new Map((progress ?? []).map((p) => [p.word_id as string, p]));

  const statusOf = (id: string): NotebookWordStatus => {
    const p = progressMap.get(id);
    if (!p) return "unseen";
    if (p.last_result === false) return "weak";
    if (p.last_result === true && (p.correct_count as number) >= MASTERED_CORRECT_COUNT) return "mastered";
    return "learning";
  };

  const all: NotebookWordItem[] = (data ?? []).map((w) => ({
    id: w.id as string,
    word: w.word_en as string,
    pos: (w.part_of_speech as string | null) ?? null,
    meaning: w.meaning_ja as string,
    difficulty: w.difficulty as number,
    status: statusOf(w.id as string),
    exampleEn: (w.example_en as string | null) ?? null,
    exampleJa: (w.example_ja as string | null) ?? null,
    otherMeanings: (w.other_meanings_ja as string[] | null) ?? [],
    note: (w.note_ja as string | null) ?? null,
  }));
  const filtered = filter.status ? all.filter((w) => w.status === filter.status) : all;
  const page = Math.max(1, Math.floor(filter.page ?? 1));
  const start = (page - 1) * NOTEBOOK_WORDS_PAGE_SIZE;
  return { items: filtered.slice(start, start + NOTEBOOK_WORDS_PAGE_SIZE), total: filtered.length, page, pageSize: NOTEBOOK_WORDS_PAGE_SIZE };
}
