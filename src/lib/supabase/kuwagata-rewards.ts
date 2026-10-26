// Stage4・Stage5の全シーン習得による、金・銀の縁と特別アクションの解放。
import { supabaseAdmin } from "@/lib/supabase/server";
import { ITEM_TYPE_RIM, type RimKey } from "@/lib/kuwagata-tint";
import { DECOS, ITEM_TYPE_DECO } from "@/lib/kuwagata-decos";
import { LIMITED_SPECIES_CODES } from "@/lib/kuwagata-limited";
import type { ActionFlags } from "@/lib/kuwagata-actions";
import {
  getKuwagataSpeciesList,
  getIndividualGrowthStage,
  getUserKuwagataIndividuals,
} from "@/lib/supabase/kuwagata";
import { createGrantedKeysLoader, type LoadGrantedKeys } from "@/lib/supabase/kuwagata-egg-events";

// Stage4の日常編のシーン（speaking-roadmap.ts の DAILY_SCENE_TAGS と同じ）。
const STAGE4_DAILY_SCENES = ["買い物", "外食", "旅行", "友人", "体調"];

type Progress = {
  stage4Daily: boolean;
  stage4Business: boolean;
  stage5Daily: boolean;
  stage5Business: boolean;
};

// 公開中のシナリオを、日常・ビジネス別にすべて習得したかを調べる（シナリオが1つも無い区分は未達成）。
async function loadCompletion(userId: string): Promise<Progress> {
  const [s4, s5, progress] = await Promise.all([
    supabaseAdmin.from("stage4_scenarios").select("id, scene_tag").eq("publish_status", "公開"),
    supabaseAdmin.from("stage5_scenarios").select("id, track").eq("publish_status", "公開"),
    supabaseAdmin
      .from("speaking_stage_progress")
      .select("stage, phrase_id")
      .eq("user_id", userId)
      .in("stage", [4, 5])
      .in("phrase_source", ["stage4_scenario", "stage5_scenario"])
      .eq("status", "習得済み"),
  ]);
  if (s4.error || s5.error || progress.error) {
    throw new Error("習得状況の取得に失敗しました");
  }
  const mastered = new Set((progress.data ?? []).map((row) => row.phrase_id as string));
  const allMastered = (ids: string[]) => ids.length > 0 && ids.every((id) => mastered.has(id));

  const s4Rows = (s4.data ?? []) as { id: string; scene_tag: string }[];
  const s5Rows = (s5.data ?? []) as { id: string; track: string }[];
  return {
    stage4Daily: allMastered(s4Rows.filter((r) => STAGE4_DAILY_SCENES.includes(r.scene_tag)).map((r) => r.id)),
    stage4Business: allMastered(s4Rows.filter((r) => !STAGE4_DAILY_SCENES.includes(r.scene_tag)).map((r) => r.id)),
    stage5Daily: allMastered(s5Rows.filter((r) => r.track === "日常").map((r) => r.id)),
    stage5Business: allMastered(s5Rows.filter((r) => r.track === "ビジネス").map((r) => r.id)),
  };
}

// 特別アクションの解放状況（棚の水槽で、個体がどのアクションを見せられるか）。
export async function getActionFlags(userId: string): Promise<ActionFlags> {
  const [completion, individuals, species] = await Promise.all([
    loadCompletion(userId),
    getUserKuwagataIndividuals(userId),
    getKuwagataSpeciesList(),
  ]);
  const publishedLimited = LIMITED_SPECIES_CODES.filter((code) => species.some((s) => s.code === code));
  const ownedCodes = new Set(individuals.map((i) => i.speciesCode));
  return {
    daily: completion.stage5Daily ? 2 : completion.stage4Daily ? 1 : 0,
    business: completion.stage5Business ? 2 : completion.stage4Business ? 1 : 0,
    // 限定種8種すべてが公開されていて、全部持っているとき
    limitedComplete:
      publishedLimited.length === LIMITED_SPECIES_CODES.length && publishedLimited.every((c) => ownedCodes.has(c)),
  };
}

