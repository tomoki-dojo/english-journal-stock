// src/lib/supabase/toeic-questions.ts
// TOEIC演習（Part5形式クイズ・Part6長文穴埋め）のコンテンツ取得。
import { supabaseAdmin } from "@/lib/supabase/server";
import type { ToeicQuizQuestion, ToeicPart6Passage } from "@/components/toeic/types";

const RANDOM_QUESTION_COUNT = 10;
const PART6_PASSAGE_COUNT = 3;

type DbToeicQuestionRow = {
  id: string;
  skill_tag: string;
  question_text: string;
  choices: string[];
  correct_index: number;
  explanation_ja: string;
};

type DbToeicPart6QuestionRow = DbToeicQuestionRow & {
  passage_id: string;
  order_in_passage: number;
};

type DbToeicPassageRow = {
  id: string;
  content_text: string;
};

function shuffleArray<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// 選択肢の並びをシャッフルし、正解のインデックスを付け替える。
// DB格納順のまま出題すると正解の位置に偏りが出るため、出題のたびにシャッフルする。
function shuffleChoices(choices: string[], correctIndex: number): { choices: string[]; correctIndex: number } {
  const correctChoice = choices[correctIndex];
  const shuffled = shuffleArray(choices);
  return { choices: shuffled, correctIndex: shuffled.indexOf(correctChoice) };
}

function toQuizQuestion(row: DbToeicQuestionRow): ToeicQuizQuestion {
  const { choices, correctIndex } = shuffleChoices(row.choices, row.correct_index);
  return {
    questionId: row.id,
    questionText: row.question_text,
    choices,
    correctIndex,
    explanationJa: row.explanation_ja,
    skillTag: row.skill_tag,
  };
}

// TOEIC演習（Part5）：公開済みの設問からランダムにlimit問出題する。
// 誰でも利用可能（Free/Pro問わず。弱点優先出題は診断機能の実装後にPro限定として追加する想定）。
export async function buildRandomToeicQuestions(limit = RANDOM_QUESTION_COUNT): Promise<ToeicQuizQuestion[]> {
  const { data, error } = await supabaseAdmin
    .from("toeic_questions")
    .select("id, skill_tag, question_text, choices, correct_index, explanation_ja")
    .eq("part", 5)
    .eq("publish_status", "公開");

  if (error) {
    throw new Error(`TOEIC設問の取得に失敗しました: ${error.message}`);
  }

  const rows = (data ?? []) as DbToeicQuestionRow[];
  const picked = shuffleArray(rows).slice(0, limit);

  return picked.map(toQuizQuestion);
}

// TOEIC演習（Part6）：公開済みの文書からランダムにpassageCount件出題する。
// 1文書=4設問固定（コンテンツ投入時にorder_in_passage 1〜4で必ず揃えている前提）。
// Part5と同様、誰でも利用可能（Free/Pro問わず）。
export async function buildRandomToeicPart6Passages(
  passageCount = PART6_PASSAGE_COUNT
): Promise<ToeicPart6Passage[]> {
  const { data: passageRows, error: passageError } = await supabaseAdmin
    .from("toeic_passages")
    .select("id, content_text")
    .eq("part", 6)
    .eq("publish_status", "公開");

  if (passageError) {
    throw new Error(`TOEIC長文素材の取得に失敗しました: ${passageError.message}`);
  }

  const passages = (passageRows ?? []) as DbToeicPassageRow[];
  const pickedPassages = shuffleArray(passages).slice(0, passageCount);
  if (pickedPassages.length === 0) return [];

  const { data: questionRows, error: questionError } = await supabaseAdmin
    .from("toeic_questions")
    .select("id, skill_tag, question_text, choices, correct_index, explanation_ja, passage_id, order_in_passage")
    .in(
      "passage_id",
      pickedPassages.map((p) => p.id)
    )
    .eq("publish_status", "公開");

  if (questionError) {
    throw new Error(`TOEIC設問の取得に失敗しました: ${questionError.message}`);
  }

  const questions = (questionRows ?? []) as DbToeicPart6QuestionRow[];

  return pickedPassages.map((passage) => {
    const passageQuestions = questions
      .filter((q) => q.passage_id === passage.id)
      .sort((a, b) => a.order_in_passage - b.order_in_passage)
      .map(toQuizQuestion);

    return {
      passageId: passage.id,
      contentText: passage.content_text,
      questions: passageQuestions,
    };
  });
}
