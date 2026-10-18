// クワガタ育成機能（棚・図鑑）のデータアクセス層。
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPlan } from "@/lib/supabase/profile";
import { ttlCached } from "@/lib/ttl-cache";
import { describeEggEvent, type RoadmapStageUp } from "@/lib/roadmap-notices";

export type KuwagataAreaCode = "area1" | "area2" | "area3" | "area4" | "area5" | "aquarium" | "ancient";

export const KUWAGATA_AREA_ORDER: KuwagataAreaCode[] = ["area1", "area2", "area3", "area4", "area5"];

// エリア解放条件：「対応するStageの解放」かつ「前エリアの新種をこの数だけ発見」。
// 前エリアの新種数がこれより少ない場合（Freeの絞り込み後など）は、その総数で足りる。
export const AREA_UNLOCK_PREV_AREA_NEW_SPECIES = 3;

// 新種が1種もDBに入っていないエリア（エリア5の準備中など）は、解放条件を満たしても出さない。
function isAreaReleased(species: KuwagataSpecies[], areaCode: KuwagataAreaCode): boolean {
  if (areaCode === "area1") return true;
  return species.some((s) => s.kind === "new" && s.areaCode === areaCode);
}

export const AQUARIUM_AREA_CODE: KuwagataAreaCode = "aquarium";

// Pro限定の古代の森。水の底(aquarium)と同じく、本編の解放の連鎖には含めず、Pro会員には常に解放済み。
export const ANCIENT_AREA_CODE: KuwagataAreaCode = "ancient";

// Pro会員にだけ、新種が公開されている間は常に出す独立枠のエリア。
const PRO_ONLY_AREA_CODES: KuwagataAreaCode[] = [AQUARIUM_AREA_CODE, ANCIENT_AREA_CODE];

const AREA_KNOWN_SPECIES_STAGE_TRIGGER: Partial<Record<KuwagataAreaCode, number>> = {
  area1: 1,
  area2: 2,
  area3: 3,
  area4: 4,
};

export const KUWAGATA_MASTERED_COUNT_ROLL_INTERVAL = 10;

export const KUWAGATA_MASTERED_COUNT_ROLL_INTERVAL_PRO = KUWAGATA_MASTERED_COUNT_ROLL_INTERVAL / 2;

export const KUWAGATA_RARE_GUARANTEE_MILESTONE = 50;

export const FREE_SHELF_NEW_SPECIES_TANK_CAP = 10;

// 野生で採集した個体のサイズは、種類の基準サイズ（base_size）の±10%でばらつかせる。
const WILD_SIZE_VARIANCE = 0.1;

export const MANDIBLE_VARIANT_COUNT = 3;

export type KuwagataRarity = "コモン" | "レア" | "激レア";

export const KUWAGATA_RARITY_WEIGHT: Record<KuwagataRarity, number> = {
  コモン: 70,
  レア: 25,
  激レア: 5,
};

export type KuwagataSpecies = {
  id: string;
  code: string;
  name: string;
  kind: "known" | "new";
  areaCode: KuwagataAreaCode | null;
  stageTrigger: number | null;
  flavorTextJa: string | null;
  sortOrder: number;
  rarity: KuwagataRarity;
  minPlan: "free" | "pro";
  // 種類ごとの基準サイズ（個体のsize_scaleの元。タマゴから育てた個体はこの値、野生の個体は±10%ばらつく）。
  baseSize: number;
};

export type KuwagataIndividual = {
  id: string;
  speciesId: string;
  speciesCode: string;
  speciesName: string;
  speciesKind: "known" | "new";
  speciesRarity: KuwagataRarity;
  speciesAreaCode: KuwagataAreaCode | null;
  // stage_clear: Stage解放・サインアップ時の確定入手 / roll: 野生の採集 / event: 練習日数・習得数の節目のタマゴ
  obtainedVia: "stage_clear" | "roll" | "event";
  obtainedAt: string;
  sizeScale: number;
  mandibleVariant: number;
  hatchedAt: string | null;
  // 練習のご褒美で加算された成長日数（経過日数に足して成長段階を決める）。
  boostDays: number;
  // ログイン時の豆知識のご褒美で加算された成長日数（練習のブーストとは別に持ち、ゲージを色分けする）。
  loginBoostDays: number;
  // 成虫になってから練習で貯めた成長ポイント（サイズレベルの元。成虫のみ加算される）。
  sizeGrowthPoints: number;
  // レベルアップを見せ終えた最後のサイズレベル。
  sizeLevelSeen: number;
  // 「成長した！」の演出を見せ終えた最後の成長段階。
  stageSeen: KuwagataGrowthStage;
  // ユーザーが付けた名前(未命名はnull)。
  nickname: string | null;
};

export type KuwagataAreaProgress = {
  areaCode: KuwagataAreaCode;
  unlocked: boolean;
  discoveredNewSpeciesCount: number;
  totalNewSpeciesCount: number;
};

export type KuwagataGrowthStage = "卵" | "幼虫" | "蛹" | "成虫";

// 各段階の日数の範囲（経過日数＋ブースト日数がこの範囲にある間、その段階）。
const GROWTH_STAGE_RANGES: { stage: KuwagataGrowthStage; start: number; end: number }[] = [
  { stage: "卵", start: 0, end: 1 },
  { stage: "幼虫", start: 1, end: 4 },
  { stage: "蛹", start: 4, end: 7 },
];

// 習得済み（卒業）1回あたりのブースト日数。Freeの1日の上限（Stage3は8回、Stage4は3回）でも
// 1日に卒業できる数が限られるため、難しいStageほど大きくする。Stage5は卒業で即成虫なので対象外。
export const KUWAGATA_GRADUATION_BOOST_DAYS: Record<0 | 1 | 2 | 3 | 4, number> = {
  0: 0.05,
  1: 0.05,
  2: 0.1,
  3: 0.2,
  4: 0.4,
};

// 1日1回、ログイン時の豆知識を読んだときのご褒美（練習1回分の半分以下）。
export const KUWAGATA_LOGIN_BOOST_DAYS = 0.1;

// 成虫の成長（大きさ）。成虫になった個体は、卒業のご褒美（成長日数と同じ重み）を成長ポイントとして
// 貯め、5段階のサイズレベルで大きくなる。レベルごとに+6%（Lv5で+30%）を元のsize_scaleに掛ける
// （テッペンクワたんの野生の最大個体 1.32×1.3＝約1.72倍が最大）。閾値は初期値で、運用しながら調整する。
export const SIZE_LEVEL_THRESHOLDS = [1, 3, 6, 10, 15];
export const SIZE_LEVEL_STEP = 0.06;
export const SIZE_LEVEL_MAX = SIZE_LEVEL_THRESHOLDS.length;

export function getSizeLevel(points: number): number {
  return SIZE_LEVEL_THRESHOLDS.filter((threshold) => points >= threshold).length;
}

