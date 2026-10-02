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

const KNOWN_SHOWCASE_SPECIES_ID = "known-showcase";

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
};

export type KuwagataAreaProgress = {
  areaCode: KuwagataAreaCode;
  unlocked: boolean;
  discoveredNewSpeciesCount: number;
  totalNewSpeciesCount: number;
};

export type KuwagataGrowthStage = "卵" | "幼虫" | "蛹" | "成虫";

const GROWTH_STAGE_DAY_THRESHOLDS: { stage: KuwagataGrowthStage; maxDays: number }[] = [
  { stage: "卵", maxDays: 3 },
  { stage: "幼虫", maxDays: 10 },
  { stage: "蛹", maxDays: 14 },
];

export function getIndividualGrowthStage(individual: {
  obtainedAt: string;
  hatchedAt: string | null;
}): KuwagataGrowthStage {
  if (individual.hatchedAt) return "成虫";

  const elapsedDays = (Date.now() - new Date(individual.obtainedAt).getTime()) / (1000 * 60 * 60 * 24);
  for (const { stage, maxDays } of GROWTH_STAGE_DAY_THRESHOLDS) {
    if (elapsedDays < maxDays) return stage;
  }
  return "成虫";
}

export type KuwagataShelfIndividual = KuwagataIndividual & { growthStage: KuwagataGrowthStage };

export type KuwagataShelfTank = {
  speciesId: string;
  speciesName: string;
  speciesKind: "known" | "new";
  speciesAreaCode: KuwagataAreaCode | null;
  tankNumber: number;
  individuals: KuwagataShelfIndividual[];
};

export type KuwagataShelfResult = {
  // 既知種（クワたんシリーズ）5種をまとめた1つの棚。複数種が同居する特別枠で、
  // Free/Proを問わず常に全員表示（表示枠上限の対象外）。1匹もいなければnull。
  knownShowcase: KuwagataShelfTank | null;
  tanks: KuwagataShelfTank[];
  // Free会員向けの表示枠上限（FREE_SHELF_NEW_SPECIES_TANK_CAP、新種のみ対象）に引っかかって
  // 非表示にした棚の数。0ならPro会員、または上限にまだ達していない。
  hiddenNewSpeciesTankCount: number;
};

// 棚UI用：ユーザーの個体を種類ごとにグルーピングし、「棚」単位に組み立てる。
// 既知種（クワたんシリーズ）は種類をまたいで1つの棚（knownShowcase）にまとめる。
// 新種の棚番号＝その種類を初めて採集した順（getUserKuwagataIndividualsがobtained_at昇順のため、
// Map挿入順＝初回採集順がそのまま棚番号の順序になる）。
// Free会員は新種の棚だけFREE_SHELF_NEW_SPECIES_TANK_CAP件までに絞る（既知種は対象外、
// 常に全部表示する）。採集ロールの対象プール自体は絞らない——あくまで棚の「見せ方」の上限。
export async function getKuwagataShelfTanks(userId: string): Promise<KuwagataShelfResult> {
  const [individuals, plan] = await Promise.all([getUserKuwagataIndividuals(userId), getPlan(userId)]);

  const knownIndividuals: KuwagataShelfIndividual[] = [];
  const bySpecies = new Map<string, KuwagataShelfTank>();

  for (const individual of individuals) {
    const shelfIndividual: KuwagataShelfIndividual = {
      ...individual,
      growthStage: getIndividualGrowthStage(individual),
    };

    if (individual.speciesKind === "known") {
      knownIndividuals.push(shelfIndividual);
      continue;
    }

    const existing = bySpecies.get(individual.speciesId);
    if (existing) {
      existing.individuals.push(shelfIndividual);
      continue;
    }

    bySpecies.set(individual.speciesId, {
      speciesId: individual.speciesId,
      speciesName: individual.speciesName,
      speciesKind: individual.speciesKind,
      speciesAreaCode: individual.speciesAreaCode,
      tankNumber: bySpecies.size + 1,
      individuals: [shelfIndividual],
    });
  }

  const knownShowcase: KuwagataShelfTank | null =
    knownIndividuals.length > 0
      ? {
          speciesId: KNOWN_SHOWCASE_SPECIES_ID,
          speciesName: "クワたんシリーズ",
          speciesKind: "known",
          speciesAreaCode: null,
          tankNumber: 0,
          individuals: knownIndividuals,
        }
      : null;

  const allNewTanks = Array.from(bySpecies.values());
  if (plan !== "free") {
    return { knownShowcase, tanks: allNewTanks, hiddenNewSpeciesTankCount: 0 };
  }

  const visibleNewOnes = allNewTanks.slice(0, FREE_SHELF_NEW_SPECIES_TANK_CAP);
  const hiddenNewSpeciesTankCount = allNewTanks.length - visibleNewOnes.length;

  return { knownShowcase, tanks: visibleNewOnes, hiddenNewSpeciesTankCount };
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
      "id, species_id, obtained_via, obtained_at, size_scale, mandible_variant, hatched_at, kuwagata_species(code, name, kind, rarity, area_code)"
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
      hatchedAt: (row.hatched_at as string | null) ?? null,
    };
  });
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
