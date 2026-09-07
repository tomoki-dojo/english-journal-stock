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
