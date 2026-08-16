import { NextResponse } from "next/server";
import { searchPublishedExpressions } from "@/lib/supabase/expressions";
import { EXPRESSION_PAGE_SIZE } from "@/lib/pagination-constants";
import {
  SceneTagValues,
  FormalityValues,
  LevelValues,
  IntentTagValues,
  ExamTagValues,
} from "@/components/expressions/types";

// 表現ストック一覧（/vocabulary, /library）のサーバー側検索・ページネーション用API。
// 閲覧自体はログイン不要（Free/Pro問わず全員利用可能）なので認証チェックはしない。
// シーン・機能タグの絞り込みがPro限定なのはクライアント側（UIの出し分け）で担保しており、
// ここでは受け取った値をそのまま検索条件として使う（未ログイン/Freeでも値を渡すこと自体は禁止しない）。
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const keyword = searchParams.get("keyword") ?? undefined;

  const sceneParam = searchParams.get("scene");
  const sceneTag =
    sceneParam && (SceneTagValues as readonly string[]).includes(sceneParam)
      ? sceneParam
      : undefined;

  const formalityParam = searchParams.get("formality");
  const formality =
    formalityParam && (FormalityValues as readonly string[]).includes(formalityParam)
      ? formalityParam
      : undefined;

  const levelParam = searchParams.get("level");
  const level =
    levelParam && (LevelValues as readonly string[]).includes(levelParam) ? levelParam : undefined;

  const intentParam = searchParams.get("intent");
  const intentTag =
    intentParam && (IntentTagValues as readonly string[]).includes(intentParam)
      ? intentParam
      : undefined;

  const examParam = searchParams.get("exam");
  const examTag =
    examParam && (ExamTagValues as readonly string[]).includes(examParam) ? examParam : undefined;

  const pageParam = Number(searchParams.get("page"));
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;

  try {
    const result = await searchPublishedExpressions({
      keyword,
      sceneTag,
      formality,
      level,
      intentTag,
      examTag,
      page,
      pageSize: EXPRESSION_PAGE_SIZE,
    });
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "表現検索に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