// 現在のレベル内での進み具合（0〜1）。最大レベルは満タン。
export function getSizeLevelRatio(points: number): number {
  const level = getSizeLevel(points);
  if (level >= SIZE_LEVEL_MAX) return 1;
  const start = level === 0 ? 0 : SIZE_LEVEL_THRESHOLDS[level - 1];
  const end = SIZE_LEVEL_THRESHOLDS[level];
  return Math.min(Math.max((points - start) / (end - start), 0), 1);
}

export function getDisplaySizeScale(sizeScale: number, level: number): number {
  return sizeScale * (1 + SIZE_LEVEL_STEP * level);
}

// テッペンクワたんは、日数がたっても蛹で止まる。成虫になるのはStage5を卒業して羽化したとき
// （hatched_atが立つとき）だけ。
export const TEPPEN_SPECIES_CODE = "KW-0004";

type GrowthInput = {
  obtainedAt: string;
  hatchedAt: string | null;
  boostDays: number;
  loginBoostDays: number;
  speciesCode: string;
};

function getElapsedDays(individual: GrowthInput): number {
  return Math.max(0, (Date.now() - new Date(individual.obtainedAt).getTime()) / (1000 * 60 * 60 * 24));
}

function stageForDays(effectiveDays: number, speciesCode: string): KuwagataGrowthStage {
  for (const { stage, end } of GROWTH_STAGE_RANGES) {
    if (effectiveDays < end) return stage;
  }
  return speciesCode === TEPPEN_SPECIES_CODE ? "蛹" : "成虫";
}

export function getIndividualGrowthStage(individual: GrowthInput): KuwagataGrowthStage {
  if (individual.hatchedAt) return "成虫";
  return stageForDays(
    getElapsedDays(individual) + individual.boostDays + individual.loginBoostDays,
    individual.speciesCode
  );
}

const STAGE_ORDER: KuwagataGrowthStage[] = ["卵", "幼虫", "蛹", "成虫"];

function stageIndex(stage: KuwagataGrowthStage): number {
  return STAGE_ORDER.indexOf(stage);
}

// 演出をまだ見せていない成長（見せ終えた段階より進んでいる個体）を、きっかけ別に拾う。
// 練習のブーストが無ければその段階に届いていなかった成長は「練習きっかけ」（結果画面でその場で見せる）、
// 日数やログインのご褒美だけで届いていた成長は「日数きっかけ」（ログイン後に見せる）。
// テッペンクワたんの羽化（hatched_at）は専用の羽化演出があるので対象外。
function findStageUps(individuals: KuwagataIndividual[], practiceTriggered: boolean): (RoadmapStageUp & { current: KuwagataGrowthStage })[] {
  return individuals.flatMap((individual) => {
    if (individual.hatchedAt) return [];
    const current = getIndividualGrowthStage(individual);
    if (stageIndex(current) <= stageIndex(individual.stageSeen)) return [];
    const withoutPractice = stageForDays(
      getElapsedDays(individual) + individual.loginBoostDays,
      individual.speciesCode
    );
    if ((stageIndex(withoutPractice) < stageIndex(current)) !== practiceTriggered) return [];
    return [
      {
        id: individual.id,
        speciesCode: individual.speciesCode,
        speciesName: individual.speciesName,
        mandibleVariant: individual.mandibleVariant,
        stage: current as RoadmapStageUp["stage"],
        current,
      },
    ];
  });
}

async function saveStageSeen(userId: string, entries: { id: string; stage: KuwagataGrowthStage }[]): Promise<void> {
  const byStage = new Map<KuwagataGrowthStage, string[]>();
  for (const { id, stage } of entries) byStage.set(stage, [...(byStage.get(stage) ?? []), id]);
  await Promise.all(
    [...byStage.entries()].map(([stage, ids]) =>
      supabaseAdmin.from("kuwagata_individuals").update({ stage_seen: stage }).in("id", ids).eq("user_id", userId)
    )
  );
}

// ログイン後に見せる成長（日数やログインのご褒美で段階が上がったもの）。
export async function getLoginStageUps(userId: string): Promise<RoadmapStageUp[]> {
  const all = await getUserKuwagataIndividuals(userId);
  return findStageUps(all, false).map(({ current: _current, ...rest }) => rest);
}

// 成長の演出を見せ終えたとき。指定の個体を、いまの成長段階まで見せた扱いにする。
export async function markStageSeen(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const all = await getUserKuwagataIndividuals(userId);
  const entries = all
    .filter((individual) => ids.includes(individual.id) && !individual.hatchedAt)
    .map((individual) => ({ id: individual.id, stage: getIndividualGrowthStage(individual) }));
  await saveStageSeen(userId, entries);
}

// 成虫かどうか。羽化済み(hatched_at)だけでなく、日数がたって成虫になった個体も含む。
export function isAdultIndividual(individual: GrowthInput): boolean {
  return getIndividualGrowthStage(individual) === "成虫";
}

// 次の段階へ進むゲージ。経過日数で進んだ分・ログインのご褒美で進んだ分・練習のブーストで進んだ分を、
// それぞれ0〜1の割合で返す（合計は1以下）。成虫はゲージなし(null)。蛹で止まるテッペンクワたんは、満タンのまま残る。
export type KuwagataGrowthGauge = { elapsedRatio: number; loginBoostRatio: number; boostRatio: number };

export function getIndividualGrowthGauge(individual: GrowthInput): KuwagataGrowthGauge | null {
  if (individual.hatchedAt) return null;

  const elapsed = getElapsedDays(individual);
  const effective = elapsed + individual.boostDays + individual.loginBoostDays;
  const held = individual.speciesCode === TEPPEN_SPECIES_CODE;
  const range = GROWTH_STAGE_RANGES.find(({ end }) => effective < end) ?? (held ? GROWTH_STAGE_RANGES[2] : null);
  if (!range) return null;

  const span = range.end - range.start;
  const total = Math.min((effective - range.start) / span, 1);
  const elapsedRatio = Math.min(Math.max((elapsed - range.start) / span, 0), total);
  const boosted = Math.max(total - elapsedRatio, 0);
  const loginBoostRatio = Math.min(individual.loginBoostDays / span, boosted);
  return { elapsedRatio, loginBoostRatio, boostRatio: boosted - loginBoostRatio };
}

// ログイン時の豆知識のご褒美（練習のブーストとは別の色で表示するため、別の列に加算する）。
export async function addLoginGrowthBoost(userId: string, days: number): Promise<void> {
  const { error } = await supabaseAdmin.rpc("add_kuwagata_login_boost", { p_user_id: userId, p_days: days });
  if (error) {
    throw new Error(`ログインブーストの加算に失敗しました: ${error.message}`);
  }
}

// 成虫の全個体に、習得済みのご褒美として成長ポイント（サイズレベルの元）を加える。
export async function addSizeGrowthPoints(userId: string, points: number): Promise<void> {
  const { error } = await supabaseAdmin.rpc("add_kuwagata_size_points", { p_user_id: userId, p_points: points });
  if (error) {
    throw new Error(`成長ポイントの加算に失敗しました: ${error.message}`);
  }
}

