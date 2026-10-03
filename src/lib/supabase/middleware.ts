import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ROADMAP_TITLE_PATH, TITLE_SEEN_COOKIE, TITLE_SEEN_MAX_AGE, sanitizeRoadmapNext } from "@/lib/roadmap-title";

// 各リクエストでSupabaseのセッションCookieを検証・更新する
// （ログイン状態を維持するために、Next.jsのミドルウェアから毎回呼ぶ想定）
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // セッションを検証（getUserはトークンをSupabase側に問い合わせて検証するため、
  // getSessionより安全。ここで呼んでおくとCookieが自動で更新される）
  await supabase.auth.getUser();

  // ロードマップ配下は、タイトル画面を踏んでいない（クッキー無し or 12時間経過）場合タイトルへ転送する。
  // ブックマーク・URL直打ちでも同じ。操作のたびにクッキーを延長するので「最後の操作から12時間」で失効する。
  const { pathname, search } = request.nextUrl;
  const isRoadmapPage = pathname === "/roadmap" || pathname.startsWith("/roadmap/");
  const isTitlePage = pathname === ROADMAP_TITLE_PATH || pathname.startsWith(`${ROADMAP_TITLE_PATH}/`);
  const isPrefetch = request.headers.has("next-router-prefetch") || request.headers.get("purpose") === "prefetch";

  if (isRoadmapPage && !isTitlePage && request.method === "GET" && !isPrefetch) {
    if (!request.cookies.get(TITLE_SEEN_COOKIE)) {
      const url = request.nextUrl.clone();
      url.pathname = ROADMAP_TITLE_PATH;
      url.search = `?next=${encodeURIComponent(sanitizeRoadmapNext(`${pathname}${search}`))}`;
      const redirect = NextResponse.redirect(url);
      supabaseResponse.cookies.getAll().forEach((c) => redirect.cookies.set(c));
      return redirect;
    }
    supabaseResponse.cookies.set(TITLE_SEEN_COOKIE, "1", {
      path: "/",
      maxAge: TITLE_SEEN_MAX_AGE,
      sameSite: "lax",
      httpOnly: true,
    });
  }

  return supabaseResponse;
}