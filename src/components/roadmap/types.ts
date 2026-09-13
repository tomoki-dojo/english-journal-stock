// _reference/speaking_roadmap_schema.sql のCHECK制約に対応する値の定義。
// スキーマ側の値を変更したら、ここも合わせて更新すること。

export const OnboardingTrackValues = ["daily", "business"] as const;
export type OnboardingTrack = (typeof OnboardingTrackValues)[number];

export type RoadmapStage = 1 | 2 | 3 | 4 | 5;

// usage_rules.error_tagのCHECK制約に対応する15種のエラータグカタログ。
// Stage0（使い分けパーツ）のコンテンツ分類だけでなく、Stage3以降のAI判定結果を
// 同じ体系のタグに寄せるためにも使う（user_error_tag_statsへの集計はタグ体系を揃えてこそ意味がある）。
export const ERROR_TAG_VALUES = [
  "冠詞",
  "可算・不可算",
  "前置詞",
  "句動詞",
  "語順・文構造",
  "時制の感覚差",
  "分詞形容詞",
  "単数・複数・三人称単数のs",
  "類義動詞",
  "依頼・提案の丁寧度",
  "婉曲・曖昧表現",
  "決まり文句・あいさつの誤用",
  "あいづち・リアクションのニュアンス",
  "否定疑問文への回答",
  "カタカナ英語・和製英語の罠",
] as const;
export type ErrorTag = (typeof ERROR_TAG_VALUES)[number];

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
  // この卒業が、まさにStage2の解放条件（アクティブセットがSTAGE2_ACTIVE_SET_SIZEに届く）を
  // 満たした瞬間だった場合にtrue。ラウンド結果画面での「Stage2が解放されました！」演出に使う。
  stage2JustUnlocked: boolean;
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

// 答え合わせ画面の参考表示1件分。穴埋め音読ではAIが生成した「なぜ不自然か」の理由(reasonJa)を
// 添える（stage2-choice-reasons.ts参照、フレーズごとに初回だけAI生成してDBにキャッシュする）。
// 全文瞬間英作文・文脈からの想起は「似た場面で使う他の表現」という参考表示であり間違いの指摘では
// ないため、reasonJaは空文字のまま使う（UI側はreasonJaが空なら理由行を出さない）。
export type Stage2ReferenceChoice = {
  text: string;
  reasonJa: string;
};

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
      // 答え合わせ画面でだけ表示する参考リスト（answerTextは含まない）。最大2件に絞る
      // （2026-09-11 実機フィードバック：3〜4件は多すぎる、本当に紛らわしいものだけでいい）。
      referenceChoices: Stage2ReferenceChoice[];
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

// Stage0（使い分けパーツ）：Stage1〜5の一本道とは別の、いつでも寄れる独立エリア（ゲートにはしない。
// _reference/speaking-roadmap-design.mdの「Stage0の位置づけ」参照）。
// 「日本語の感覚のまま英語にすると事故る使い分けポイント」（例：可算名詞は単数のまま裸で使えない）を
// 1つの「感覚」（usage_rule）として扱い、語彙を変えた出題文（usage_rule_prompts）を繰り返しぶつける。
// 1フレーズを覚えて卒業ではなく、同じ感覚に対する複数パターンで安定して「言えた」が続くまでを
// 卒業条件とする。答え合わせのタイミングで、自己申告の正誤に関係なく毎回核イメージの解説
// （coreImageJa）を出す（テスト効果を狙い、先に解説は読ませない。自己申告はstreak判定にのみ使う）。
export const STAGE0_GRADUATE_STREAK = 6;
export const STAGE0_ACTIVE_SET_SIZE = 7;
export const STAGE0_ROUND_SIZE = 5;

