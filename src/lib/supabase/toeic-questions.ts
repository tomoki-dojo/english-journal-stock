// src/lib/supabase/toeic-questions.ts
// TOEIC演習（Part5形式クイズ）のコンテンツ取得。
import { supabaseAdmin } from "@/lib/supabase/server";
import type { ToeicQuizQuestion } from "@/components/toeic/types";

const RANDOM_QUESTION_COUNT = 10;

type DbToeicQuestionRow = {
  id: string;
  skill_tag: string;
  question_text: string;
  choices: string[];
  correct_index: number;
  explanation_ja: string;
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
