// クワガタ育成機能（棚・図鑑）のデータアクセス層。
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPlan } from "@/lib/supabase/profile";

export type KuwagataAreaCode = "area1" | "area2" | "area3" | "area4" | "aquarium";

export const KUWAGATA_AREA_ORDER: KuwagataAreaCode[] = ["area1", "area2", "area3", "area4"];

export const AQUARIUM_AREA_CODE: KuwagataAreaCode = "aquarium";

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

const SIZE_SCALE_MIN = 0.8;
const SIZE_SCALE_MAX = 1.3;

const MANDIBLE_VARIANT_COUNT = 3;

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
};

export type KuwagataIndividual = {
  id: string;
  speciesId: string;
  speciesCode: string;
  speciesName: string;
  speciesKind: "known" | "new";
  speciesRarity: KuwagataRarity;
  speciesAreaCode: KuwagataAreaCode | null;
  obtainedVia: "stage_clear" | "roll";
  obtainedAt: string;
  sizeScale: number;
  mandibleVariant: number;
  hatchedAt: string | null;
  // 練習のご褒美で加算された成長日数（経過日数に足して成長段階を決める）。
  boostDays: number;
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
  { stage: "卵", start: 0, end: 3 },
  { stage: "幼虫", start: 3, end: 10 },
  { stage: "蛹", start: 10, end: 14 },
];

// 習得済み（卒業）1回あたりのブースト日数。Freeの1日の上限（Stage3は8回、Stage4は3回）でも
// 1日に卒業できる数が限られるため、難しいStageほど大きくする。Stage5は卒業で即成虫なので対象外。
export const KUWAGATA_GRADUATION_BOOST_DAYS: Record<0 | 1 | 2 | 3 | 4, number> = {
  0: 0.1,
  1: 0.1,
  2: 0.2,
  3: 0.4,
  4: 0.8,
};

type GrowthInput = { obtainedAt: string; hatchedAt: string | null; boostDays: number };

function getElapsedDays(individual: GrowthInput): number {
  return Math.max(0, (Date.now() - new Date(individual.obtainedAt).getTime()) / (1000 * 60 * 60 * 24));
}

export function getIndividualGrowthStage(individual: GrowthInput): KuwagataGrowthStage {
  if (individual.hatchedAt) return "成虫";

  const effectiveDays = getElapsedDays(individual) + individual.boostDays;
  for (const { stage, end } of GROWTH_STAGE_RANGES) {
    if (effectiveDays < end) return stage;
  }
  return "成虫";
}

// 次の段階へ進むゲージ。経過日数で進んだ分とブーストで進んだ分を、それぞれ0〜1の割合で返す
// （合計は1以下）。成虫はゲージなし(null)。
export type KuwagataGrowthGauge = { elapsedRatio: number; boostRatio: number };

export function getIndividualGrowthGauge(individual: GrowthInput): KuwagataGrowthGauge | null {
  if (individual.hatchedAt) return null;

  const elapsed = getElapsedDays(individual);
  const effective = elapsed + individual.boostDays;
  const range = GROWTH_STAGE_RANGES.find(({ end }) => effective < end);
  if (!range) return null;

  const span = range.end - range.start;
  const total = (effective - range.start) / span;
  const elapsedRatio = Math.min(Math.max((elapsed - range.start) / span, 0), total);
  return { elapsedRatio, boostRatio: Math.max(total - elapsedRatio, 0) };
}

// 育成中（成虫になる前）の全個体に、習得済みのご褒美として成長日数を加える。
export async function addGrowthBoost(userId: string, days: number): Promise<void> {
  const { error } = await supabaseAdmin.rpc("add_kuwagata_boost", { p_user_id: userId, p_days: days });
  if (error) {
    throw new Error(`成長ブーストの加算に失敗しました: ${error.message}`);
  }
}

export type KuwagataShelfIndividual = KuwagataIndividual & {
  growthStage: KuwagataGrowthStage;
  growthGauge: KuwagataGrowthGauge | null;
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
    const shelfIndividual: KuwagataShelfIndividual = {
      ...individual,
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
  };
}

