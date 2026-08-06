import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

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

  return supabaseResponse;
}