// 育成中（成虫になる前）の全個体に、習得済みのご褒美として成長日数を加える。
export async function addGrowthBoost(userId: string, days: number): Promise<void> {
  const { error } = await supabaseAdmin.rpc("add_kuwagata_boost", { p_user_id: userId, p_days: days });
  if (error) {
    throw new Error(`成長ブーストの加算に失敗しました: ${error.message}`);
  }
}

export type KuwagataGrowingIndividual = {
  id: string;
  speciesCode: string;
  speciesName: string;
  mandibleVariant: number;
  growthStage: KuwagataGrowthStage;
  growthGauge: KuwagataGrowthGauge;
};

function gaugeTotal(gauge: KuwagataGrowthGauge): number {
  return gauge.elapsedRatio + gauge.loginBoostRatio + gauge.boostRatio;
}

export type KuwagataAdultGrowth = {
  id: string;
  speciesCode: string;
  speciesName: string;
  mandibleVariant: number;
  sizeLevel: number;
  // 現在のレベル内での進み具合（0〜1）
  sizeRatio: number;
  // 前回見せたレベルより上がっている（レベルアップの演出を出す）
  leveledUp: boolean;
};

// 結果画面に出す総数の上限（育成中＋成虫の合計）。個体が増えても画面が長くならないよう絞る。
// 優先順位: レベルアップした成虫 → 育成中（次の段階に近い順）→ 残りの成虫（成長ポイントが多い順）。
const RESULT_DISPLAY_LIMIT = 6;

// 結果画面用：育成中（成虫になる前）の個体とその成長ゲージ、と成虫のサイズレベル。
// レベルアップを見せた個体は、見せ終えたレベルとして記録する（次回は演出を出さない）。
export async function getGrowingKuwagata(
  userId: string
): Promise<{
  individuals: KuwagataGrowingIndividual[];
  adults: KuwagataAdultGrowth[];
  hiddenCount: number;
  stageUps: RoadmapStageUp[];
  // 最大サイズレベルに初めて届いた成虫（1匹につき一度きりの特別な演出に使う）
  maxSizeUps: RoadmapStageUp[];
}> {
  // 「手に入れた！」の演出をまだ見せていないタマゴは、演出より先に見えてしまわないよう結果画面に出さない。
  const [allIndividuals, { data: uncelebrated }] = await Promise.all([
    getUserKuwagataIndividuals(userId),
    supabaseAdmin
      .from("kuwagata_individuals")
      .select("id")
      .eq("user_id", userId)
      .in("obtained_via", ["stage_clear", "event"])
      .is("celebrated_at", null),
  ]);
  const hiddenIds = new Set((uncelebrated ?? []).map((row) => row.id as string));
  const all = allIndividuals.filter((individual) => !hiddenIds.has(individual.id));

  // 練習のご褒美で段階が上がった個体は、この画面でその場で演出する（見せたものは記録して、二度出さない）。
  const practiceStageUps = findStageUps(all, true);
  await saveStageSeen(
    userId,
    practiceStageUps.map(({ id, current }) => ({ id, stage: current }))
  );
  const stageUps: RoadmapStageUp[] = practiceStageUps.map(({ current: _current, ...rest }) => rest);

  const growing: KuwagataGrowingIndividual[] = [];
  const adultCandidates: (KuwagataAdultGrowth & { points: number })[] = [];

  for (const individual of all) {
    if (isAdultIndividual(individual)) {
      const level = getSizeLevel(individual.sizeGrowthPoints);
      adultCandidates.push({
        id: individual.id,
        speciesCode: individual.speciesCode,
        speciesName: individual.speciesName,
        mandibleVariant: individual.mandibleVariant,
        sizeLevel: level,
        sizeRatio: getSizeLevelRatio(individual.sizeGrowthPoints),
        leveledUp: level > individual.sizeLevelSeen,
        points: individual.sizeGrowthPoints,
      });
      continue;
    }
    const growthGauge = getIndividualGrowthGauge(individual);
    if (!growthGauge) continue;
    growing.push({
      id: individual.id,
      speciesCode: individual.speciesCode,
      speciesName: individual.speciesName,
      mandibleVariant: individual.mandibleVariant,
      growthStage: getIndividualGrowthStage(individual),
      growthGauge,
    });
  }

  // 見せ終えていないレベルアップは、表示に絞られなくても全部「見せた」扱いにする（遅れて出さない）。
  const leveledUp = adultCandidates.filter((adult) => adult.leveledUp);
  await Promise.all(
    leveledUp.map((adult) =>
      supabaseAdmin
        .from("kuwagata_individuals")
        .update({ size_level_seen: adult.sizeLevel })
        .eq("id", adult.id)
        .eq("user_id", userId)
    )
  );

  const maxSizeUps: RoadmapStageUp[] = leveledUp
    .filter((adult) => adult.sizeLevel >= SIZE_LEVEL_MAX)
    .map((adult) => ({
      id: adult.id,
      speciesCode: adult.speciesCode,
      speciesName: adult.speciesName,
      mandibleVariant: adult.mandibleVariant,
      stage: "成虫" as const,
    }));

  const strip = ({ points: _points, ...adult }: KuwagataAdultGrowth & { points: number }): KuwagataAdultGrowth => adult;
  const leveledAdults = leveledUp.sort((a, b) => b.points - a.points);
  const growingSorted = [...growing].sort((a, b) => gaugeTotal(b.growthGauge) - gaugeTotal(a.growthGauge));

  const shownLeveled = leveledAdults.slice(0, RESULT_DISPLAY_LIMIT);
  const slots = RESULT_DISPLAY_LIMIT - shownLeveled.length;
  const shownGrowing = growingSorted.slice(0, slots);

  const shownCount = shownLeveled.length + shownGrowing.length;
  // 変化のなかった成虫は出さない（ご褒美で動いた個体だけを見せる）
  const totalCount = growing.length + leveledAdults.length;

  return {
    individuals: shownGrowing,
    adults: shownLeveled.map(strip),
    hiddenCount: totalCount - shownCount,
    stageUps,
    maxSizeUps,
  };
}

export type KuwagataShelfIndividual = KuwagataIndividual & {
  growthStage: KuwagataGrowthStage;
  growthGauge: KuwagataGrowthGauge | null;
  // 成虫のサイズレベル（0〜5）と、現在のレベル内の進み具合（0〜1）。sizeScaleはレベル反映後の表示倍率。
  sizeLevel: number;
  sizeRatio: number;
};

// 1つの水槽に入れる最大匹数。拡大表示で歩き回るのが気持ちよく収まる数(置物と衝突回避を
// 考えると5〜6匹が限界)。同じ種類がこれを超えたら、捕まえた順に次の水槽へ繰り上げる。
export const KUWAGATA_TANK_CAPACITY = 6;

export type KuwagataShelfTank = {
  // 水槽ごとに一意なID(選択状態・React keyに使う)。同じ種類が複数水槽に分かれても被らない。
  tankId: string;
  speciesId: string;
  speciesName: string;
  speciesKind: "known" | "new";
  speciesAreaCode: KuwagataAreaCode | null;
  tankNumber: number;
  // 同じ種類が複数水槽に分かれたときの水槽の番号(1始まり)。1水槽に収まる種類はnull。
  partNumber: number | null;
  individuals: KuwagataShelfIndividual[];
};