export type Stage0RoundQuestion = {
  usageRuleId: string;
  errorTag: string;
  title: string;
  // ラウンド生成時にそのruleに紐づくprompt群からランダムに1件選んだもの。
  promptJa: string;
  answerEn: string;
  // 「言えなかった」を選んだときだけUIで表示する。先には見せない。
  coreImageJa: string;
  warmth: WarmthLevel;
};

export type Stage0RoundResponse =
  | {
      status: "round";
      questions: Stage0RoundQuestion[];
      remainingCount: number;
      totalCount: number;
    }
  | { status: "done"; totalCount: number };

export type Stage0ReportResult = {
  streak: number;
  graduated: boolean;
};

// ============================================================
// Stage3（型を崩して自分の言葉で言う）
// Stage1・2は「表現を増やして繰り返す」量稽古のためラウンド（まとめて5問）が合っていたが、
// Stage3は「実際にアウトプットする」質重視の練習であり、かつ1問ごとにAI判定（課金対象の
// API呼び出し）が発生する。そのため「ラウンドで複数問まとめて出す」設計をやめ、1回のAI判定＝
// 1回の本番の発話として扱う（2026-09-10 ユーザーとの設計議論で決定）。アクティブセットの
// 先頭にある表現1件について、現在のサブステップの問題を都度1問だけ返す。
// Stage1・2は自己申告（言えた/言えなかった）でstreakを進めるが、Stage3は「意味が伝わって
// いるか」を自分では判断しづらいため、AIの判定結果がそのままstreak進行のトリガーになる。
export const Stage3SubStepValues = ["ヒント付き言い換え", "自由言い換え", "ミニ拡張"] as const;
export type Stage3SubStep = (typeof Stage3SubStepValues)[number];

// correct_streakの値の範囲から導出する（0-1=ヒント付き言い換え, 2-3=自由言い換え,
// 4-5=ミニ拡張, 6=卒業）。Stage1と同じ「各段階連続2回」パターン。
export const STAGE3_GRADUATE_STREAK = 6;
export const STAGE3_ACTIVE_SET_SIZE = 7;

export function getStage3SubStep(streak: number): Stage3SubStep {
  if (streak >= 4) return "ミニ拡張";
  if (streak >= 2) return "自由言い換え";
  return "ヒント付き言い換え";
}

// 1日のAI判定利用回数の上限。実コストはごく僅か（1回0.02円未満）なので原価防衛が目的ではなく、
// 「体験してから制限にぶつかって課金する」フリーミアム導線として意図的に設ける
// （_reference/speaking-roadmap-design.md「収益設計（Stage3〜5）」参照）。
export const STAGE3_FREE_DAILY_LIMIT = 8;
export const STAGE3_PRO_DAILY_LIMIT = 50;

export type Stage3Question = {
  expressionId: string;
  subStep: Stage3SubStep;
  meaningJa?: string;
  // 「ヒント付き言い換え」のときだけ、重要な語句を空欄にしたヒント文を見せる
  // （自由言い換え・ミニ拡張では隠す）。以前は正解の全文をそのまま見せていたが、
  // 一字一句読み上げるだけで通ってしまうため、2026-09-13に穴埋め形式へ変更した
  // （stage3-hint-blank.ts参照。expressions.stage3_hint_blank_enに初回生成分をキャッシュ）。
  hintExpressionEn?: string;
  warmth: WarmthLevel;
};

export type Stage3UsageInfo = { remaining: number; limit: number };

export type Stage3SessionResponse =
  | { status: "session"; question: Stage3Question; usage: Stage3UsageInfo }
  | { status: "done"; totalCount: number }
  | { status: "limit_exceeded"; limit: number };

export type Stage3JudgeResult = {
  correct: boolean;
  // 検出されたエラータグ（Stage0のusage_rulesと同じ15種のerror_tagカタログに揃える）。
  // user_error_tag_statsへの集計に使う。
  errorTags: string[];
  feedbackJa: string;
  streak: number;
  subStep: Stage3SubStep;
  graduated: boolean;
  usage: Stage3UsageInfo;
};

