import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // 静的ファイル・画像・音声・画像最適化・faviconなどは除外(音声が除外されていないと、未ログインやタイトル未通過のときにBGMがログイン画面へ飛ばされて鳴らない)
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp3|ogg|wav|m4a)$).*)",
  ],
};