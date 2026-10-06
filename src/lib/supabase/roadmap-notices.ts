import { supabaseAdmin } from "@/lib/supabase/server";
import {
  ANNOUNCEMENTS,
  LATEST_ANNOUNCEMENT_ID,
  type RoadmapAnnouncement,
  type RoadmapNewEgg,
  type RoadmapNewHatch,
  type RoadmapStageUp,
} from "@/lib/roadmap-notices";
import { getLoginStageUps, getUncelebratedEggs, getUncelebratedHatches } from "@/lib/supabase/kuwagata";
import { getTodaysTrivia, type ArthurTrivia } from "@/lib/supabase/arthur-trivia";
import { grantMilestoneEggs } from "@/lib/supabase/kuwagata-egg-events";

export type RoadmapNotices = {
  showAdvice: boolean;
  announcements: RoadmapAnnouncement[];
  // まだ「手に入れた！」演出を見せていない新しいタマゴ（Stage解放・サインアップ時の確定入手）
  newEggs: RoadmapNewEgg[];
  // まだ「羽化した！」演出を見せていない個体（Stage5卒業）
  newHatches: RoadmapNewHatch[];
  // 日数がたって成長段階が上がったのに、まだ演出を見せていないクワたん
  stageUps: RoadmapStageUp[];
  // 今日まだ見ていない、アーサーの豆知識（お知らせのあとに1日1回）。初回ユーザーには出さない。
  trivia: ArthurTrivia | null;
};

// 部屋に入ったときに出すポップアップ（初回アドバイス・未読のお知らせ）を決める。
// 初回ユーザーにはアドバイスだけを出し、過去のお知らせは見せない（アドバイスを閉じた時点で最新まで既読にする）。
export async function getRoadmapNotices(
  userId: string,
): Promise<RoadmapNotices> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("roadmap_advice_seen_at, roadmap_last_seen_announcement_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return { showAdvice: false, announcements: [], newEggs: [], newHatches: [], stageUps: [], trivia: null };

  // 練習日数・習得数の節目のタマゴを先に配って、そのまま「手に入れた！」の演出に載せる。
  await grantMilestoneEggs(userId).catch(() => {});

  const [newEggs, newHatches, stageUps] = await Promise.all([
    getUncelebratedEggs(userId),
    getUncelebratedHatches(userId),
    getLoginStageUps(userId).catch(() => []),
  ]);

  if (!data.roadmap_advice_seen_at)
    return { showAdvice: true, announcements: [], newEggs, newHatches, stageUps: [], trivia: null };

  const lastSeen = data.roadmap_last_seen_announcement_id ?? 0;
  const trivia = await getTodaysTrivia(userId).catch(() => null);
  return {
    showAdvice: false,
    announcements: ANNOUNCEMENTS.filter((a) => a.id > lastSeen),
    newEggs,
    newHatches,
    stageUps,
    trivia,
  };
}

export async function markAdviceSeen(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({
      roadmap_advice_seen_at: new Date().toISOString(),
      roadmap_last_seen_announcement_id: LATEST_ANNOUNCEMENT_ID,
    })
    .eq("user_id", userId)
    .select("user_id");
  if (error)
    throw new Error(`アドバイスの既読保存に失敗しました: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function markAnnouncementSeen(
  userId: string,
  announcementId: number,
): Promise<boolean> {
  const { data: current } = await supabaseAdmin
    .from("profiles")
    .select("roadmap_last_seen_announcement_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!current) return false;

  const next = Math.max(
    current.roadmap_last_seen_announcement_id ?? 0,
    announcementId,
  );
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ roadmap_last_seen_announcement_id: next })
    .eq("user_id", userId);
  if (error)
    throw new Error(`お知らせの既読保存に失敗しました: ${error.message}`);
  return true;
}