// ============================================================
// Stage4（AIロールプレイ）
// 2026-09-12 設計（_reference/speaking-roadmap-design.md参照）。Stage1〜3と違い、追跡単位が
// 「フレーズ単位」から「会話セッション単位」に変わる。コンテンツはStage1〜3のような
// アクティブセット方式（表現プールから動的に出題）ではなく、固定シナリオ（stage4_scenarios）を
// あらかじめ用意し、ユーザーがシーンを選んで会話する方式（ユーザーとの議論で決定：
// AIによる動的生成は会話の質・一貫性がブレやすいため見送った）。
//
// 1回のセッションは固定5ターン（ユーザー発話5回）で終了し、最終ターンでAIが会話全体を評価する。
// 卒業条件はStage1〜3のstreak方式を踏襲しつつ「シナリオ別に卒業」する（累計セッション数ではない。
// 「このシナリオはもう話せるようになった」という達成感を個別に出せるほうを採用）。
// speaking_stage_progressをphrase_source='stage4_scenario', stage=4として流用し、
// 新規の進捗テーブルは作らない。
//
// Stage3同様、発話テキスト・会話ログそのものはDBに保存しない。サーバーは各ターンのリクエストで
// それまでの会話履歴(history)を受け取って都度AIに渡すだけの完全ステートレス設計にし、
// セッション用の永続テーブルを持たない（プライバシー配慮とシンプルさの両立）。
export const STAGE4_TURN_COUNT = 5;
export const STAGE4_GRADUATE_STREAK = 2;

// 1日のセッション開始回数の上限。Stage3が「1回の発話judge」単位でFree=8/Pro=50だったのに対し、
// Stage4は「5ターン会話1本」が1回分のコスト単位になる（design doc概算で約0.06円/セッション、
// Stage3の1回0.02円の3倍程度）ため、セッション単位で少なめの回数に設定する。実コストは誤差
// レベルのため原価防衛ではなく体験設計上の数字であり、Stage3同様ユーザーの様子を見て調整する
// 前提（Stage3も2→5→8回と実際に調整した経緯がある）。
export const STAGE4_FREE_DAILY_LIMIT = 3;
export const STAGE4_PRO_DAILY_LIMIT = 15;

export type Stage4Scenario = {
  id: string;
  code: string;
  sceneTag: string;
  titleJa: string;
  situationJa: string;
  goalJa: string;
  openingLineEn: string;
  level: "初級" | "中級" | "上級";
};

// シナリオ選択画面用。習熟度はStage1〜3と同じくwarmthで非数値表現する。
export type Stage4ScenarioListItem = Stage4Scenario & {
  status: "未着手" | "練習中" | "習得済み";
  warmth: WarmthLevel;
};

export type Stage4Turn = { role: "ai" | "user"; text: string };

export type Stage4UsageInfo = { remaining: number; limit: number };

export type Stage4TurnRequest = {
  scenarioId: string;
  // 1始まり。1ならセッション開始（日次利用回数を消費）、STAGE4_TURN_COUNTなら最終ターン
  // （セッション全体の合否判定も行う）。
  turnIndex: number;
  // それまでの会話履歴（AIの冒頭発話を含む、直近のuserUtteranceは含まない）。
  // サーバーはこれを都度受け取るだけでDBには保存しない。
  history: Stage4Turn[];
  userUtterance: string;
};

export type Stage4TurnResult = {
  aiReplyEn: string;
  turnIndex: number;
  sessionComplete: boolean;
  errorTags: string[];
  // 最終ターンのみ値が入る
  overallPass?: boolean;
  feedbackJa?: string;
  streak?: number;
  graduated?: boolean;
  usage: Stage4UsageInfo;
};

export type Stage4TurnOutcome =
  | { status: "ok"; result: Stage4TurnResult }
  | { status: "limit_exceeded"; limit: number }
  | { status: "error"; message: string };