export type KuwagataShelfResult = {
  // 既知種も新種と同じく「1種類=1水槽」(エークワたん専用水槽、シャベクワたん専用水槽…)。
  // 複数種を1つの水槽にまとめることはしない。Free/Proを問わず常に全員表示
  // (表示枠上限の対象外)。1匹もいなければ空配列。
  knownTanks: KuwagataShelfTank[];
  tanks: KuwagataShelfTank[];
  // Free会員向けの表示枠上限（FREE_SHELF_NEW_SPECIES_TANK_CAP、新種のみ対象）に引っかかって
  // 非表示にした棚の数。0ならPro会員、または上限にまだ達していない。
  hiddenNewSpeciesTankCount: number;
};

// 棚UI用：ユーザーの個体を種類ごとにグルーピングし、「棚」単位に組み立てる。
// 既知種・新種とも「1種類=1水槽」(例: エークワたんだけの水槽、シャベクワたんだけの水槽)が基本で、
// 1水槽はKUWAGATA_TANK_CAPACITY匹まで。超えたら捕まえた順に次の水槽(partNumber 1,2,…)へ
// 分ける(棚のUIでは1種類1枚のカードにまとめ、拡大表示の中で水槽を切り替える)。
// 棚番号＝種類を初めて採集した順（getUserKuwagataIndividualsがobtained_at昇順のため、
// Map挿入順がそのまま初回採集順になる）。既知種・新種で別々に採番する。
// Free会員は新種の「種類」だけFREE_SHELF_NEW_SPECIES_TANK_CAP件までに絞る（分割後の水槽数では
// 数えない。既知種は対象外で常に全部表示する）。採集ロールの対象プール自体は絞らない
// ——あくまで棚の「見せ方」の上限。
export async function getKuwagataShelfTanks(userId: string): Promise<KuwagataShelfResult> {
  const [individuals, plan] = await Promise.all([getUserKuwagataIndividuals(userId), getPlan(userId)]);

  const byKnownSpecies = new Map<string, KuwagataShelfIndividual[]>();
  const byNewSpecies = new Map<string, KuwagataShelfIndividual[]>();
  const speciesInfo = new Map<string, Pick<KuwagataShelfTank, "speciesName" | "speciesKind" | "speciesAreaCode">>();

  for (const individual of individuals) {
    const adult = isAdultIndividual(individual);
    const sizeLevel = adult ? getSizeLevel(individual.sizeGrowthPoints) : 0;
    const shelfIndividual: KuwagataShelfIndividual = {
      ...individual,
      sizeScale: getDisplaySizeScale(individual.sizeScale, sizeLevel),
      sizeLevel,
      sizeRatio: adult ? getSizeLevelRatio(individual.sizeGrowthPoints) : 0,
      growthStage: getIndividualGrowthStage(individual),
      growthGauge: getIndividualGrowthGauge(individual),
    };

    const bucket = individual.speciesKind === "known" ? byKnownSpecies : byNewSpecies;
    const existing = bucket.get(individual.speciesId);
    if (existing) {
      existing.push(shelfIndividual);
      continue;
    }

    bucket.set(individual.speciesId, [shelfIndividual]);
    speciesInfo.set(individual.speciesId, {
      speciesName: individual.speciesName,
      speciesKind: individual.speciesKind,
      speciesAreaCode: individual.speciesAreaCode,
    });
  }

  // 種類ごとの個体リストを、KUWAGATA_TANK_CAPACITY匹ずつの水槽に分ける。
  // speciesLimitがあれば、種類の数がそれを超えた分は丸ごと除外する(Freeの新種表示枠)。
  const buildTanks = (bucket: Map<string, KuwagataShelfIndividual[]>, speciesLimit?: number) => {
    const entries = Array.from(bucket.entries());
    const visibleEntries = speciesLimit === undefined ? entries : entries.slice(0, speciesLimit);
    const tanks: KuwagataShelfTank[] = [];

    for (const [speciesIndex, [speciesId, speciesIndividuals]] of visibleEntries.entries()) {
      const info = speciesInfo.get(speciesId)!;
      const partCount = Math.ceil(speciesIndividuals.length / KUWAGATA_TANK_CAPACITY);
      for (let part = 0; part < partCount; part++) {
        tanks.push({
          tankId: partCount === 1 ? speciesId : `${speciesId}#${part + 1}`,
          speciesId,
          ...info,
          // 棚番号は「種類」の並び順(同じ種類の水槽はすべて同じ番号)。棚の一覧は1種類1枚のカード
          tankNumber: speciesIndex + 1,
          partNumber: partCount === 1 ? null : part + 1,
          individuals: speciesIndividuals.slice(part * KUWAGATA_TANK_CAPACITY, (part + 1) * KUWAGATA_TANK_CAPACITY),
        });
      }
    }

    return { tanks, hiddenSpeciesCount: entries.length - visibleEntries.length };
  };

  const knownTanks = buildTanks(byKnownSpecies).tanks;

  if (plan !== "free") {
    return { knownTanks, tanks: buildTanks(byNewSpecies).tanks, hiddenNewSpeciesTankCount: 0 };
  }

  const { tanks, hiddenSpeciesCount } = buildTanks(byNewSpecies, FREE_SHELF_NEW_SPECIES_TANK_CAP);
  return { knownTanks, tanks, hiddenNewSpeciesTankCount: hiddenSpeciesCount };
}

type DbSpeciesRow = {
  id: string;
  code: string;
  name: string;
  kind: string;
  area_code: string | null;
  stage_trigger: number | null;
  flavor_text_ja: string | null;
  sort_order: number;
  rarity: string;
  min_plan: string;
  base_size: number | string;
};

function fromDbSpeciesRow(row: DbSpeciesRow): KuwagataSpecies {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind as KuwagataSpecies["kind"],
    areaCode: row.area_code as KuwagataAreaCode | null,
    stageTrigger: row.stage_trigger,
    flavorTextJa: row.flavor_text_ja,
    sortOrder: row.sort_order,
    rarity: row.rarity as KuwagataRarity,
    minPlan: row.min_plan as KuwagataSpecies["minPlan"],
    baseSize: Number(row.base_size ?? 1),
  };
}

// 公開済みの種類マスタを全件取得する（既知種・新種を問わず）。件数が少ないため全件取得でよい。
// 種マスタは全ユーザー共通でほぼ変わらず、部屋・棚・採集などあちこちで読まれるので、メモリに5分持つ。
export const getKuwagataSpeciesList = ttlCached(5 * 60 * 1000, fetchKuwagataSpeciesList);

async function fetchKuwagataSpeciesList(): Promise<KuwagataSpecies[]> {
  const { data, error } = await supabaseAdmin
    .from("kuwagata_species")
    .select("id, code, name, kind, area_code, stage_trigger, flavor_text_ja, sort_order, rarity, min_plan, base_size")
    .eq("publish_status", "公開")
    .order("sort_order", { ascending: true });

  if (error) {
    throw new Error(`クワガタ種類マスタの取得に失敗しました: ${error.message}`);
  }

  return (data ?? []).map(fromDbSpeciesRow);
}

