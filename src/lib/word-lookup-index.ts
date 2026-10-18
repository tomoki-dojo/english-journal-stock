// 単語タップ(word-lookup)用の索引。quiz_wordsの有効な全語を小文字の綴りで引けるようにして、メモリに5分持つ。
// タップのたびにDBを引かず、苦手フラグ(ユーザー個別)の確認だけがDBアクセスになる。
import { supabaseAdmin } from "@/lib/supabase/server";
import { fetchAllRows } from "@/lib/supabase/fetch-all";
import { ttlCached } from "@/lib/ttl-cache";

export type LookupWordRow = {
  id: string;
  word_en: string;
  part_of_speech: string | null;
  meaning_ja: string;
  other_meanings_ja: string[] | null;
  note_ja: string | null;
  quiz_enabled: boolean;
};

export const getWordLookupIndex = ttlCached(5 * 60 * 1000, async (): Promise<Map<string, LookupWordRow[]>> => {
  const rows = await fetchAllRows<LookupWordRow>((from, to) =>
    supabaseAdmin
      .from("quiz_words")
      .select("id, word_en, part_of_speech, meaning_ja, other_meanings_ja, note_ja, quiz_enabled")
      .eq("active", true)
      .order("code", { ascending: true })
      .range(from, to) as unknown as PromiseLike<{ data: LookupWordRow[] | null; error: { message: string } | null }>
  );
  const index = new Map<string, LookupWordRow[]>();
  for (const row of rows) {
    const key = row.word_en.toLowerCase();
    const list = index.get(key);
    if (list) list.push(row);
    else index.set(key, [row]);
  }
  return index;
});
