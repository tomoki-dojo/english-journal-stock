// TOEIC演習（Part5形式クイズ）の型定義。
// vocabulary/typesと同様、_reference/toeic_practice_schema.sqlのスキーマに対応する。

export type ToeicQuizQuestion = {
  questionId: string;
  questionText: string;
  // 選択肢（出題のたびにシャッフル済み）。correctIndexが正解のインデックス。
  choices: string[];
  correctIndex: number;
  explanationJa: string;
  // 出題カテゴリ（Part5は文法項目名）。完了画面のタグ別正誤内訳に使う。
  skillTag: string;
};
