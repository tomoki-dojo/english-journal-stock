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

// 「あと何回で卒業か」を数字で見せない代わりの、見た目だけの習熟度カーブ（0=初見〜3=卒業間近）。
// UIでは色の濃さなど非数値の手がかりとして使う。
export type WarmthLevel = 0 | 1 | 2 | 3;

export function computeWarmth(streak: number, graduateStreak: number): WarmthLevel {
  if (streak <= 0) return 0;
  const level = Math.ceil((streak / graduateStreak) * 3);
  return Math.min(3, Math.max(0, level)) as WarmthLevel;
}

// アクティブセット（未卒業フレーズの先頭からN件）とラウンド（1回に出す問題数）のサイズ。
// 新しい状態は持たず、毎回動的に計算する。
export const STAGE1_ACTIVE_SET_SIZE = 7;
export const STAGE1_ROUND_SIZE = 5;

export type Stage1RoundQuestion = Stage1Phrase & { warmth: WarmthLevel };

export type Stage1RoundResponse =
  | {
      status: "round";
      questions: Stage1RoundQuestion[];
      remainingCount: number;
      totalCount: number;
    }
  | { status: "done"; totalCount: number };

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

// Stage2のアクティブセット（未卒業＆コンテンツありフレーズの先頭からN件）とラウンドのサイズ。
// Stage1と同じ規模。「7件に届くまではラウンドを出さない」を、初解放・補充後の再開の両方に
// 同じ条件として使う（同じような問題ばかりになる母数不足を防ぐため）。
export const STAGE2_ACTIVE_SET_SIZE = 7;
export const STAGE2_ROUND_SIZE = 5;

// Stage2内のサブ出題形式タグ。以前は「全文瞬間英作文」「文脈からの想起」が実装上まったく同じ
// 問題（見た目も同一の4択）だったため同じタグに集約していたが、後者を「状況文→表現を選ぶ」
// 形に差別化したため、タグも分けている。
export function getStage2SubFormatLabel(
  subStep: Stage2SubStep
): "穴埋め" | "瞬間英作文" | "文脈想起" | "微改変" {
  if (subStep === "穴埋め音読") return "穴埋め";
  if (subStep === "全文瞬間英作文") return "瞬間英作文";
  if (subStep === "文脈からの想起") return "文脈想起";
  return "微改変";
}

// Stage2は「声に出すこと」が全Stage共通の大前提（_reference/speaking-roadmap-design.md参照）。
// 以前は穴埋め音読・全文瞬間英作文・文脈からの想起の3ステップが「4択をクリックして正誤判定」する
// 学校のテストのような形式だったため、2026-09-09に「声に出す→答えを確認する→言えたか自己申告する」
// という産出中心の形に作り直した（kind: "produce"）。クリック式の選択肢正誤判定はもう無く、
// Stage1・微改変と同じく自己申告ベースになる。以前の選択肢データ(blank_choices/sentence_choices)は
// 答え合わせ画面の参考表示（似ているけど違う表現）として活用し、無駄にしない。
export type Stage2RoundQuestion =
  | {
      kind: "produce";
      subStep: Stage2SubStep;
      expressionId: string;
      meaningJa?: string;
      // 穴埋め音読のときだけ、空欄化した英文を入れる（それ以外のサブステップはundefined）
      promptEn?: string;
      // 全文瞬間英作文・文脈からの想起で表示する日本語の設問文。
      // 前者は直訳ヒント(meaningJa)、後者は状況説明文(context_prompt_ja、未入力ならmeaningJaに
      // フォールバック)が入る。両者の違いはコンテンツ側のデータであり、UIのロジックは共通。
      promptJa?: string;
      // 声に出した後、答え合わせで表示する正解の全文
      answerText: string;
      // 答え合わせ画面でだけ表示する「似ているけど違う表現」の参考リスト（answerTextは含まない）
      referenceChoices: string[];
      warmth: WarmthLevel;
    }
  | {
      kind: "free";
      subStep: Stage2SubStep;
      expressionId: string;
      expressionEn: string;
      meaningJa?: string;
      warmth: WarmthLevel;
    };

export type Stage2RoundResponse =
  | { status: "not_ready"; remainingToUnlock: number }
  | { status: "done"; totalCount: number }
  | {
      status: "round";
      questions: Stage2RoundQuestion[];
      remainingCount: number;
      totalCount: number;
    };

export type Stage2ReportResult = {
  streak: number;
  subStep: Stage2SubStep;
  graduated: boolean;
};
