import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getRequestOrigin } from "@/lib/request-origin";

const EMAIL_OTP_TYPES: EmailOtpType[] = ["signup", "magiclink", "email", "recovery", "invite", "email_change"];

function sanitizeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

// メールのリンクをクリックするとここに戻ってくる。2通りに対応する。
// - ?token_hash=xxx&type=xxx : メールのテンプレートで付けたもの。ブラウザをまたいでも(メールアプリ内ブラウザ・シークレットモードなど)通る。
// - ?code=xxx : 従来の方式(PKCE)。リンクを開いたブラウザが、メールを送ったブラウザと同じでないと失敗する。
// どちらもセッションに交換してCookieを発行し、元のページ（またはダッシュボード）へ飛ばす。
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const origin = getRequestOrigin(request);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = sanitizeNext(searchParams.get("next"));

  if (code || (tokenHash && type && EMAIL_OTP_TYPES.includes(type))) {
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

    const { error } = tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : await supabase.auth.exchangeCodeForSession(code!);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // 失敗した場合はエラーを伝えつつログイン画面に戻す。行き先(next)は引き継ぎ、メールで始められる画面に戻す。
  const back = new URLSearchParams({ error: "auth_callback_failed", next });
  if (next.startsWith("/roadmap")) {
    back.set("reason", "roadmap");
    back.set("mode", "magic");
  }
  return NextResponse.redirect(`${origin}/login?${back.toString()}`);
}