// Stage4の全シーン習得で銀の縁、Stage5の全シーン習得で金の縁を1つずつ渡す（部屋に入ったときに呼ぶ）。
// 台帳（kuwagata_egg_events）に「rim:silver」「rim:gold」を記録して二重には渡さない。
export async function grantRimItems(userId: string, loadGrantedKeys?: LoadGrantedKeys): Promise<void> {
  const grantedKeys = await (loadGrantedKeys ?? createGrantedKeysLoader(userId))();
  const wantSilver = !grantedKeys.has("rim:silver");
  const wantGold = !grantedKeys.has("rim:gold");
  if (!wantSilver && !wantGold) return;

  const completion = await loadCompletion(userId);
  const targets: RimKey[] = [];
  if (wantSilver && completion.stage4Daily && completion.stage4Business) targets.push("silver");
  if (wantGold && completion.stage5Daily && completion.stage5Business) targets.push("gold");

  for (const rim of targets) {
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("kuwagata_egg_events")
      .upsert({ user_id: userId, event_key: `rim:${rim}` }, { onConflict: "user_id,event_key", ignoreDuplicates: true })
      .select("event_key");
    if (claimError) throw new Error(`縁の配布記録に失敗しました: ${claimError.message}`);
    if ((claimed?.length ?? 0) === 0) continue; // 別の画面が先に渡した。

    const { error } = await supabaseAdmin.rpc("grant_kuwagata_item", {
      p_user_id: userId,
      p_item_type: ITEM_TYPE_RIM,
      p_item_key: rim,
      p_amount: 1,
    });
    if (error) {
      await supabaseAdmin.from("kuwagata_egg_events").delete().eq("user_id", userId).eq("event_key", `rim:${rim}`);
      throw new Error(`縁の付与に失敗しました: ${error.message}`);
    }
  }
}

// 縁を1つ使って、個体に付ける。成虫だけ。付け替え（銀→金）はできるが、元には戻せない。
// 成功したらtrue。縁が無い・本人の成虫でない場合はfalse（縁は減らさない）。
export async function applyRimToIndividual(userId: string, individualId: string, rim: RimKey): Promise<boolean> {
  const individuals = await getUserKuwagataIndividuals(userId);
  const target = individuals.find((individual) => individual.id === individualId);
  if (!target || getIndividualGrowthStage(target) !== "成虫") return false;
  if (target.rimKey === rim) return false; // すでに同じ縁

  const { data: consumed, error: consumeError } = await supabaseAdmin.rpc("consume_kuwagata_item", {
    p_user_id: userId,
    p_item_type: ITEM_TYPE_RIM,
    p_item_key: rim,
  });
  if (consumeError) throw new Error(`縁の消費に失敗しました: ${consumeError.message}`);
  if (!consumed) return false;

  const { error: updateError } = await supabaseAdmin
    .from("kuwagata_individuals")
    .update({ rim_key: rim })
    .eq("id", individualId)
    .eq("user_id", userId);
  if (updateError) {
    await supabaseAdmin.rpc("grant_kuwagata_item", {
      p_user_id: userId,
      p_item_type: ITEM_TYPE_RIM,
      p_item_key: rim,
      p_amount: 1,
    });
    throw new Error(`縁の保存に失敗しました: ${updateError.message}`);
  }
  return true;
}


