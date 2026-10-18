// 「単語ノート」(部屋の入口から遊ぶ単語4択クイズ)のサーバー側。
// 出題と正解はサーバーで保持・採点し、クライアントの申告は信用しない。
// 流れ: startNotebookRound(問題を発行・正解はDBに保存) → 10問に回答 → finishNotebookRound(採点・進捗更新・成長ブースト付与)
import { supabaseAdmin } from "@/lib/supabase/server";
import { addGrowthBoost } from "@/lib/supabase/kuwagata";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { ttlCached } from "@/lib/ttl-cache";
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

// 苦手な単語の集合: 手動で入れた単語(先)と、直近で間違えた単語(新しい順)。
async function loadWeakWordIds(userId: string): Promise<{ flagged: string[]; wrong: string[] }> {
  const [{ data: flagRows }, { data: progress }] = await Promise.all([
    supabaseAdmin.from("quiz_word_weak_flags").select("word_id").eq("user_id", userId),
    supabaseAdmin
      .from("quiz_word_progress")
      .select("word_id, last_answered_at")
      .eq("user_id", userId)
      .eq("last_result", false)
      .order("last_answered_at", { ascending: false }),
  ]);
  return {
    flagged: (flagRows ?? []).map((f) => f.word_id as string),
    wrong: (progress ?? []).map((p) => p.word_id as string),
  };
}

// 苦手機能の無料枠。手動で苦手に入れられる語数と、苦手テストの1日の回数(Proは無制限)。
export const WEAK_FLAG_FREE_LIMIT = 10;
export const WEAK_TEST_FREE_DAILY_LIMIT = 2;

export class WeakLimitError extends Error {
  constructor(public kind: "flag" | "test", message: string) {
    super(message);
  }
}

