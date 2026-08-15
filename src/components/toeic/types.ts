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

// Part6（長文穴埋め）1文書ぶんのまとまり。1文書=4設問（toeic_questionsのorder_in_passage順）。
export type ToeicPart6Passage = {
  passageId: string;
  // 文書本文。空所は "(1) ______" のように番号付きの下線プレースホルダーで埋め込まれている。
  contentText: string;
  questions: ToeicQuizQuestion[];
};
