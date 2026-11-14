import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import {
  SHARE_CARD_BUCKET,
  SHARE_CARD_DAILY_LIMIT,
  SHARE_CARD_MAX_BYTES,
  newShareCardId,
  ownerPrefix,
} from "@/lib/share-card-store";

// シェアカード（横長PNG、リンクのプレビュー用）を受け取って公開バケットに置き、リンク用のIDを返す。
// ゲスト（匿名ログイン）も使える（最初の採集をシェアしてもらうため）。1人1日 SHARE_CARD_DAILY_LIMIT 枚まで。
export const dynamic = "force-dynamic";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "ログインが必要です" }, { status: 401 });

  const buf = Buffer.from(await request.arrayBuffer());
  if (buf.length === 0 || buf.length > SHARE_CARD_MAX_BYTES) {
    return NextResponse.json({ error: "画像の大きさが不正です" }, { status: 400 });
  }
  if (!PNG_SIGNATURE.every((b, i) => buf[i] === b)) {
    return NextResponse.json({ error: "PNGではありません" }, { status: 400 });
  }

  // 1日の枚数を数える（自分の印のフォルダの、直近24時間のファイル）
  const prefix = ownerPrefix(user.id);
  const { data: existing } = await supabaseAdmin.storage
    .from(SHARE_CARD_BUCKET)
    .list(prefix, { limit: 200, sortBy: { column: "created_at", order: "desc" } });
  const since = Date.now() - 24 * 60 * 60 * 1000;
  const today = (existing ?? []).filter((o) => o.created_at && Date.parse(o.created_at) > since).length;
  if (today >= SHARE_CARD_DAILY_LIMIT) {
    return NextResponse.json({ error: "今日はこれ以上シェアカードを作れません" }, { status: 429 });
  }

  const { id, objectPath } = newShareCardId(user.id);
  const { error } = await supabaseAdmin.storage.from(SHARE_CARD_BUCKET).upload(objectPath, buf, {
    contentType: "image/png",
    cacheControl: "31536000",
    upsert: false,
  });
  if (error) {
    console.error("[share-card]", error.message);
    return NextResponse.json({ error: "保存に失敗しました" }, { status: 500 });
  }
  return NextResponse.json({ id }, { headers: { "Cache-Control": "no-store" } });
}
