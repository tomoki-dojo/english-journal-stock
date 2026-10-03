import { supabaseAdmin } from "@/lib/supabase/server";
import { ANNOUNCEMENTS, LATEST_ANNOUNCEMENT_ID, type RoadmapAnnouncement } from "@/lib/roadmap-notices";

export type RoadmapNotices = {
  showAdvice: boolean;
  announcements: RoadmapAnnouncement[];
};

// 部屋に入ったときに出すポップアップ（初回アドバイス・未読のお知らせ）を決める。
// 初回ユーザーにはアドバイスだけを出し、過去のお知らせは見せない（アドバイスを閉じた時点で最新まで既読にする）。
export async function getRoadmapNotices(userId: string): Promise<RoadmapNotices> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("roadmap_advice_seen_at, roadmap_last_seen_announcement_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (!data) return { showAdvice: false, announcements: [] };

  if (!data.roadmap_advice_seen_at) return { showAdvice: true, announcements: [] };

  const lastSeen = data.roadmap_last_seen_announcement_id ?? 0;
  return { showAdvice: false, announcements: ANNOUNCEMENTS.filter((a) => a.id > lastSeen) };
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
  if (error) throw new Error(`アドバイスの既読保存に失敗しました: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export async function markAnnouncementSeen(userId: string, announcementId: number): Promise<boolean> {
  const { data: current } = await supabaseAdmin
    .from("profiles")
    .select("roadmap_last_seen_announcement_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!current) return false;

  const next = Math.max(current.roadmap_last_seen_announcement_id ?? 0, announcementId);
  const { error } = await supabaseAdmin
    .from("profiles")
    .update({ roadmap_last_seen_announcement_id: next })
    .eq("user_id", userId);
  if (error) throw new Error(`お知らせの既読保存に失敗しました: ${error.message}`);
  return true;
}
