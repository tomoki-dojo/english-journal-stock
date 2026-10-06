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
  // Pro限定のStageスキップ機能（#156、2026-09-14設計）。有効な間はStage2/3/4を
  // 箱庭地図・APIとも常に解放扱いにする（進捗データ自体は変更しない）。
  // proSkipStartStageは「どこから始めるか」選んだStage番号で、現在地ハイライト・
  // 遷移先表示にのみ使う（進捗を汚さないため解放範囲の判定には使わない）。
  proSkipEnabled: boolean;
  proSkipStartStage: 2 | 3 | 4 | null;
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

// Stage1で選べるシーン（expressions.scene_tagsの値）。日常会話5種→ビジネス7種の順。
export const STAGE1_SCENE_OPTIONS = [
  "買い物",
  "外食",
  "旅行",
  "友人",
  "体調",
  "会議",
  "メール",
  "交渉",
  "雑談",
  "電話",
  "プレゼン",
  "依頼・断り",
] as const;
export type Stage1Scene = (typeof STAGE1_SCENE_OPTIONS)[number];

export function parseStage1Scene(value: string | null | undefined): Stage1Scene | null {
  return (STAGE1_SCENE_OPTIONS as readonly string[]).includes(value ?? "") ? (value as Stage1Scene) : null;
}

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
      // 微改変のときだけ：変え方の見出し（「対象を変えて言う」など）ともとの表現
      variationLabel?: string;
      baseExpressionEn?: string;
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

// Stage3解放条件（2026-09-16改訂）：Stage1卒業フレーズの累計数がこの値に届くとStage3が開く。
// 以前は「Stage3の出題プールに1件でもあれば解放」（実質Stage1を1個卒業すれば即解放。
// Stage3の出題プール自体がStage1卒業フレーズから作られ、Stage2の進み具合とは無関係なため）
// という、Stage2解放（Stage1卒業7個）よりゆるい基準になってしまっていた。「全体の道のりが
// 数日で終わってしまう」という懸念（_reference/speaking-roadmap-design.md参照）を受け、
// Stage2解放の7個より明確に多い15個に引き上げる。卒業streak自体（STAGE1_GRADUATE_STREAK）は
// 上げず、「違う表現をどれだけ卒業したか」という本数側でペースを作る方針。
export const STAGE3_UNLOCK_STAGE1_GRADUATIONS = 15;

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
  | { status: "not_ready"; remainingToUnlock: number }
  | { status: "done"; totalCount: number }
  | { status: "limit_exceeded"; limit: number };

