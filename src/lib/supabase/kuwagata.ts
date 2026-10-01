// src/lib/supabase/kuwagata.ts
// クワガタ育成機能（棚・図鑑）のデータアクセス層。
// 設計の全体像は _reference/kuwagata-motif-exploration.md を参照。
//
// 既知種（エークワガタ一族）と新種（それ以外の生き物）で入手経路が異なる：
// - 既知種：Stageクリアで確定入手（recordStageClearCatch）。エリアとは無関係。
// - 新種：totalMasteredCountの一定間隔で採集チャンスをストックし（stockCatchChanceOnMasteredCountUpdate）、
//   プレイヤーが「採集に出かける」でエリアを選んだ時点でそのエリアのプールから抽選する
//   （consumePendingCatch → goCatchInArea）。既知種も、対応エリア解放済み＋初回個体を
//   1度育て上げていれば2体目以降がこのプールに合流する。
import { supabaseAdmin } from "@/lib/supabase/server";
import { getPlan } from "@/lib/supabase/profile";

// "aquarium"はPro限定の新エリア（水中アクアリウム表示、2026-10-01方針確定）。
// 本編エリア1〜4のコンプリート連鎖（KUWAGATA_AREA_ORDER）には含めず、Proであれば
// 常に解放済みとして扱う、本道から切り離した特別な場所という位置づけ。
export type KuwagataAreaCode = "area1" | "area2" | "area3" | "area4" | "aquarium";

export const KUWAGATA_AREA_ORDER: KuwagataAreaCode[] = ["area1", "area2", "area3", "area4"];

export const AQUARIUM_AREA_CODE: KuwagataAreaCode = "aquarium";

// 各エリアに対応する既知種のstage_trigger（そのエリアが解放済み＋初回個体を育成済みなら、
// 2体目以降の野生ロールにこの既知種が合流する）。
// aquariumは対応する既知種を持たないため、Partialにしてキーを省略できるようにする。
const AREA_KNOWN_SPECIES_STAGE_TRIGGER: Partial<Record<KuwagataAreaCode, number>> = {
  area1: 1,
  area2: 2,
  area3: 3,
  area4: 4,
};

// totalMasteredCountがこの倍数に達するたびに1回、採集チャンスをストックする
//（街のTier充填ロジックと同じ間隔）。2026-10-01の採集フロー見直しにより、ここで即時ロールは
// しない。チャンスをuser_roadmap_state.pending_catch_countに積み、プレイヤーが「採集に出かける」
// を選んだ時点で初めて抽選する（詳細はgoCatchInAreaのコメント参照）。
export const KUWAGATA_MASTERED_COUNT_ROLL_INTERVAL = 10;

// クワガタ育成機能のFree/Pro線引き（#257）。
// Proの採集ロールボーナスは「チャンスの発生頻度を上げる」形。間隔を半分にすることで、
// 同じ練習量でもPro会員は単純に2倍の頻度で採集チャンスが貯まる。
export const KUWAGATA_MASTERED_COUNT_ROLL_INTERVAL_PRO = KUWAGATA_MASTERED_COUNT_ROLL_INTERVAL / 2;

// totalMasteredCountがこの倍数に達した回のチャンスには「レア以上保障」フラグを立てる
// （レア度システム、2026-10-01設計確定）。間隔のチェックとは独立した判定で、Free/Proで差はつけない
//（保障の有無はinterval判定後に別途ANDで評価するので、Pro/Freeどちらでも同じ節目で発火する）。
export const KUWAGATA_RARE_GUARANTEE_MILESTONE = 50;

// Free会員の棚の表示枠数上限（新種の水槽のみが対象。既知種5種は対象外、常に全部表示する——
// テッペンクワたんのような後半の目玉個体が上限で隠れる事故を避けるため。design doc
// 「Free/Proの扱い」参照）。採集自体・個体の保有（DB上のデータ）はFreeでも一切制限しない。
export const FREE_SHELF_NEW_SPECIES_TANK_CAP = 10;

// 個体差：サイズのスケール幅（原画に対する倍率）。
const SIZE_SCALE_MIN = 0.8;
const SIZE_SCALE_MAX = 1.3;

// 大顎バリエーション数。アート未制作の段階では1（＝バリエーションなし）にしておき、
// パーツが揃い次第この値を増やす。
const MANDIBLE_VARIANT_COUNT = 1;

