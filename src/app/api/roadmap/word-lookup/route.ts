import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { lemmaCandidates } from "@/lib/word-lemma";
import { getWordLookupIndex } from "@/lib/word-lookup-index";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// タップした英単語を単語ノート(quiz_words)から引く。活用形は原形候補に直して順に探す。AIは使わない。
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });
  }
  const raw = (new URL(request.url).searchParams.get("w") ?? "").trim().slice(0, 40);
  if (!/^[A-Za-z][A-Za-z'’-]*$/.test(raw)) {
    return NextResponse.json({ entry: null });
  }
  const candidates = lemmaCandidates(raw);
  if (candidates.length === 0) return NextResponse.json({ entry: null });

  // 単語マスタはメモリの索引から引く(大文字小文字は小文字に揃えて照合済み)。
  let index;
  try {
    index = await getWordLookupIndex();
  } catch {
    return NextResponse.json({ error: "取得に失敗しました" }, { status: 500 });
  }

  // 候補の優先順（入力そのまま→原形）で最初に見つかったものを返す
  for (const c of candidates) {
    const hit = index.get(c.toLowerCase()) ?? [];
    if (hit.length > 0) {
      const { data: flag } = await supabaseAdmin
        .from("quiz_word_weak_flags")
        .select("word_id")
        .eq("user_id", user.id)
        .in("word_id", hit.map((r) => r.id as string))
        .limit(1);
      return NextResponse.json(
        {
          entry: {
            wordId: hit[0].id as string,
            quizEnabled: hit[0].quiz_enabled as boolean,
            flagged: (flag ?? []).length > 0,
            word: hit[0].word_en,
            lemma: c !== raw.toLowerCase() ? c : null,
            // -ly/-er/-estで原形に戻した場合は、意味が少しずれることがあるので「派生」と示す。
            derived: c !== raw.toLowerCase() && /(ly|er|est|ier|iest)$/i.test(raw),
            senses: hit.map((r) => ({
              pos: r.part_of_speech as string | null,
              meaning: r.meaning_ja as string,
              others: (r.other_meanings_ja as string[] | null) ?? [],
              note: r.note_ja as string | null,
            })),
          },
        },
        { headers: { "Cache-Control": "no-store" } }
      );
    }
  }
  return NextResponse.json({ entry: null });
}