export type Stage3JudgeResult = {
  correct: boolean;
  // 検出されたエラータグ（Stage0のusage_rulesと同じ15種のerror_tagカタログに揃える）。
  // user_error_tag_statsへの集計に使う。
  errorTags: string[];
  feedbackJa: string;
  // 判定後に、入力した解答と並べて見せる模範解答
  modelAnswerEn: string;
  // ミニ拡張の1つ目の発話が通ったとき、相手（アーサー）の返答を見せて返事を促す
  // （streakはこの時点では動かさず、返事の判定で更新する）
  awaitingFollowUp?: boolean;
  partnerReplyEn?: string;
  partnerReplyJa?: string;
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
// 2026-09-16改訂：初期値2は他Stage（0/1/3=6, 2=8）と比べて明確な外れ値だった。
// 「失敗してもstreakは減らない」設計と合わせると実質2回成功すればいいだけで、5ターンの
// 音声会話という他Stageより重いフォーマットにもかかわらず卒業が早すぎた。3に引き上げる
// （他Stageの6〜8までは上げない。1本あたりの深追いより、解放条件側＝STAGE4_UNLOCK_STAGE3_
// GRADUATIONSで卒業本数の幅を稼ぐ方針のため）。
export const STAGE4_GRADUATE_STREAK = 3;

// Stage4解放条件（2026-09-16改訂）：Stage3卒業フレーズの累計数がこの値に届くとStage4が開く。
// 以前は「Stage3を1つでも卒業すれば解放」だった。STAGE3_UNLOCK_STAGE1_GRADUATIONSと同じ理由で、
// 「違う表現をどれだけ卒業したか」の本数側に引き上げる。
export const STAGE4_UNLOCK_STAGE3_GRADUATIONS = 6;

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

// ============================================================
// Stage5（上級ロールプレイ）
// 2026-09-15〜16設計（_reference/speaking-roadmap-design.md「Stage4・Stage5の役割分担の
// 再設計」「Stage5：スキーマ・解放ロジック設計」参照）。Stage4との違いは2点：
// (1) 上級（日常・ビジネスとも「不動産屋でアパートを借りる」「経営陣向けに企画を提案する」の
//     ような難しめのシーン）を扱う。
// (2) 日常編・ビジネス編が完全に独立したトラックで、それぞれ対応するドメインのStage4シナリオを
//     STAGE5_UNLOCK_STAGE4_GRADUATIONS本卒業して初めて解放される（「日常だけ極めたい人・
//     ビジネスだけ極めたい人」という2種類のユーザー像を反映）。
// 会話の仕組み自体（固定5ターン・最終ターンでAIが会話全体を評価・ステートレス・
// speaking_stage_progressの流用）はStage4をそのまま踏襲する。
export const STAGE5_TURN_COUNT = 5;

// Stage4(3)より一段上の卒業streak。他Stageの6〜8までは上げず、「本数」側
// （STAGE5_UNLOCK_STAGE4_GRADUATIONS）でペースを作る2026-09-16の方針を踏襲。
export const STAGE5_GRADUATE_STREAK = 4;

// Stage5解放条件：そのドメイン（日常 or ビジネス）のStage4シナリオをこの本数卒業すると、
// 対応するStage5のトラックが解放される。日常編・ビジネス編は独立に判定する
// （getStage5DomainReadiness参照）。
export const STAGE5_UNLOCK_STAGE4_GRADUATIONS = 5;

// Stage4と同じ理由（AI呼び出しコスト）で日次上限を設けるが、テーブル・カウンタはStage4とは
// 独立させる（stage5_usage。Stage4を使い切った日にStage5に手を出せなくなる、またはその逆が
// 起きると体験を損ねるため）。初期値はStage4と同じ数字を仮置きし、実運用を見て調整する。
export const STAGE5_FREE_DAILY_LIMIT = 3;
export const STAGE5_PRO_DAILY_LIMIT = 15;

export type Stage5Track = "daily" | "business";

export type Stage5Scenario = {
  id: string;
  code: string;
  track: Stage5Track;
  sceneTag: string;
  titleJa: string;
  situationJa: string;
  goalJa: string;
  openingLineEn: string;
  level: "中級" | "上級";
};

export type Stage5ScenarioListItem = Stage5Scenario & {
  status: "未着手" | "練習中" | "習得済み";
  warmth: WarmthLevel;
};

// ターンの型自体はStage4と全く同じ形だが、Stage4/Stage5は「同じ理由で分離している」という
// 既存方針（stage3/4のjudge-prompt分離コメント参照）に揃え、型も独立させておく。
export type Stage5Turn = { role: "ai" | "user"; text: string };

export type Stage5UsageInfo = { remaining: number; limit: number };

export type Stage5TurnRequest = {
  scenarioId: string;
  turnIndex: number;
  history: Stage5Turn[];
  userUtterance: string;
};

export type Stage5TurnResult = {
  aiReplyEn: string;
  turnIndex: number;
  sessionComplete: boolean;
  errorTags: string[];
  overallPass?: boolean;
  feedbackJa?: string;
  streak?: number;
  graduated?: boolean;
  usage: Stage5UsageInfo;
};

export type Stage5TurnOutcome =
  | { status: "ok"; result: Stage5TurnResult }
  | { status: "limit_exceeded"; limit: number }
  | { status: "error"; message: string };
