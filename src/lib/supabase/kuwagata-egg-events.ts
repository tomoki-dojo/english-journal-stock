// 練習日数・習得数の節目で、既知種のタマゴを配る。
import { supabaseAdmin } from "@/lib/supabase/server";
import type { UserRoadmapState } from "@/components/roadmap/types";
import { getStreakStats, getUserRoadmapState } from "@/lib/supabase/speaking-roadmap";
import {
  KUWAGATA_RARE_GUARANTEE_MILESTONE,
  MANDIBLE_VARIANT_COUNT,
  getKuwagataSpeciesList,
  getUserKuwagataIndividuals,
} from "@/lib/supabase/kuwagata";

// 累計の練習日数（連続していなくてよい）の節目。最後の節目のあとは、REPEATごとに配る。
const PRACTICE_DAY_MILESTONES = [7, 14, 30, 60, 100, 150, 250, 365];
const PRACTICE_DAY_REPEAT = 100;

// 習得フレーズの累計の節目。最後の節目のあとは、REPEATごとに配る。
const MASTERED_MILESTONES = [30, 100, 200, 300, 500, 750, 1000];
const MASTERED_REPEAT = 500;

function reachedMilestones(value: number, milestones: number[], repeat: number): number[] {
  const reached = milestones.filter((m) => value >= m);
  for (let m = milestones[milestones.length - 1] + repeat; m <= value; m += repeat) reached.push(m);
  return reached;
}

// 習得数がレア確定の採集チャンスの節目（50の倍数）に達したことを、部屋に入ったときに1度だけ知らせる。
// 台帳（kuwagata_egg_events）に「rare:50」の形で記録して二重に出さない。
// 複数の節目をまとめて飛び越えた場合は、一番大きい節目だけ知らせる。
// 台帳(kuwagata_egg_events)の記録済みキーを返す。呼び出し側で1回だけ読んで共有するために使う。
export type LoadGrantedKeys = () => Promise<Set<string>>;

export function createGrantedKeysLoader(userId: string): LoadGrantedKeys {
  let cached: Promise<Set<string>> | null = null;
  return () => {
    cached ??= (async () => {
      const { data, error } = await supabaseAdmin
        .from("kuwagata_egg_events")
        .select("event_key")
        .eq("user_id", userId);
      if (error) throw new Error(`タマゴの配布記録の取得に失敗しました: ${error.message}`);
      return new Set((data ?? []).map((row) => row.event_key as string));
    })();
    return cached;
  };
}

export async function claimRareChanceNotice(
  userId: string,
  knownState?: UserRoadmapState | null,
  loadGrantedKeys?: LoadGrantedKeys
): Promise<number | null> {
  const state = knownState !== undefined ? knownState : await getUserRoadmapState(userId);
  if (!state) return null;

  const milestones: number[] = [];
  for (let m = KUWAGATA_RARE_GUARANTEE_MILESTONE; m <= state.totalMasteredCount; m += KUWAGATA_RARE_GUARANTEE_MILESTONE) {
    milestones.push(m);
  }
  if (milestones.length === 0) return null;

  const grantedKeys = await (loadGrantedKeys ?? createGrantedKeysLoader(userId))();
  const pending = milestones.filter((m) => !grantedKeys.has(`rare:${m}`));
  if (pending.length === 0) return null;

  let shown: number | null = null;
  for (const m of pending) {
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("kuwagata_egg_events")
      .upsert({ user_id: userId, event_key: `rare:${m}` }, { onConflict: "user_id,event_key", ignoreDuplicates: true })
      .select("event_key");
    if (claimError) throw new Error(`レア確定チャンスの通知記録に失敗しました: ${claimError.message}`);
    if ((claimed?.length ?? 0) > 0) shown = m;
  }
  return shown;
}

// 配る種類は、解放済みのStageに対応する既知種（最初のタマゴを持っているもの）からランダムに選ぶ。
// テッペンクワたん（Stage5）は対象外。
async function getEggSpeciesPool(userId: string) {
  const [species, individuals] = await Promise.all([getKuwagataSpeciesList(), getUserKuwagataIndividuals(userId)]);
  const ownedFirstEggIds = new Set(
    individuals.filter((i) => i.obtainedVia === "stage_clear").map((i) => i.speciesId)
  );
  return species.filter(
    (s) =>
      s.kind === "known" &&
      s.stageTrigger !== null &&
      s.stageTrigger >= 1 &&
      s.stageTrigger <= 4 &&
      ownedFirstEggIds.has(s.id)
  );
}

// 節目に達していて、まだ配っていないタマゴを配る（部屋に入ったときに呼ぶ）。
// 配った節目は台帳（kuwagata_egg_events）に記録するので、二重には配らない。
export async function grantMilestoneEggs(
  userId: string,
  known?: { state: UserRoadmapState | null; totalDays: number },
  loadGrantedKeys?: LoadGrantedKeys
): Promise<void> {
  const state = known ? known.state : await getUserRoadmapState(userId);
  if (!state) return;

  const totalDays = known ? known.totalDays : (await getStreakStats(userId)).totalDays;
  const eventKeys = [
    ...reachedMilestones(totalDays, PRACTICE_DAY_MILESTONES, PRACTICE_DAY_REPEAT).map((m) => `days:${m}`),
    ...reachedMilestones(state.totalMasteredCount, MASTERED_MILESTONES, MASTERED_REPEAT).map((m) => `mastered:${m}`),
  ];
  if (eventKeys.length === 0) return;

  const grantedKeys = await (loadGrantedKeys ?? createGrantedKeysLoader(userId))();
  const pending = eventKeys.filter((key) => !grantedKeys.has(key));
  if (pending.length === 0) return;

  const pool = await getEggSpeciesPool(userId);
  if (pool.length === 0) return;

  for (const eventKey of pending) {
    // 先に台帳へ記録して、同時に開いた別の画面と二重に配らないようにする。
    const { data: claimed, error: claimError } = await supabaseAdmin
      .from("kuwagata_egg_events")
      .upsert({ user_id: userId, event_key: eventKey }, { onConflict: "user_id,event_key", ignoreDuplicates: true })
      .select("event_key");
    if (claimError) throw new Error(`タマゴの配布記録に失敗しました: ${claimError.message}`);
    if ((claimed?.length ?? 0) === 0) continue; // 別の画面が先に配った。

    const species = pool[Math.floor(Math.random() * pool.length)];
    const { data: inserted, error: insertError } = await supabaseAdmin
      .from("kuwagata_individuals")
      .insert({
        user_id: userId,
        species_id: species.id,
        obtained_via: "event",
        size_scale: species.baseSize,
        mandible_variant: Math.floor(Math.random() * MANDIBLE_VARIANT_COUNT) + 1,
      })
      .select("id")
      .single();

    if (insertError || !inserted) {
      // タマゴを作れなかったときは記録を戻して、次の機会にやり直す。
      await supabaseAdmin.from("kuwagata_egg_events").delete().eq("user_id", userId).eq("event_key", eventKey);
      throw new Error(`節目のタマゴの登録に失敗しました: ${insertError?.message ?? "不明なエラー"}`);
    }

    await supabaseAdmin
      .from("kuwagata_egg_events")
      .update({ individual_id: inserted.id })
      .eq("user_id", userId)
      .eq("event_key", eventKey);
  }
}
