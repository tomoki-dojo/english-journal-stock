import { NextResponse } from "next/server";
import { getRequestOrigin } from "@/lib/request-origin";
import { TITLE_SEEN_COOKIE, TITLE_SEEN_MAX_AGE, sanitizeRoadmapNext } from "@/lib/roadmap-title";

// タイトル画面の「続きを始める」の行き先。「タイトルを踏んだ」印のクッキーを付けて元のページへ進める。
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const next = sanitizeRoadmapNext(searchParams.get("next"));
  const response = NextResponse.redirect(`${getRequestOrigin(request)}${next}`);
  response.cookies.set(TITLE_SEEN_COOKIE, "1", {
    path: "/",
    maxAge: TITLE_SEEN_MAX_AGE,
    sameSite: "lax",
    httpOnly: true,
  });
  return response;
}
