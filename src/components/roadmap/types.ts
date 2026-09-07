// _reference/speaking_roadmap_schema.sql のCHECK制約に対応する値の定義。
// スキーマ側の値を変更したら、ここも合わせて更新すること。

export const OnboardingTrackValues = ["daily", "business"] as const;
export type OnboardingTrack = (typeof OnboardingTrackValues)[number];

export type RoadmapStage = 1 | 2 | 3 | 4 | 5;

// ユーザーごとのロードマップ全体の現在地・累計値（user_roadmap_stateに対応）。
export type UserRoadmapState = {
  currentStage: RoadmapStage;
  onboardingQuizCompleted: boolean;
  onboardingTrack: OnboardingTrack | null;
  totalMasteredCount: number;
};

// 会話クイズの回答。1〜3問目は3択の正誤判定、4問目はトラック選択、5問目は経験の自己申告。
export type OnboardingQuizExperience = "beginner" | "some" | "confident";

export type OnboardingQuizAnswers = {
  // 1〜3問目：正解した問題数（0〜3）
  correctCount: number;
  track: OnboardingTrack;
  experience: OnboardingQuizExperience;
};

export type OnboardingQuizResult = {
  startStage: RoadmapStage;
  track: OnboardingTrack;
};

// Stage1（音読・シャドーイング）の3サブステップ。correct_streakの値の範囲から導出する
// （0-1=リピーティング, 2-3=オーバーラッピング, 4-5=シャドーイング, 6=卒業）。
export const Stage1SubStepValues = ["リピーティング", "オーバーラッピング", "シャドーイング"] as const;
export type Stage1SubStep = (typeof Stage1SubStepValues)[number];

export const STAGE1_GRADUATE_STREAK = 6;

export function getStage1SubStep(streak: number): Stage1SubStep {
  if (streak >= 4) return "シャドーイング";
  if (streak >= 2) return "オーバーラッピング";
  return "リピーティング";
}

// Stage1で1問出題する対象フレーズ（今は表現のみ。単語は将来的な拡張候補）。
export type Stage1Phrase = {
  expressionId: string;
  expressionEn: string;
  meaningJa?: string;
  hasAudio: boolean;
};

export type Stage1NextResponse =
  | {
      done: false;
      phrase: Stage1Phrase;
      streak: number;
      subStep: Stage1SubStep;
      remainingCount: number;
      totalCount: number;
    }
  | { done: true; totalCount: number };

export type Stage1ReportResult = {
  streak: number;
  subStep: Stage1SubStep;
  graduated: boolean;
};

// Stage2（瞬間英作文）の4サブステップ。correct_streakの値の範囲から導出する
// （0-1=穴埋め音読, 2-3=全文瞬間英作文, 4-5=文脈からの想起, 6-7=微改変, 8=卒業）。
export const Stage2SubStepValues = [
  "穴埋め音読",
  "全文瞬間英作文",
  "文脈からの想起",
  "微改変",
] as const;
export type Stage2SubStep = (typeof Stage2SubStepValues)[number];

export const STAGE2_GRADUATE_STREAK = 8;

export function getStage2SubStep(streak: number): Stage2SubStep {
  if (streak >= 6) return "微改変";
  if (streak >= 4) return "文脈からの想起";
  if (streak >= 2) return "全文瞬間英作文";
  return "穴埋め音読";
}

export type Stage2NextResponse =
  | { status: "not_ready" }
  | { status: "done"; totalCount: number }
  | {
      status: "question";
      kind: "choice";
      subStep: Stage2SubStep;
      streak: number;
      expressionId: string;
      meaningJa?: string;
      // 穴埋め音読のときだけ、空欄化した英文を入れる（それ以外のサブステップはundefined）
      promptEn?: string;
      choices: string[];
      correctIndex: number;
      remainingCount: number;
      totalCount: number;
    }
  | {
      status: "question";
      kind: "free";
      subStep: Stage2SubStep;
      streak: number;
      expressionId: string;
      expressionEn: string;
      meaningJa?: string;
      remainingCount: number;
      totalCount: number;
    };

export type Stage2ReportResult = {
  streak: number;
  subStep: Stage2SubStep;
  graduated: boolean;
};