// 新種のみ意味を持つレア度。既知種は常に"コモン"（既定値のまま、判定には使わない）。
export type KuwagataRarity = "コモン" | "レア" | "激レア";

// 通常の重み付け抽選で使う重み（合計100になるよう設計しているが、合計自体は厳密に100で
// なくてもよい——Math.random()の比較に使うだけなので、相対比が合っていれば十分）。
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
  // "pro"の種類は、Freeユーザーの採集ロールプール・エリアコンプリート判定の両方から除外される
  // （2026-10-01追加：Pro枠として設計した種類がFreeでも普通に捕まえられてしまうバグに対応）。
  minPlan: "free" | "pro";
};

export type KuwagataIndividual = {
  id: string;
  speciesId: string;
  speciesName: string;
  speciesKind: "known" | "new";
  speciesRarity: KuwagataRarity;
  // 棚UIで水中アクアリウム表示にするかどうかの判定に使う（既知種はnull）。
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

// 脱皮ステージの日数しきい値（初期仮値、実際の見た目ができてから調整する前提）。
// obtained_atからの経過日数がこの値未満なら該当ステージ、以上なら次のステージに進む。
const GROWTH_STAGE_DAY_THRESHOLDS: { stage: KuwagataGrowthStage; maxDays: number }[] = [
  { stage: "卵", maxDays: 3 },
  { stage: "幼虫", maxDays: 10 },
  { stage: "蛹", maxDays: 14 },
];

// 個体の脱皮ステージ（卵→幼虫→蛹→成虫）を判定する。
// テッペンクワたんはhatched_atが設定されていれば、経過日数を無視して無条件で成虫扱いにする
// （Stage5卒業＝ロードマップ完走の瞬間に強制的に羽化する、他の4種とは異なる特別な個体のため。
// 詳細は_reference/kuwagata-motif-exploration.md参照）。
// なお、サイズ・体重（size_scale）はこの上書きの対象外——強制羽化した直後でも、
// 「見た目は成虫だがまだ小柄」という自然な成長カーブのまま表示する（2026-10-01決定）。
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
  // aquarium（Pro限定の水中アクアリウム表示エリア）の種類かどうかをUI側で判定するために使う。
  speciesAreaCode: KuwagataAreaCode | null;
  tankNumber: number;
  individuals: KuwagataShelfIndividual[];
};

export type KuwagataShelfResult = {
  tanks: KuwagataShelfTank[];
  // Free会員向けの表示枠上限（FREE_SHELF_NEW_SPECIES_TANK_CAP、新種のみ対象）に引っかかって
  // 非表示にした棚の数。0ならPro会員、または上限にまだ達していない。
  hiddenNewSpeciesTankCount: number;
};