// 公開済みの種類マスタを全件取得する（既知種・新種を問わず）。件数が少ないため全件取得でよい。
export async function getKuwagataSpeciesList(): Promise<KuwagataSpecies[]> {
  const { data, error } = await supabaseAdmin
    .from("kuwagata_species")
    .select("id, code, name, kind, area_code, stage_trigger, flavor_text_ja, sort_order, rarity, min_plan")
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
      "id, species_id, obtained_via, obtained_at, size_scale, mandible_variant, hatched_at, boost_days, nickname, kuwagata_species(code, name, kind, rarity, area_code)"
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

export async function getUnlockedAreas(userId: string): Promise<KuwagataAreaCode[]> {
  const [{ data, error }, plan] = await Promise.all([
    supabaseAdmin.from("kuwagata_area_unlocks").select("area_code").eq("user_id", userId),
    getPlan(userId),
  ]);

  if (error) {
    throw new Error(`エリア解放状態の取得に失敗しました: ${error.message}`);
  }

  const unlocked = new Set<string>(["area1", ...(data ?? []).map((r) => r.area_code as string)]);
  const mainAreas = KUWAGATA_AREA_ORDER.filter((area) => unlocked.has(area));

  return plan === "free" ? mainAreas : [...mainAreas, AQUARIUM_AREA_CODE];
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

  return KUWAGATA_AREA_ORDER.map((areaCode) => {
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

export async function getKuwagataEncyclopedia(userId: string): Promise<KuwagataEncyclopedia> {
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

  const toEntry = (s: KuwagataSpecies): KuwagataEncyclopediaEntry => {
    const first = firstBySpecies.get(s.id);
    return {
      species: s,
      discovered: first !== undefined,
      firstObtainedAt: first?.at ?? null,
      firstObtainedVia: first?.via ?? null,
      proLocked: plan === "free" && s.minPlan === "pro",
    };
  };

  const known = species.filter((s) => s.kind === "known").map(toEntry);

  const unlockedSet = new Set(unlockedAreas);
  const areaCodesWithAquarium: KuwagataAreaCode[] = [...KUWAGATA_AREA_ORDER, AQUARIUM_AREA_CODE];
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

// 「手に入れた！」演出をまだ見せていない確定入手のタマゴ（Stage解放・サインアップ時）。部屋に入ったときに出す。
export async function getUncelebratedEggs(
  userId: string
): Promise<{ id: string; speciesCode: string; speciesName: string; stageTrigger: number | null }[]> {
  const { data, error } = await supabaseAdmin
    .from("kuwagata_individuals")
    .select("id, kuwagata_species(code, name, stage_trigger)")
    .eq("user_id", userId)
    .eq("obtained_via", "stage_clear")
    .is("celebrated_at", null)
    .order("obtained_at", { ascending: true });

  if (error) {
    throw new Error(`未演出のタマゴの取得に失敗しました: ${error.message}`);
  }

  return (data ?? []).flatMap((row) => {
    const species = Array.isArray(row.kuwagata_species) ? row.kuwagata_species[0] : row.kuwagata_species;
    return species
      ? [
          {
            id: row.id as string,
            speciesCode: species.code as string,
            speciesName: species.name as string,
            stageTrigger: (species.stage_trigger as number | null) ?? null,
          },
        ]
      : [];
  });
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
  const { data: speciesRows, error: speciesError } = await supabaseAdmin
    .from("kuwagata_species")
    .select("id")
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
    size_scale: 1.0,
    mandible_variant: 1,
  });

  if (insertError) {
    throw new Error(`既知種の確定採集に失敗しました: ${insertError.message}`);
  }
}

function pickByRarityWeight(pool: KuwagataSpecies[]): KuwagataSpecies {
  const totalWeight = pool.reduce((sum, s) => sum + KUWAGATA_RARITY_WEIGHT[s.rarity], 0);
  let roll = Math.random() * totalWeight;
  for (const species of pool) {
    roll -= KUWAGATA_RARITY_WEIGHT[species.rarity];
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
  guaranteedRare: boolean
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

  // 既知種の2体目以降：このエリアに対応する既知種が、初回個体（stage_clear）を既に持っていれば合流。
  const stageTrigger = AREA_KNOWN_SPECIES_STAGE_TRIGGER[areaCode];
  const knownSpecies = species.find((s) => s.kind === "known" && s.stageTrigger === stageTrigger);
  if (knownSpecies) {
    const hasFirstIndividual = individuals.some(
      (i) => i.speciesId === knownSpecies.id && i.obtainedVia === "stage_clear"
    );
    if (hasFirstIndividual) pool.push(knownSpecies);
  }

  if (pool.length === 0) return null; // このエリアの新種がまだ用意されていない。

  // レア以上保障：プールをレア/激レアだけに絞る。該当が無ければ通常プールにフォールバック
  // （既知種は常にコモン扱いなので、絞った時点で自動的に除外される）。
  const rarePool = pool.filter((s) => s.rarity !== "コモン");
  const effectivePool = guaranteedRare && rarePool.length > 0 ? rarePool : pool;

  const picked = pickByRarityWeight(effectivePool);

  // 新種は野生採集＝見つけた時点で成虫という設定。既知種（stage_clear、卵から育てる）と違い
  // 日数経過での成長段階表示（卵→幼虫→蛹）の対象にしないよう、取得と同時にhatched_atを立てる。
  const { error: insertError } = await supabaseAdmin.from("kuwagata_individuals").insert({
    user_id: userId,
    species_id: picked.id,
    obtained_via: "roll",
    size_scale: randomBetween(SIZE_SCALE_MIN, SIZE_SCALE_MAX),
    mandible_variant: Math.floor(Math.random() * MANDIBLE_VARIANT_COUNT) + 1,
    hatched_at: new Date().toISOString(),
    // 採集結果はその場で演出を見せるため、部屋でのタマゴ演出の対象にはしない。
    celebrated_at: new Date().toISOString(),
  });

  if (insertError) {
    throw new Error(`採集の登録に失敗しました: ${insertError.message}`);
  }

  await maybeUnlockNextArea(userId, picked.areaCode);

  return { species: picked, guaranteedRare: guaranteedRare && rarePool.length > 0 };
}

async function maybeUnlockNextArea(userId: string, justCaughtAreaCode: KuwagataAreaCode | null): Promise<void> {
  if (!justCaughtAreaCode) return;
  if (!KUWAGATA_AREA_ORDER.includes(justCaughtAreaCode)) return;

  const areaIndex = KUWAGATA_AREA_ORDER.indexOf(justCaughtAreaCode);
  const nextArea = KUWAGATA_AREA_ORDER[areaIndex + 1];
  if (!nextArea) return; // 最終エリア。

  const progress = await getKuwagataAreaProgress(userId);
  const current = progress.find((p) => p.areaCode === justCaughtAreaCode);
  if (!current || current.totalNewSpeciesCount === 0) return;
  if (current.discoveredNewSpeciesCount < current.totalNewSpeciesCount) return; // まだコンプリートしていない。

  const { error } = await supabaseAdmin
    .from("kuwagata_area_unlocks")
    .upsert({ user_id: userId, area_code: nextArea }, { onConflict: "user_id,area_code" });

  if (error) {
    throw new Error(`エリア解放の登録に失敗しました: ${error.message}`);
  }
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

  const { data, error: fetchError } = await supabaseAdmin
    .from("user_roadmap_state")
    .select("pending_catch_count, pending_guaranteed_rare_catch_count")
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) {
    throw new Error(`採集チャンスの取得に失敗しました: ${fetchError.message}`);
  }

  const { error: updateError } = await supabaseAdmin
    .from("user_roadmap_state")
    .update({
      pending_catch_count: (data?.pending_catch_count ?? 0) + 1,
      pending_guaranteed_rare_catch_count:
        (data?.pending_guaranteed_rare_catch_count ?? 0) + (isGuaranteedRareMilestone ? 1 : 0),
    })
    .eq("user_id", userId);

  if (updateError) {
    throw new Error(`採集チャンスの更新に失敗しました: ${updateError.message}`);
  }
}

export async function consumePendingCatch(
  userId: string,
  areaCode: KuwagataAreaCode
): Promise<KuwagataCatchResult | null> {
  const state = await getPendingCatchState(userId);
  if (state.pendingCatchCount <= 0) return null;

  const useGuaranteedRare = state.pendingGuaranteedRareCatchCount > 0;

  const { error: updateError } = await supabaseAdmin
    .from("user_roadmap_state")
    .update({
      pending_catch_count: state.pendingCatchCount - 1,
      pending_guaranteed_rare_catch_count: useGuaranteedRare
        ? state.pendingGuaranteedRareCatchCount - 1
        : state.pendingGuaranteedRareCatchCount,
    })
    .eq("user_id", userId);

  if (updateError) {
    throw new Error(`採集チャンスの消費に失敗しました: ${updateError.message}`);
  }

  return goCatchInArea(userId, areaCode, useGuaranteedRare);
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

  const { data: individual, error: individualError } = await supabaseAdmin
    .from("kuwagata_individuals")
    .select("id, hatched_at")
    .eq("user_id", userId)
    .eq("species_id", species.id)
    .eq("obtained_via", "stage_clear")
    .maybeSingle();

  if (individualError) {
    throw new Error(`テッペンクワたん個体の取得に失敗しました: ${individualError.message}`);
  }
  if (!individual) return; // 卵がまだ配布されていない（Stage5解放前）。
  if (individual.hatched_at) return; // 既に羽化済み（べき等）。

  const { error: updateError } = await supabaseAdmin
    .from("kuwagata_individuals")
    .update({ hatched_at: new Date().toISOString() })
    .eq("id", individual.id);

  if (updateError) {
    throw new Error(`テッペンクワたんの羽化処理に失敗しました: ${updateError.message}`);
  }
}
