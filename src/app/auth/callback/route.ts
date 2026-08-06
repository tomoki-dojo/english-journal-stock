import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getRequestOrigin } from "@/lib/request-origin";

// メールのマジックリンクをクリックすると ?code=xxx 付きでここに戻ってくる。
// codeをセッションに交換してCookieを発行し、元のページ（またはダッシュボード）へ飛ばす。
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = getRequestOrigin(request);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // 失敗した場合はエラーを伝えつつログイン画面に戻す
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}