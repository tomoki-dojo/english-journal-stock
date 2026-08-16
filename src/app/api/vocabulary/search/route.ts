import { NextResponse } from "next/server";
import { searchPublishedVocabulary } from "@/lib/supabase/vocabulary";
import { VOCABULARY_PAGE_SIZE } from "@/lib/pagination-constants";
import { VocabLevelValues, ExamTagValues } from "@/components/vocabulary/types";

// 単語帳一覧（/vocabulary, /library）のサーバー側検索・ページネーション用API。
// 閲覧自体はログイン不要（Free/Pro問わず全員利用可能）なので認証チェックはしない。
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const keyword = searchParams.get("keyword") ?? undefined;

  const levelParam = searchParams.get("level");
  const level =
    levelParam && (VocabLevelValues as readonly string[]).includes(levelParam)
      ? levelParam
      : undefined;

  const examParam = searchParams.get("exam");
  const examTag =
    examParam && (ExamTagValues as readonly string[]).includes(examParam) ? examParam : undefined;

  const pageParam = Number(searchParams.get("page"));
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;

  try {
    const result = await searchPublishedVocabulary({
      keyword,
      level,
      examTag,
      page,
      pageSize: VOCABULARY_PAGE_SIZE,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "単語検索に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