// 棚UI用：ユーザーの個体を種類ごとにグルーピングし、「棚」単位に組み立てる。
// 棚番号＝その種類を初めて採集した順（getUserKuwagataIndividualsがobtained_at昇順のため、
// Map挿入順＝初回採集順がそのまま棚番号の順序になる）。
// Free会員は新種の棚だけFREE_SHELF_NEW_SPECIES_TANK_CAP件までに絞る（既知種5種は対象外、
// 常に全部表示する）。採集ロールの対象プール自体は絞らない——あくまで棚の「見せ方」の上限。
export async function getKuwagataShelfTanks(userId: string): Promise<KuwagataShelfResult> {
  const [individuals, plan] = await Promise.all([getUserKuwagataIndividuals(userId), getPlan(userId)]);

  const bySpecies = new Map<string, KuwagataShelfTank>();
  for (const individual of individuals) {
    const shelfIndividual: KuwagataShelfIndividual = {
      ...individual,
      growthStage: getIndividualGrowthStage(individual),
    };

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

  const allTanks = Array.from(bySpecies.values());
  if (plan !== "free") {
    return { tanks: allTanks, hiddenNewSpeciesTankCount: 0 };
  }

  const known = allTanks.filter((t) => t.speciesKind === "known");
  const newOnes = allTanks.filter((t) => t.speciesKind === "new");
  const visibleNewOnes = newOnes.slice(0, FREE_SHELF_NEW_SPECIES_TANK_CAP);
  const hiddenNewSpeciesTankCount = newOnes.length - visibleNewOnes.length;

  // 表示順は棚番号（初回採集順）通りに保つため、絞った後に番号で並べ直す。
  const tanks = [...known, ...visibleNewOnes].sort((a, b) => a.tankNumber - b.tankNumber);

  return { tanks, hiddenNewSpeciesTankCount };
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
      "id, species_id, obtained_via, obtained_at, size_scale, mandible_variant, hatched_at, kuwagata_species(name, kind, rarity, area_code)"
    )
    .eq("user_id", userId)
    .order("obtained_at", { ascending: true });

  if (error) {
    throw new Error(`採集個体の取得に失敗しました: ${error.message}`);
  }

  return (data ?? []).map((row) => {
    // Supabaseの型生成を通していないため、joinしたネスト行はunknown経由でキャストする。
    const species = row.kuwagata_species as unknown as {
      name: string;
      kind: string;
      rarity: string;
      area_code: string | null;
    } | null;
    return {
      id: row.id as string,
      speciesId: row.species_id as string,
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

// 解放済みエリア一覧を取得する。エリア1は誰でも最初から解放済み扱い（DBに行がなくても解放とみなす）。
// aquarium（Pro限定の新エリア）はkuwagata_area_unlocksに行を持たず、本編の解放連鎖とも無関係。
// Proであれば常に解放済み、Freeなら常に未解放として動的に判定する。
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

// 図鑑画面用：エリアごとの新種コンプリート進捗。
// Pro限定種（min_plan='pro'）はFreeユーザーからは採集できないため、Freeの場合は
// コンプリート判定の分母（totalNewSpeciesCount）からも除外する（さもないとFreeユーザーが
// 絶対に埋められない種類が混ざり、次エリアが永遠に解放されなくなってしまう）。
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
  // 発見済みの場合のみ、最初の1匹（ソート上は最古個体）の入手情報を持つ。
  firstObtainedAt: string | null;
  firstObtainedVia: KuwagataIndividual["obtainedVia"] | null;
  // trueなら、Pro限定種をFreeプランで見ている状態。カード自体は表示するが、
  // 「そのうち会えるかも」ではなく「Proにすると出会える」という文言にするためのフラグ
  // （採集プール自体から除外済みなので、discoveredは常にfalseになる）。
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
  // 既知種（クワたんシリーズ）はエリアに紐づかないため、タブとは別の固定セクションにする。
  known: KuwagataEncyclopediaEntry[];
  areas: KuwagataEncyclopediaArea[];
};

// 図鑑UI用：種類ごとの発見状況（発見済みなら初回入手情報つき）をまとめる。
// 棚（getKuwagataShelfTanks）は「個体」単位、図鑑は「種類」単位で見せ方の役割が異なるため、
// あえて別の集計関数として用意している（_reference/kuwagata-motif-exploration.md「UI構成」参照）。
export async function getKuwagataEncyclopedia(userId: string): Promise<KuwagataEncyclopedia> {
  const [species, individuals, unlockedAreas, plan] = await Promise.all([
    getKuwagataSpeciesList(),
    getUserKuwagataIndividuals(userId),
    getUnlockedAreas(userId),
    getPlan(userId),
  ]);

  // individualsはobtained_at昇順のため、Map.set()を素直に繰り返せば最終的に残るのは
  // 「最も遅い」個体になってしまう。初回個体を残すため、まだ登録されていないものだけ設定する。
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
  // aquariumは本編4エリアとは別枠（Pro限定・解放連鎖とは無関係）なので、
  // KUWAGATA_AREA_ORDERには含めず、戻り値のareas配列の末尾に追加する形にする。
  const areaCodesWithAquarium: KuwagataAreaCode[] = [...KUWAGATA_AREA_ORDER, AQUARIUM_AREA_CODE];
  const areas: KuwagataEncyclopediaArea[] = areaCodesWithAquarium.map((areaCode) => {
    const entries = species.filter((s) => s.kind === "new" && s.areaCode === areaCode).map(toEntry);
    // コンプリート進捗の分母・分子は、Freeから見て採れる可能性がある種類だけで数える
    // （Pro限定種はproLocked=trueになり、discoveredCount/totalCountどちらにも含めない）。
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

// Stageクリア時の確定採集（既知種の初回個体）。同じ既知種を二重に確定入手させないよう、
// 既にstage_clear経由の個体を持っていれば何もしない（べき等）。
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

// 重み付き抽選。コモン/レア/激レアの重み（KUWAGATA_RARITY_WEIGHT）で1件選ぶ。
// pool内に存在しないレア度の重みは自動的に無視される（候補が無いレア度は当たらない）。
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

// 採集フロー（2026-10-01見直し）の中核：プレイヤーが選んだ1エリアのプールだけから1匹抽選する。
// 旧rollAreaCatchと違い、(1)全エリア混合ではなく指定エリアだけに閉じたプール、
// (2)呼び出し元でpending_catch_count等のチャンス消費を済ませてから呼ぶ前提（ここでは消費しない）、
// (3)guaranteedRareがtrueのときはプールをレア以上に絞る（該当が無ければ通常プールにフォールバック）。
// 「〇〇をゲットした！」の結果画面用に、選ばれた種類とguaranteedRareだったかを返す。
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

  // Pro限定種（min_plan='pro'）はFreeユーザーの抽選プールから除外する
  // （2026-10-01追加：もともとは表示枠だけの制限だったが、Pro専用に設計した種類を
  // Freeでも普通に引けてしまうのは意図と違うため、プール自体を絞ることにした）。
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

  const { error: insertError } = await supabaseAdmin.from("kuwagata_individuals").insert({
    user_id: userId,
    species_id: picked.id,
    obtained_via: "roll",
    size_scale: randomBetween(SIZE_SCALE_MIN, SIZE_SCALE_MAX),
    mandible_variant: Math.floor(Math.random() * MANDIBLE_VARIANT_COUNT) + 1,
  });

  if (insertError) {
    throw new Error(`採集の登録に失敗しました: ${insertError.message}`);
  }

  await maybeUnlockNextArea(userId, picked.areaCode);

  return { species: picked, guaranteedRare: guaranteedRare && rarePool.length > 0 };
}

// 新種を1匹採集した後、そのエリアの新種を全種コンプリートしていれば次のエリアを解放する。
async function maybeUnlockNextArea(userId: string, justCaughtAreaCode: KuwagataAreaCode | null): Promise<void> {
  if (!justCaughtAreaCode) return; // 既知種の合流枠だった場合はエリア解放判定に無関係。
  // aquariumは本編の解放連鎖（KUWAGATA_AREA_ORDER）に含まれない独立エリアなので無関係
  // （indexOfが-1になり、そのままだと誤ってarea1を「次のエリア」とみなしてしまうため明示的に除外）。
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

// 棚ページ等で「採集に出かけよう」の入口を出すかどうかの判定に使う。
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

// totalMasteredCountの更新後に呼ぶ。ちょうど間隔の倍数に達した回だけ「採集チャンス」を1つ
// ストックする（2026-10-01見直し：以前はここで即時ロールしていたが、プレイヤーが自分で
// エリアを選んで出かける方式に変更したため、ここではチャンスを積むだけで抽選はしない）。
// Pro会員は間隔がKUWAGATA_MASTERED_COUNT_ROLL_INTERVAL_PRO（半分）になり、同じ練習量でも
// 単純に2倍の頻度でチャンスが貯まる（#257、採集ロールのボーナス）。
// 節目（KUWAGATA_RARE_GUARANTEE_MILESTONEの倍数）に達した回のチャンスは、レア以上保障として
// 別カウントにも加算する（レア度システム、2026-10-01設計確定）。
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

// プレイヤーが「採集に出かける」を選んだときに呼ぶ本体。ストックされたチャンスを1つ消費し
//（レア以上保障のチャンスがあればそれを優先的に消費する）、goCatchInAreaで実際の抽選を行う。
// チャンスが無い場合はnullを返す（呼び出し側でエラー表示に使う）。
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

// テッペンクワたん専用：Stage5卒業（ロードマップ完走）の瞬間に、卵で持っている個体を
// 強制的に成虫へ羽化させる。他の4種は obtained_at からの経過日数で成長段階を動的計算するが、
// テッペンクワたんだけは「ロードマップを完走した瞬間」という特別な契機で羽化するため、
// hatched_at を立てることで成長段階の計算を上書きする（表示側の分岐は棚UI実装時に対応）。
// 呼び出し側（reportStage5Turn）でのstage5卒業判定がまだの個体には何もしない、
// 既に羽化済みの個体には再設定しない、の二重にべき等。
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