function jstDay(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

async function countManualFlags(userId: string): Promise<number> {
  const { count } = await supabaseAdmin
    .from("quiz_word_weak_flags")
    .select("word_id", { count: "exact", head: true })
    .eq("user_id", userId);
  return count ?? 0;
}

async function getWeakTestsToday(userId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from("quiz_weak_test_usage")
    .select("test_count")
    .eq("user_id", userId)
    .eq("day_key", jstDay())
    .maybeSingle();
  return Number(data?.test_count ?? 0);
}

// 苦手機能の現在の使用状況(上限nullは無制限)。
export async function getWeakStatus(userId: string, plan: Plan) {
  const isFree = plan === "free";
  const [count, flagCount, testsToday] = await Promise.all([
    countWeakWords(userId),
    countManualFlags(userId),
    getWeakTestsToday(userId),
  ]);
  return {
    count,
    flagCount,
    flagLimit: isFree ? WEAK_FLAG_FREE_LIMIT : null,
    testsToday,
    testLimit: isFree ? WEAK_TEST_FREE_DAILY_LIMIT : null,
  };
}

// 手動で苦手に入れる前の上限チェック(すでに入っている語の再登録は通す)。
export async function assertCanFlagWord(userId: string, plan: Plan, wordId: string): Promise<void> {
  if (plan !== "free") return;
  const { data } = await supabaseAdmin
    .from("quiz_word_weak_flags")
    .select("word_id")
    .eq("user_id", userId)
    .eq("word_id", wordId)
    .maybeSingle();
  if (data) return;
  if ((await countManualFlags(userId)) >= WEAK_FLAG_FREE_LIMIT) {
    throw new WeakLimitError("flag", `苦手登録は${WEAK_FLAG_FREE_LIMIT}語までです`);
  }
}

// 苦手テストで出題できる単語の数(重複を除く)。
export async function countWeakWords(userId: string): Promise<number> {
  const { flagged, wrong } = await loadWeakWordIds(userId);
  const ids = Array.from(new Set([...flagged, ...wrong]));
  if (ids.length === 0) return 0;
  // クイズに出さない語(辞書専用)は数えない
  const { data } = await supabaseAdmin.from("quiz_words").select("id").in("id", ids).eq("quiz_enabled", true);
  return (data ?? []).length;
}

// 難易度ごとのクイズ対象単語(全ユーザー共通のマスタ)。毎ラウンド数百〜千行を取り直さないよう、メモリに5分持つ。
// 返した配列は共有されるので、呼び出し側では書き換えない(filter・コピーしてから並べ替える)。
const listQuizWordsByDifficulty = ttlCached(
  5 * 60 * 1000,
  (difficulty: NotebookDifficulty, columns: string) =>
    fetchAllRows<WordRow>((from, to) =>
      supabaseAdmin
        .from("quiz_words")
        .select(columns)
        .eq("active", true)
        .eq("publish_status", "公開")
        .eq("quiz_enabled", true)
        .eq("difficulty", difficulty)
        .order("code", { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: WordRow[] | null; error: { message: string } | null }>
    ).catch((e: Error) => {
      throw new Error(`単語の取得に失敗しました: ${e.message}`);
    })
);

// target が "weak" のときは、難易度を問わず苦手な単語だけで出題する(苦手テスト)。
export async function startNotebookRound(
  userId: string,
  target: NotebookDifficulty | "weak",
  plan: Plan = "free"
): Promise<{ sessionId: string; questions: NotebookQuestion[] }> {
  const isWeakTest = target === "weak";
  if (isWeakTest && plan === "free" && (await getWeakTestsToday(userId)) >= WEAK_TEST_FREE_DAILY_LIMIT) {
    throw new WeakLimitError("test", `今日の苦手テストは${WEAK_TEST_FREE_DAILY_LIMIT}回までです`);
  }
  const WORD_COLUMNS =
    "id, word_en, part_of_speech, meaning_ja, example_en, example_ja, difficulty, distractors_ja, other_meanings_ja";
  type ProgressRow = { word_id: string; last_result: boolean | null; last_answered_at: string | null; correct_count: number };
  let words: WordRow[];
  let progress: ProgressRow[] = [];
  let weakSource: { flagged: string[]; wrong: string[] };
  if (isWeakTest) {
    // 苦手テストは、苦手な単語と選択肢の候補(ランダム数十語)だけをDBから取る。全単語は取らない。
    weakSource = await loadWeakWordIds(userId);
    const candidateIds = Array.from(new Set([...weakSource.flagged, ...weakSource.wrong])).slice(0, 300);
    const [weakRes, poolRes] = await Promise.all([
      candidateIds.length > 0
        ? supabaseAdmin.from("quiz_words").select(WORD_COLUMNS).in("id", candidateIds).eq("quiz_enabled", true)
        : Promise.resolve({ data: [] as WordRow[], error: null }),
      supabaseAdmin.rpc("get_random_quiz_words", { p_limit: 60 }),
    ]);
    if (weakRes.error) throw new Error(`単語の取得に失敗しました: ${weakRes.error.message}`);
    if (poolRes.error) throw new Error(`単語の取得に失敗しました: ${poolRes.error.message}`);
    const merged = new Map<string, WordRow>();
    for (const w of [...((weakRes.data ?? []) as WordRow[]), ...((poolRes.data ?? []) as WordRow[])]) merged.set(w.id, w);
    words = Array.from(merged.values());
  } else {
    // 難易度ごとの単語・進捗・苦手を同時に取る(待ち時間を重ねないため)。
    const [wordsResult, progressRes, weak] = await Promise.all([
      listQuizWordsByDifficulty(target, WORD_COLUMNS),
      supabaseAdmin
        .from("quiz_word_progress")
        .select("word_id, last_result, last_answered_at, correct_count")
        .eq("user_id", userId),
      loadWeakWordIds(userId),
    ]);
    if (progressRes.error) throw new Error(`進捗の取得に失敗しました: ${progressRes.error.message}`);
    words = wordsResult;
    progress = (progressRes.data ?? []) as ProgressRow[];
    weakSource = weak;
  }
  if (words.length < CHOICE_COUNT) throw new Error("単語が足りません");
  const byId = new Map(words.map((w) => [w.id, w]));

  const seen = new Set((progress ?? []).map((p) => p.word_id as string));
  const masteredIds = new Set(
    (progress ?? [])
      .filter((p) => p.last_result === true && (p.correct_count as number) >= MASTERED_CORRECT_COUNT)
      .map((p) => p.word_id as string)
  );
  const answeredAt = new Map((progress ?? []).map((p) => [p.word_id as string, String(p.last_answered_at)]));

  // 苦手(直近で間違えた)単語を新しい順に、この難易度の分だけ最大WEAK_QUESTION_COUNT問。
  // 手動で苦手に入れた単語を先に、続けて直近で間違えた単語を新しい順に。
  const flaggedIds = shuffle(weakSource.flagged.filter((id) => byId.has(id)));
  const wrongIds = weakSource.wrong.filter((id) => byId.has(id));
  const weakLimit = isWeakTest ? NOTEBOOK_QUESTION_COUNT : WEAK_QUESTION_COUNT;
  const weakIds = Array.from(new Set([...flaggedIds, ...wrongIds])).slice(0, weakLimit);
  if (isWeakTest && weakIds.length === 0) throw new Error("苦手な単語がありません");
  const weakWords = weakIds.map((id) => byId.get(id)!);

  // 残りは未出題の単語から。足りなければ出題済みの単語から補う。
  const weakSet = new Set(weakIds);
  const unseen = shuffle(words.filter((w) => !seen.has(w.id) && !weakSet.has(w.id)));
  // 苦手テストは苦手な単語だけで出す(10問に満たなくてもそのまま)。
  const restNeeded = isWeakTest ? 0 : NOTEBOOK_QUESTION_COUNT - weakWords.length;
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
    .insert({ user_id: userId, word_ids: picked.map((w) => w.id), correct_indices: correctIndices, is_weak_test: isWeakTest })
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

  // 回答の保存と、答え合わせに出す単語の取得は互いに依存しないので同時に行う。
  const [{ error }, { data: word }] = await Promise.all([
    supabaseAdmin
      .from("quiz_word_sessions")
      .update({ answers: [...answers, choice] })
      .eq("id", sessionId)
      .eq("user_id", userId)
      .is("used_at", null),
    supabaseAdmin.from("quiz_words").select("meaning_ja, example_en, example_ja").eq("id", wordIds[index]).maybeSingle(),
  ]);
  if (error) throw new Error(`回答の保存に失敗しました: ${error.message}`);
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
    .select("word_ids, correct_indices, answers, created_at, is_weak_test")
    .maybeSingle();
  if (!session) return null;
  if (Date.now() - new Date(session.created_at as string).getTime() > SESSION_TTL_MS) return null;

  // 苦手テストは、最後まで終えた回だけ1日の回数に数える。
  // 採点用の取得と並行して進める(互いに依存しない)。
  const weakUsageDone: Promise<unknown> = session.is_weak_test
    ? getWeakTestsToday(userId).then((used) =>
        supabaseAdmin
          .from("quiz_weak_test_usage")
          .upsert({ user_id: userId, day_key: jstDay(), test_count: used + 1 }, { onConflict: "user_id,day_key" })
      )
    : Promise.resolve();

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

  // 進捗の保存・苦手フラグの解除・ブーストの予約・苦手テスト回数の記録は互いに依存しないので同時に行う。
  const saveProgress = async () => {
    if (upserts.length === 0) return;
    const { error } = await supabaseAdmin.from("quiz_word_progress").upsert(upserts, { onConflict: "user_id,word_id" });
    if (error) throw new Error(`進捗の保存に失敗しました: ${error.message}`);
  };

  // 手動で苦手に入れていた単語は、クイズで正解したら外れる。
  const clearFlags = async () => {
    const correctWordIds = upserts.filter((u) => u.last_result).map((u) => u.word_id);
    if (correctWordIds.length === 0) return;
    await supabaseAdmin.from("quiz_word_weak_flags").delete().eq("user_id", userId).in("word_id", correctWordIds);
  };

  const grantBoost = async (): Promise<number> => {
    if (requested <= 0) return 0;
    const rounded = Math.round(requested * 10000) / 10000;
    const { data: granted, error } = await supabaseAdmin.rpc("reserve_quiz_word_boost", {
      p_user_id: userId,
      p_requested: rounded,
      p_cap: DAILY_BOOST_CAP[plan],
    });
    if (error) throw new Error(`ブーストの付与に失敗しました: ${error.message}`);
    const days = Number(granted ?? 0);
    if (days > 0) await addGrowthBoost(userId, days);
    return days;
  };

  const [, , , boostDays] = await Promise.all([saveProgress(), clearFlags(), weakUsageDone, grantBoost()]);

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
  flagged: boolean;
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
  type ListRow = {
    id: string;
    code: string;
    word_en: string;
    part_of_speech: string | null;
    meaning_ja: string;
    difficulty: number;
    example_en: string | null;
    example_ja: string | null;
    other_meanings_ja: string[] | null;
    note_ja: string | null;
  };
  let data: ListRow[];
  try {
    data = await fetchAllRows<ListRow>((from, to) => {
      let query = supabaseAdmin
        .from("quiz_words")
        .select("id, code, word_en, part_of_speech, meaning_ja, difficulty, example_en, example_ja, other_meanings_ja, note_ja")
        .eq("active", true)
        .eq("publish_status", "公開")
        .eq("quiz_enabled", true);
      if (filter.difficulty) query = query.eq("difficulty", filter.difficulty);
      if (filter.pos) {
        if (filter.pos === "その他") query = query.not("part_of_speech", "in", "(名詞,動詞,形容詞,副詞)");
        else query = query.eq("part_of_speech", filter.pos);
      }
      return query
        .order("difficulty", { ascending: true })
        .order("code", { ascending: true })
        .range(from, to) as unknown as PromiseLike<{ data: ListRow[] | null; error: { message: string } | null }>;
    });
  } catch (e) {
    throw new Error(`単語の取得に失敗しました: ${(e as Error).message}`);
  }

  const { data: progress, error: progressError } = await supabaseAdmin
    .from("quiz_word_progress")
    .select("word_id, last_result, correct_count")
    .eq("user_id", userId);
  if (progressError) throw new Error(`進捗の取得に失敗しました: ${progressError.message}`);
  const progressMap = new Map((progress ?? []).map((p) => [p.word_id as string, p]));

  const { data: flagRows, error: flagError } = await supabaseAdmin
    .from("quiz_word_weak_flags")
    .select("word_id")
    .eq("user_id", userId);
  if (flagError) throw new Error(`苦手の取得に失敗しました: ${flagError.message}`);
  const flagged = new Set((flagRows ?? []).map((f) => f.word_id as string));

  const statusOf = (id: string): NotebookWordStatus => {
    if (flagged.has(id)) return "weak";
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
    flagged: flagged.has(w.id as string),
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
