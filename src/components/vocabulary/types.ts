// _reference/vocabulary_schema.sql のCHECK制約に対応する値の定義。
// スキーマ側の値を変更したら、ここも合わせて更新すること。

export const PartOfSpeechValues = [
  "名詞",
  "動詞",
  "形容詞",
  "副詞",
  "フレーズ",
] as const;
export type PartOfSpeech = (typeof PartOfSpeechValues)[number];

export const VocabLevelValues = ["初級", "中級", "上級"] as const;
export type VocabLevel = (typeof VocabLevelValues)[number];

export const VocabVerificationStatusValues = [
  "AI生成のみ",
  "クロスチェック済み",
  "ネイティブ確認済み",
] as const;
export type VocabVerificationStatus = (typeof VocabVerificationStatusValues)[number];

export type VocabLevelFilter = VocabLevel | "すべて";

// 資格試験の頻出タグ。単語帳の絞り込みUIで使う（他は`examTags`型と同じくexpressions側にも定義あり）。
export const ExamTagValues = ["TOEIC"] as const;
export type ExamTag = (typeof ExamTagValues)[number];
export type ExamTagFilter = ExamTag | "すべて";

export type Vocabulary = {
  id: string;
  code: string;
  category: string;
  wordEn: string;
  partOfSpeech: PartOfSpeech;
  meaningJa: string;
  exampleEn?: string;
  exampleJa?: string;
  synonyms?: string[];
  // 専門分野タグ。現時点では未使用（一般語彙のみのため常にundefined）。
  // 将来「財務」「法務」などを追加する際の拡張軸として型だけ先に用意している。
  businessField?: string[];
  // 資格試験の頻出タグ（例: ["TOEIC"]）。category（単語/表現）とは独立した横断タグ。
  examTags?: string[];
  level: VocabLevel;
  usageNotes?: string;
  verificationStatus: VocabVerificationStatus;
  publishStatus: string;
  createdAt: string;
};

// 間隔反復（Leitner箱方式）の箱レベル。1〜5。
export type BoxLevel = 1 | 2 | 3 | 4 | 5;

// ユーザーごとの学習進捗（学習リストに追加した単語のみ存在する）
export type WordReviewProgress = {
  vocabularyId: string;
  boxLevel: BoxLevel;
  nextReviewDate: string; // YYYY-MM-DD
  correctStreak: number;
  totalReviews: number;
  lastResult: "correct" | "incorrect" | null;
};

// 学習リストに入っている単語 + 進捗をまとめたもの（一覧・ダッシュボード表示用）
export type LearningVocabulary = Vocabulary & {
  progress: WordReviewProgress;
};

// 出題方向。英語を見て意味を選ぶ（認識）か、意味を見て英語を選ぶ（想起・産出）か。
export type QuizDirection = "en-to-ja" | "ja-to-en";

export type QuizQuestion = {
  vocabularyId: string;
  direction: QuizDirection;
  prompt: string;
  // 選択肢（4つ、順序はシャッフル済み）。correctIndexが正解のインデックス。
  choices: string[];
  correctIndex: number;
};

export type QuizAnswerResult = {
  vocabularyId: string;
  correct: boolean;
  newBoxLevel: BoxLevel;
  nextReviewDate: string;
};
