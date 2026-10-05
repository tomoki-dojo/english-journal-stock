import { supabaseAdmin } from "@/lib/supabase/server";
import { addLoginGrowthBoost, KUWAGATA_LOGIN_BOOST_DAYS } from "@/lib/supabase/kuwagata";

export type ArthurTrivia = { id: string; body: string };

// 「今日」は日本時間の日付で数える（1日1回の豆知識の区切り）。
function todayInJapan(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Tokyo" }).format(new Date());
}

// 今日まだ見ていなければ、採用済みの豆知識から1件選ぶ（まだ見ていないものを優先。全部見たら全体から）。
export async function getTodaysTrivia(userId: string): Promise<ArthurTrivia | null> {
  const { data: today } = await supabaseAdmin
    .from("arthur_trivia_seen")
    .select("trivia_id")
    .eq("user_id", userId)
    .eq("seen_on", todayInJapan())
    .maybeSingle();
  if (today) return null;

  const [{ data: approved }, { data: seen }] = await Promise.all([
    supabaseAdmin.from("arthur_trivia").select("id").eq("status", "approved").limit(5000),
    supabaseAdmin.from("arthur_trivia_seen").select("trivia_id").eq("user_id", userId).limit(5000),
  ]);
  const approvedIds = (approved ?? []).map((row) => row.id as string);
  if (approvedIds.length === 0) return null;

  const seenIds = new Set((seen ?? []).map((row) => row.trivia_id as string));
  const unseenIds = approvedIds.filter((id) => !seenIds.has(id));
  const pool = unseenIds.length > 0 ? unseenIds : approvedIds;
  const pickedId = pool[Math.floor(Math.random() * pool.length)];

  const { data: picked } = await supabaseAdmin
    .from("arthur_trivia")
    .select("id, body")
    .eq("id", pickedId)
    .maybeSingle();
  return picked ? { id: picked.id as string, body: picked.body as string } : null;
}

// 豆知識を読み終えたとき。今日の既読として記録し、初めて記録できたときだけ、
// 育成中のクワたんにログインのご褒美（少量の成長ブースト）を加える。
export async function markTriviaSeen(userId: string, triviaId: string): Promise<void> {
  const { data: trivia } = await supabaseAdmin
    .from("arthur_trivia")
    .select("id")
    .eq("id", triviaId)
    .eq("status", "approved")
    .maybeSingle();
  if (!trivia) return;

  const { data: inserted, error } = await supabaseAdmin
    .from("arthur_trivia_seen")
    .upsert(
      { user_id: userId, seen_on: todayInJapan(), trivia_id: triviaId },
      { onConflict: "user_id,seen_on", ignoreDuplicates: true },
    )
    .select("user_id");
  if (error) throw new Error(`豆知識の既読保存に失敗しました: ${error.message}`);

  if ((inserted?.length ?? 0) > 0) {
    try {
      await addLoginGrowthBoost(userId, KUWAGATA_LOGIN_BOOST_DAYS);
    } catch {
      // ブーストの加算に失敗しても、既読の保存は成功させる
    }
  }
}