// シーンごとに、公開中のシナリオをすべて習得したら置物を1点渡す（部屋に入ったときに呼ぶ）。
// 台帳（kuwagata_egg_events）に「deco:<キー>」を記録して二重には渡さない。習得済みのユーザーには、さかのぼって渡す。
export async function grantDecoItems(userId: string, loadGrantedKeys?: LoadGrantedKeys): Promise<void> {
  const grantedKeys = await (loadGrantedKeys ?? createGrantedKeysLoader(userId))();
  const pending = DECOS.filter((d) => !grantedKeys.has(`deco:${d.key}`));
  if (pending.length === 0) return;

  const [s4, s5, progress] = await Promise.all([
    supabaseAdmin.from("stage4_scenarios").select("id, scene_tag").eq("publish_status", "公開"),
    supabaseAdmin.from("stage5_scenarios").select("id, scene_tag").eq("publish_status", "公開"),
    supabaseAdmin
      .from("speaking_stage_progress")
      .select("phrase_id")
      .eq("user_id", userId)
      .in("stage", [4, 5])
      .in("phrase_source", ["stage4_scenario", "stage5_scenario"])
      .eq("status", "習得済み"),
  ]);
  if (s4.error || s5.error || progress.error) throw new Error("習得状況の取得に失敗しました");
  const mastered = new Set((progress.data ?? []).map((row) => row.phrase_id as string));
  const idsOf = (rows: { id: string; scene_tag: string }[] | null, scene: string) =>
    (rows ?? []).filter((r) => r.scene_tag === scene).map((r) => r.id);

  for (const deco of pending) {
    const ids = idsOf((deco.stage === 4 ? s4.data : s5.data) as { id: string; scene_tag: string }[] | null, deco.scene);
    if (ids.length === 0 || !ids.every((id) => mastered.has(id))) continue;

    const eventKey = `deco:${deco.key}`;
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("kuwagata_egg_events")
      .upsert({ user_id: userId, event_key: eventKey }, { onConflict: "user_id,event_key", ignoreDuplicates: true })
      .select("event_key");
    if (claimError) throw new Error(`置物の配布記録に失敗しました: ${claimError.message}`);
    if ((claimed?.length ?? 0) === 0) continue;

    const { error } = await supabaseAdmin.rpc("grant_kuwagata_item", {
      p_user_id: userId,
      p_item_type: ITEM_TYPE_DECO,
      p_item_key: deco.key,
      p_amount: 1,
    });
    if (error) {
      await supabaseAdmin.from("kuwagata_egg_events").delete().eq("user_id", userId).eq("event_key", eventKey);
      throw new Error(`置物の付与に失敗しました: ${error.message}`);
    }
  }
}

export type PlacedDeco = { itemKey: string; tankId: string; u: number; v: number };

export async function getPlacedDecos(userId: string): Promise<PlacedDeco[]> {
  const { data, error } = await supabaseAdmin
    .from("kuwagata_tank_decorations")
    .select("item_key, tank_id, u, v")
    .eq("user_id", userId);
  if (error) throw new Error(`置物の配置の取得に失敗しました: ${error.message}`);
  return (data ?? []).map((row) => ({
    itemKey: row.item_key as string,
    tankId: row.tank_id as string,
    u: Number(row.u),
    v: Number(row.v),
  }));
}

// 置物を水槽に置く（すでに別の水槽にあれば移す）。持っていない・水槽が満杯ならfalse。
export async function placeDeco(userId: string, itemKey: string, tankId: string, u: number, v: number, maxPerTank: number): Promise<boolean> {
  // 石・エサ(base:...)は持ち物ではなく、数の上限にも含めない。位置だけ保存する。
  if (!itemKey.startsWith("base:")) {
    const { data: owned, error: ownedError } = await supabaseAdmin
      .from("kuwagata_user_items")
      .select("quantity")
      .eq("user_id", userId)
      .eq("item_type", ITEM_TYPE_DECO)
      .eq("item_key", itemKey)
      .maybeSingle();
    if (ownedError) throw new Error(`持ち物の取得に失敗しました: ${ownedError.message}`);
    if (!owned || Number(owned.quantity) < 1) return false;

    const placed = await getPlacedDecos(userId);
    const inTank = placed.filter((p) => p.tankId === tankId && p.itemKey !== itemKey && !p.itemKey.startsWith("base:"));
    if (inTank.length >= maxPerTank) return false;
  }

  const { error } = await supabaseAdmin
    .from("kuwagata_tank_decorations")
    .upsert({ user_id: userId, item_key: itemKey, tank_id: tankId, u, v, placed_at: new Date().toISOString() }, { onConflict: "user_id,item_key" });
  if (error) throw new Error(`置物の配置に失敗しました: ${error.message}`);
  return true;
}

export async function removeDeco(userId: string, itemKey: string): Promise<void> {
  const { error } = await supabaseAdmin.from("kuwagata_tank_decorations").delete().eq("user_id", userId).eq("item_key", itemKey);
  if (error) throw new Error(`置物を外せませんでした: ${error.message}`);
}