// ユーザーが採集した個体を全件取得する（棚・図鑑の表示用）。捕まえた順（obtained_at昇順）。
export async function getUserKuwagataIndividuals(userId: string): Promise<KuwagataIndividual[]> {
  const { data, error } = await supabaseAdmin
    .from("kuwagata_individuals")
    .select(
      "id, species_id, obtained_via, obtained_at, size_scale, mandible_variant, hatched_at, boost_days, login_boost_days, size_growth_points, size_level_seen, stage_seen, nickname, kuwagata_species(code, name, kind, rarity, area_code)"
    )
    .eq("user_id", userId)
    .order("obtained_at", { ascending: true });

  if (error) {
    throw new Error(`採集個体の取得に失敗しました: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    const species = row.kuwagata_species as unknown as {
      code: string;
      name: string;
      kind: string;
      rarity: string;
      area_code: string | null;
    } | null;
    return {
      id: row.id as string,
      speciesId: row.species_id as string,
      speciesCode: species?.code ?? "",
      speciesName: species?.name ?? "不明な種",
      speciesKind: (species?.kind as KuwagataIndividual["speciesKind"]) ?? "new",
      speciesRarity: (species?.rarity as KuwagataRarity) ?? "コモン",
      speciesAreaCode: (species?.area_code as KuwagataAreaCode | null) ?? null,
      obtainedVia: row.obtained_via as KuwagataIndividual["obtainedVia"],
      obtainedAt: row.obtained_at as string,
      sizeScale: Number(row.size_scale),
      mandibleVariant: row.mandible_variant as number,
      nickname: (row.nickname as string | null) ?? null,
      hatchedAt: (row.hatched_at as string | null) ?? null,
      boostDays: Number(row.boost_days ?? 0),
      loginBoostDays: Number(row.login_boost_days ?? 0),
      sizeGrowthPoints: Number(row.size_growth_points ?? 0),
      sizeLevelSeen: Number(row.size_level_seen ?? 0),
      stageSeen: (row.stage_seen as KuwagataGrowthStage | null) ?? "卵",
    };
  });
}

export const KUWAGATA_NICKNAME_MAX_LENGTH = 10;

// 個体に名前を付ける(nullまたは空文字で名前を外す)。本人の個体だけ更新できるよう
// user_idでも絞る。更新対象が無ければfalseを返す。
export async function setIndividualNickname(
  userId: string,
  individualId: string,
  nickname: string | null,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("kuwagata_individuals")
    .update({ nickname })
    .eq("id", individualId)
    .eq("user_id", userId)
    .select("id");

  if (error) {
    throw new Error(`名前の保存に失敗しました: ${error.message}`);
  }

  return (data ?? []).length > 0;
}

// エリアNの解放に必要な「Stage側」の条件。エリア1は最初から開いている。
// speaking-roadmap.tsがこのファイルをimportしているため、循環importを避けて動的に読み込む。
async function getAreaStageGates(userId: string): Promise<Partial<Record<KuwagataAreaCode, boolean>>> {
  const { getRoadmapStageReadiness } = await import("@/lib/supabase/speaking-roadmap");
  const readiness = await getRoadmapStageReadiness(userId);
  return {
    area2: readiness.stage2Ready,
    area3: readiness.stage3Ready,
    area4: readiness.stage4Ready,
    area5: readiness.stage5DailyReady || readiness.stage5BusinessReady,
  };
}

// 解放済みエリアは保存済みの行を正とし（一度開いたら閉じない）、未解放のエリアは読み取りのたびに
// 「Stage解放 かつ 前エリアの新種をAREA_UNLOCK_PREV_AREA_NEW_SPECIES種発見」を判定して、満たしたら保存する。
// 採集時だけでなくStage側が後から満たされた場合にも、次に開いた時点で解放される。
export async function getUnlockedAreas(userId: string): Promise<KuwagataAreaCode[]> {
  const [{ data, error }, plan, species, individuals] = await Promise.all([
    supabaseAdmin.from("kuwagata_area_unlocks").select("area_code").eq("user_id", userId),
    getPlan(userId),
    getKuwagataSpeciesList(),
    getUserKuwagataIndividuals(userId),
  ]);

  if (error) {
    throw new Error(`エリア解放状態の取得に失敗しました: ${error.message}`);
  }

  const unlocked = new Set<string>(["area1", ...(data ?? []).map((r) => r.area_code as string)]);
  const hasPendingArea = KUWAGATA_AREA_ORDER.some(
    (area, i) => i > 0 && !unlocked.has(area) && unlocked.has(KUWAGATA_AREA_ORDER[i - 1]) && isAreaReleased(species, area)
  );
  const stageGates = hasPendingArea ? await getAreaStageGates(userId) : {};
  const discoveredSpeciesIds = new Set(individuals.map((i) => i.speciesId));
  const newlyUnlocked: KuwagataAreaCode[] = [];

  for (let i = 1; i < KUWAGATA_AREA_ORDER.length; i++) {
    const area = KUWAGATA_AREA_ORDER[i];
    const prevArea = KUWAGATA_AREA_ORDER[i - 1];
    if (unlocked.has(area) || !unlocked.has(prevArea)) continue;
    if (!isAreaReleased(species, area) || !stageGates[area]) continue;

    const prevAreaSpecies = species.filter(
      (s) => s.kind === "new" && s.areaCode === prevArea && (plan !== "free" || s.minPlan === "free")
    );
    const required = Math.min(AREA_UNLOCK_PREV_AREA_NEW_SPECIES, prevAreaSpecies.length);
    const discoveredCount = prevAreaSpecies.filter((s) => discoveredSpeciesIds.has(s.id)).length;
    if (discoveredCount < required) continue;

    unlocked.add(area);
    newlyUnlocked.push(area);
  }

  // Pro限定の独立枠(古代の森など)は、Pro会員になった最初の読み取りで解放として記録する。
  // 記録することで「解放の演出」(マップで雲が晴れる)を一度だけ出せる。Freeに戻って再びProになっても、演出は繰り返さない。
  if (plan !== "free") {
    for (const area of PRO_ONLY_AREA_CODES) {
      if (!unlocked.has(area) && isAreaReleased(species, area)) {
        unlocked.add(area);
        newlyUnlocked.push(area);
      }
    }
  }

  if (newlyUnlocked.length > 0) {
    const { error: upsertError } = await supabaseAdmin
      .from("kuwagata_area_unlocks")
      .upsert(
        newlyUnlocked.map((area) => ({ user_id: userId, area_code: area })),
        { onConflict: "user_id,area_code" }
      );
    if (upsertError) {
      throw new Error(`エリア解放の登録に失敗しました: ${upsertError.message}`);
    }
  }

  const mainAreas = KUWAGATA_AREA_ORDER.filter((area) => unlocked.has(area) && isAreaReleased(species, area));

  // Pro限定の独立枠(水の底・古代の森)は、新種が公開されているときだけ出す（下書きの間は出さない）。
  return plan === "free"
    ? mainAreas
    : [...mainAreas, ...PRO_ONLY_AREA_CODES.filter((area) => isAreaReleased(species, area))];
}

// 解放の演出（マップで雲が晴れる）をまだ見ていないエリア。getUnlockedAreasの後に呼ぶ。
export async function getUncelebratedAreas(userId: string): Promise<KuwagataAreaCode[]> {
  const { data, error } = await supabaseAdmin
    .from("kuwagata_area_unlocks")
    .select("area_code")
    .eq("user_id", userId)
    .is("celebrated_at", null);
  if (error) {
    throw new Error(`エリア解放演出の状態の取得に失敗しました: ${error.message}`);
  }
  return (data ?? []).map((r) => r.area_code as KuwagataAreaCode);
}

export async function markAreasCelebrated(userId: string, areaCodes: KuwagataAreaCode[]): Promise<void> {
  if (areaCodes.length === 0) return;
  const { error } = await supabaseAdmin
    .from("kuwagata_area_unlocks")
    .update({ celebrated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .in("area_code", areaCodes)
    .is("celebrated_at", null);
  if (error) {
    throw new Error(`エリア解放演出の記録に失敗しました: ${error.message}`);
  }
}

export async function getKuwagataAreaProgress(userId: string): Promise<KuwagataAreaProgress[]> {
  const [species, individuals, unlockedAreas, plan] = await Promise.all([
    getKuwagataSpeciesList(),
    getUserKuwagataIndividuals(userId),
    getUnlockedAreas(userId),
    getPlan(userId),
  ]);

  const discoveredSpeciesIds = new Set(individuals.map((i) => i.speciesId));
  const unlockedSet = new Set(unlockedAreas);

  return KUWAGATA_AREA_ORDER.filter((areaCode) => isAreaReleased(species, areaCode)).map((areaCode) => {
    const areaNewSpecies = species.filter(
      (s) => s.kind === "new" && s.areaCode === areaCode && (plan !== "free" || s.minPlan === "free")
    );
    const discoveredCount = areaNewSpecies.filter((s) => discoveredSpeciesIds.has(s.id)).length;

    return {
      areaCode,
      unlocked: unlockedSet.has(areaCode),
      discoveredNewSpeciesCount: discoveredCount,
      totalNewSpeciesCount: areaNewSpecies.length,
    };
  });
}

export type KuwagataEncyclopediaEntry = {
  species: KuwagataSpecies;
  discovered: boolean;
  firstObtainedAt: string | null;
  firstObtainedVia: KuwagataIndividual["obtainedVia"] | null;
  proLocked: boolean;
};

export type KuwagataEncyclopediaArea = {
  areaCode: KuwagataAreaCode;
  unlocked: boolean;
  discoveredCount: number;
  totalCount: number;
  entries: KuwagataEncyclopediaEntry[];
};

export type KuwagataEncyclopedia = {
  known: KuwagataEncyclopediaEntry[];
  areas: KuwagataEncyclopediaArea[];
};

// previewAll: 開発確認用。全種を発見済み・全エリア解放済み・Pro限定も開いた状態の図鑑を返す（DBは変更しない）。
export async function getKuwagataEncyclopedia(
  userId: string,
  options: { previewAll?: boolean } = {}
): Promise<KuwagataEncyclopedia> {
  const [species, individuals, unlockedAreas, plan] = await Promise.all([
    getKuwagataSpeciesList(),
    getUserKuwagataIndividuals(userId),
    getUnlockedAreas(userId),
    getPlan(userId),
  ]);

  const firstBySpecies = new Map<string, { at: string; via: KuwagataIndividual["obtainedVia"] }>();
  for (const individual of individuals) {
    if (firstBySpecies.has(individual.speciesId)) continue;
    firstBySpecies.set(individual.speciesId, { at: individual.obtainedAt, via: individual.obtainedVia });
  }
  if (options.previewAll) {
    for (const s of species) {
      if (!firstBySpecies.has(s.id)) firstBySpecies.set(s.id, { at: new Date().toISOString(), via: "roll" });
    }
  }

  const toEntry = (s: KuwagataSpecies): KuwagataEncyclopediaEntry => {
    const first = firstBySpecies.get(s.id);
    return {
      species: s,
      discovered: first !== undefined,
      firstObtainedAt: first?.at ?? null,
      firstObtainedVia: first?.via ?? null,
      proLocked: !options.previewAll && plan === "free" && s.minPlan === "pro",
    };
  };

  const known = species.filter((s) => s.kind === "known").map(toEntry);

  const unlockedSet = new Set(options.previewAll ? [...KUWAGATA_AREA_ORDER, ...PRO_ONLY_AREA_CODES] : unlockedAreas);
  const areaCodesWithAquarium: KuwagataAreaCode[] = [
    ...KUWAGATA_AREA_ORDER.filter((areaCode) => isAreaReleased(species, areaCode)),
    ...PRO_ONLY_AREA_CODES.filter((areaCode) => isAreaReleased(species, areaCode)),
  ];
  const areas: KuwagataEncyclopediaArea[] = areaCodesWithAquarium.map((areaCode) => {
    const entries = species.filter((s) => s.kind === "new" && s.areaCode === areaCode).map(toEntry);
    const countable = entries.filter((e) => !e.proLocked);
    return {
      areaCode,
      unlocked: unlockedSet.has(areaCode),
      discoveredCount: countable.filter((e) => e.discovered).length,
      totalCount: countable.length,
      entries,
    };
  });

  return { known, areas };
}

function randomBetween(min: number, max: number): number {
  return Math.round((min + Math.random() * (max - min)) * 100) / 100;
}

// 「手に入れた！」演出をまだ見せていない確定入手のタマゴ（Stage解放・サインアップ時・節目のイベント）。
// 部屋に入ったときに出す。節目のイベントのタマゴは、Stage解放の演出を挟まないようstageTriggerをnullにする。
export async function getUncelebratedEggs(
  userId: string
): Promise<
  { id: string; speciesCode: string; speciesName: string; stageTrigger: number | null; reason: string | null }[]
> {
  const { data, error } = await supabaseAdmin
    .from("kuwagata_individuals")
    .select("id, obtained_via, kuwagata_species(code, name, stage_trigger)")
    .eq("user_id", userId)
    .in("obtained_via", ["stage_clear", "event"])
    .is("celebrated_at", null)
    .order("obtained_at", { ascending: true });

  if (error) {
    throw new Error(`未演出のタマゴの取得に失敗しました: ${error.message}`);
  }

  // 節目のタマゴは、台帳（kuwagata_egg_events）から「もらえた理由」を引く。
  const eventIds = (data ?? []).filter((row) => row.obtained_via === "event").map((row) => row.id as string);
  const reasonByIndividual = new Map<string, string | null>();
  if (eventIds.length > 0) {
    const { data: events } = await supabaseAdmin
      .from("kuwagata_egg_events")
      .select("individual_id, event_key")
      .eq("user_id", userId)
      .in("individual_id", eventIds);
    for (const event of events ?? []) {
      reasonByIndividual.set(event.individual_id as string, describeEggEvent(event.event_key as string));
    }
  }

  return (data ?? []).flatMap((row) => {
    const species = Array.isArray(row.kuwagata_species) ? row.kuwagata_species[0] : row.kuwagata_species;
    return species
      ? [
          {
            id: row.id as string,
            speciesCode: species.code as string,
            speciesName: species.name as string,
            stageTrigger: row.obtained_via === "event" ? null : ((species.stage_trigger as number | null) ?? null),
            reason: reasonByIndividual.get(row.id as string) ?? null,
          },
        ]
      : [];
  });
}

// 「羽化した！」演出をまだ見せていない個体（Stage5卒業でテッペンクワたんが成虫になったとき）。
export async function getUncelebratedHatches(
  userId: string
): Promise<
  { id: string; speciesCode: string; speciesName: string; mandibleVariant: number; hatchedFrom: string | null }[]
> {
  const { data, error } = await supabaseAdmin
    .from("kuwagata_individuals")
    .select("id, mandible_variant, hatched_from, kuwagata_species!inner(code, name, stage_trigger)")
    .eq("user_id", userId)
    .eq("kuwagata_species.stage_trigger", 5)
    .eq("obtained_via", "stage_clear")
    .not("hatched_at", "is", null)
    .is("hatch_celebrated_at", null)
    .order("hatched_at", { ascending: true });

  if (error) {
    throw new Error(`未演出の羽化の取得に失敗しました: ${error.message}`);
  }

  return (data ?? []).flatMap((row) => {
    const species = Array.isArray(row.kuwagata_species) ? row.kuwagata_species[0] : row.kuwagata_species;
    return species
      ? [
          {
            id: row.id as string,
            speciesCode: species.code as string,
            speciesName: species.name as string,
            mandibleVariant: row.mandible_variant as number,
            hatchedFrom: (row.hatched_from as string | null) ?? null,
          },
        ]
      : [];
  });
}

export async function markHatchCelebrated(userId: string, individualId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("kuwagata_individuals")
    .update({ hatch_celebrated_at: new Date().toISOString() })
    .eq("id", individualId)
    .eq("user_id", userId)
    .is("hatch_celebrated_at", null);

  if (error) {
    throw new Error(`羽化演出の既読保存に失敗しました: ${error.message}`);
  }
}

export async function markIndividualCelebrated(userId: string, individualId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("kuwagata_individuals")
    .update({ celebrated_at: new Date().toISOString() })
    .eq("id", individualId)
    .eq("user_id", userId)
    .is("celebrated_at", null);

  if (error) {
    throw new Error(`タマゴ演出の既読保存に失敗しました: ${error.message}`);
  }
}

export async function recordStageClearCatch(userId: string, stageJustCleared: number): Promise<void> {
  // 部屋を開くたびに呼ばれ、ほとんどは入手済みなので、まず1クエリで「もう持っているか」だけ確認する。
  const { data: owned, error: ownedError } = await supabaseAdmin
    .from("kuwagata_individuals")
    .select("id, kuwagata_species!inner(kind, stage_trigger)")
    .eq("user_id", userId)
    .eq("obtained_via", "stage_clear")
    .eq("kuwagata_species.kind", "known")
    .eq("kuwagata_species.stage_trigger", stageJustCleared)
    .limit(1);
  if (ownedError) {
    throw new Error(`既知種の既存個体確認に失敗しました: ${ownedError.message}`);
  }
  if ((owned?.length ?? 0) > 0) return; // 既に確定入手済み（べき等）。

  const { data: speciesRows, error: speciesError } = await supabaseAdmin
    .from("kuwagata_species")
    .select("id, base_size")
    .eq("kind", "known")
    .eq("stage_trigger", stageJustCleared)
    .eq("publish_status", "公開");

  if (speciesError) {
    throw new Error(`既知種の取得に失敗しました: ${speciesError.message}`);
  }

  const species = speciesRows?.[0];
  if (!species) return; // このStage番号に対応する既知種がまだ用意されていない。

  const { data: existing, error: existingError } = await supabaseAdmin
    .from("kuwagata_individuals")
    .select("id")
    .eq("user_id", userId)
    .eq("species_id", species.id)
    .eq("obtained_via", "stage_clear")
    .maybeSingle();

  if (existingError) {
    throw new Error(`既知種の既存個体確認に失敗しました: ${existingError.message}`);
  }
  if (existing) return; // 既に確定入手済み（べき等）。

  const { error: insertError } = await supabaseAdmin.from("kuwagata_individuals").insert({
    user_id: userId,
    species_id: species.id,
    obtained_via: "stage_clear",
    size_scale: Number(species.base_size ?? 1),
    mandible_variant: 1,
  });

  if (insertError) {
    throw new Error(`既知種の確定採集に失敗しました: ${insertError.message}`);
  }
}

// rareBoost: レア・激レアの重みにだけ掛ける倍率(ミニゲームの成績)。コモンの重みは変えない。
function pickByRarityWeight(pool: KuwagataSpecies[], rareBoost = 1): KuwagataSpecies {
  const weightOf = (s: KuwagataSpecies) =>
    s.rarity === "コモン" ? KUWAGATA_RARITY_WEIGHT[s.rarity] : KUWAGATA_RARITY_WEIGHT[s.rarity] * rareBoost;
  const totalWeight = pool.reduce((sum, s) => sum + weightOf(s), 0);
  let roll = Math.random() * totalWeight;
  for (const species of pool) {
    roll -= weightOf(species);
    if (roll <= 0) return species;
  }
  return pool[pool.length - 1]; // 浮動小数点誤差のフォールバック。
}

export type KuwagataCatchResult = {
  species: KuwagataSpecies;
  guaranteedRare: boolean;
};

export async function goCatchInArea(
  userId: string,
  areaCode: KuwagataAreaCode,
  guaranteedRare: boolean,
  rareBoost = 1
): Promise<KuwagataCatchResult | null> {
  const [species, unlockedAreas, individuals, plan] = await Promise.all([
    getKuwagataSpeciesList(),
    getUnlockedAreas(userId),
    getUserKuwagataIndividuals(userId),
    getPlan(userId),
  ]);

  if (!unlockedAreas.includes(areaCode)) {
    throw new Error("未解放のエリアでは採集できません");
  }

  const pool: KuwagataSpecies[] = species.filter(
    (s) => s.kind === "new" && s.areaCode === areaCode && (plan !== "free" || s.minPlan === "free")
  );

  // 既知種の2体目以降：このエリアに対応する既知種の、最初のタマゴ（stage_clear）が成虫になっていれば合流。
  // タマゴが育ちきる前に同じ種が採集で捕まる、ということが起きないようにする。
  const stageTrigger = AREA_KNOWN_SPECIES_STAGE_TRIGGER[areaCode];
  const knownSpecies = species.find((s) => s.kind === "known" && s.stageTrigger === stageTrigger);
  if (knownSpecies) {
    const firstIsAdult = individuals.some(
      (i) => i.speciesId === knownSpecies.id && i.obtainedVia === "stage_clear" && isAdultIndividual(i)
    );
    if (firstIsAdult) pool.push(knownSpecies);
  }

  // テッペンクワたんは激レア枠としてarea5に入る（Stage5を卒業して、最初のタマゴが羽化した人だけ）。
  if (areaCode === "area5") {
    const teppen = species.find((s) => s.code === TEPPEN_SPECIES_CODE);
    if (
      teppen &&
      individuals.some((i) => i.speciesId === teppen.id && i.obtainedVia === "stage_clear" && i.hatchedAt !== null)
    ) {
      pool.push(teppen);
    }
  }

  if (pool.length === 0) return null; // このエリアの新種がまだ用意されていない。

  // レア以上保障：プールをレア/激レアだけに絞る。該当が無ければ通常プールにフォールバック
  // （既知種は常にコモン扱いなので、絞った時点で自動的に除外される）。
  const rarePool = pool.filter((s) => s.rarity !== "コモン");
  const effectivePool = guaranteedRare && rarePool.length > 0 ? rarePool : pool;

  const picked = pickByRarityWeight(effectivePool, rareBoost);

  // 新種は野生採集＝見つけた時点で成虫という設定。既知種（stage_clear、卵から育てる）と違い
  // 日数経過での成長段階表示（卵→幼虫→蛹）の対象にしないよう、取得と同時にhatched_atを立てる。
  const { error: insertError } = await supabaseAdmin.from("kuwagata_individuals").insert({
    user_id: userId,
    species_id: picked.id,
    obtained_via: "roll",
    size_scale: randomBetween(picked.baseSize * (1 - WILD_SIZE_VARIANCE), picked.baseSize * (1 + WILD_SIZE_VARIANCE)),
    mandible_variant: Math.floor(Math.random() * MANDIBLE_VARIANT_COUNT) + 1,
    hatched_at: new Date().toISOString(),
    // 採集結果はその場で演出を見せるため、部屋でのタマゴ演出の対象にはしない。
    celebrated_at: new Date().toISOString(),
  });

  if (insertError) {
    throw new Error(`採集の登録に失敗しました: ${insertError.message}`);
  }

  return { species: picked, guaranteedRare: guaranteedRare && rarePool.length > 0 };
}

export type KuwagataPendingCatchState = {
  pendingCatchCount: number;
  pendingGuaranteedRareCatchCount: number;
};

export async function getPendingCatchState(userId: string): Promise<KuwagataPendingCatchState> {
  const { data, error } = await supabaseAdmin
    .from("user_roadmap_state")
    .select("pending_catch_count, pending_guaranteed_rare_catch_count")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new Error(`採集チャンスの取得に失敗しました: ${error.message}`);
  }

  return {
    pendingCatchCount: data?.pending_catch_count ?? 0,
    pendingGuaranteedRareCatchCount: data?.pending_guaranteed_rare_catch_count ?? 0,
  };
}

export async function stockCatchChanceOnMasteredCountUpdate(userId: string, newTotal: number): Promise<void> {
  const plan = await getPlan(userId);
  const interval = plan === "free" ? KUWAGATA_MASTERED_COUNT_ROLL_INTERVAL : KUWAGATA_MASTERED_COUNT_ROLL_INTERVAL_PRO;
  if (newTotal % interval !== 0) return;

  const isGuaranteedRareMilestone = newTotal % KUWAGATA_RARE_GUARANTEE_MILESTONE === 0;

  // 読んで書くと同時実行で加算が失われるため、DB側で1回のSQLとして加算する。
  const { error } = await supabaseAdmin.rpc("add_kuwagata_catch_chance", {
    p_user_id: userId,
    p_guaranteed: isGuaranteedRareMilestone,
  });

  if (error) {
    throw new Error(`採集チャンスの更新に失敗しました: ${error.message}`);
  }
}

export async function consumePendingCatch(
  userId: string,
  areaCode: KuwagataAreaCode,
  rareBoost = 1,
  // true=レア確定のチャンスだけ使う／false=普通のチャンスだけ使う／未指定=レア確定を優先
  wantGuaranteed?: boolean
): Promise<KuwagataCatchResult | null> {
  // 残りの確認と消費を1回のSQLで行う（同時に2回送られても、消費できるのは片方だけ）。
  const { data, error: consumeError } = await supabaseAdmin.rpc("consume_kuwagata_catch", {
    p_user_id: userId,
    p_want_guaranteed: wantGuaranteed ?? null,
  });
  if (consumeError) {
    throw new Error(`採集チャンスの消費に失敗しました: ${consumeError.message}`);
  }

  const consumed = (Array.isArray(data) ? data[0] : data) as { consumed: boolean; guaranteed: boolean } | null;
  if (!consumed?.consumed) return null;

  // 採集の抽選に失敗した（エラー・プールが空）ときは、消費した採集チャンスを戻す。
  const refund = async () => {
    await supabaseAdmin.rpc("add_kuwagata_catch_chance", { p_user_id: userId, p_guaranteed: consumed.guaranteed });
  };

  try {
    const result = await goCatchInArea(userId, areaCode, consumed.guaranteed, rareBoost);
    if (!result) await refund();
    return result;
  } catch (err) {
    await refund();
    throw err;
  }
}

export async function forceHatchTeppenToAdult(userId: string): Promise<void> {
  const { data: speciesRows, error: speciesError } = await supabaseAdmin
    .from("kuwagata_species")
    .select("id")
    .eq("kind", "known")
    .eq("stage_trigger", 5)
    .eq("publish_status", "公開");

  if (speciesError) {
    throw new Error(`テッペンクワたんの種類取得に失敗しました: ${speciesError.message}`);
  }

  const species = speciesRows?.[0];
  if (!species) return; // まだ用意されていない。

  // Stage5を卒業した時点で卵がなければ(Stage5を別の経路で開いた場合の保険)、ここで配ってから羽化させる。べき等。
  await recordStageClearCatch(userId, 5);

  const { data: individual, error: individualError } = await supabaseAdmin
    .from("kuwagata_individuals")
    .select("id, hatched_at, obtained_at, boost_days, login_boost_days")
    .eq("user_id", userId)
    .eq("species_id", species.id)
    .eq("obtained_via", "stage_clear")
    .maybeSingle();

  if (individualError) {
    throw new Error(`テッペンクワたん個体の取得に失敗しました: ${individualError.message}`);
  }
  if (!individual) return; // 卵がまだ配布されていない（Stage5解放前）。
  if (individual.hatched_at) return; // 既に羽化済み（べき等）。

  // 羽化の演出で「◯◯から成長して」と出すため、羽化する直前の成長段階を覚えておく。
  const stageBefore = getIndividualGrowthStage({
    obtainedAt: individual.obtained_at as string,
    hatchedAt: null,
    boostDays: Number(individual.boost_days ?? 0),
    loginBoostDays: Number(individual.login_boost_days ?? 0),
    speciesCode: TEPPEN_SPECIES_CODE,
  });

  const { error: updateError } = await supabaseAdmin
    .from("kuwagata_individuals")
    .update({ hatched_at: new Date().toISOString(), hatched_from: stageBefore })
    .eq("id", individual.id);

  if (updateError) {
    throw new Error(`テッペンクワたんの羽化処理に失敗しました: ${updateError.message}`);
  }
}
