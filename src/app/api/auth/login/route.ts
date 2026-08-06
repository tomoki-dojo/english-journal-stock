import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/server";

// パスワードログイン専用のAPIルート。
// クライアントから直接 supabase.auth.signInWithPassword() を呼ぶのをやめて、ここを経由させることで
// 失敗回数を記録し、一定回数（MAX_FAILED_ATTEMPTS）に達したらアカウントを一時ロックできるようにする。
// （Stripeのセキュリティ対策措置状況申告書で必須項目のため）
const MAX_FAILED_ATTEMPTS = 10;
const LOCK_DURATION_MINUTES = 15;

type LoginAttemptRow = {
  failed_count: number;
  locked_until: string | null;
};

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストがJSONとして不正です" }, { status: 400 });
  }

  const body = json as { email?: unknown; password?: unknown };
  if (typeof body.email !== "string" || typeof body.password !== "string" || !body.email || !body.password) {
    return NextResponse.json(
      { error: "メールアドレスとパスワードを入力してください" },
      { status: 400 }
    );
  }

  const email = body.email.trim().toLowerCase();
  const password = body.password;

  const { data: attempt } = await supabaseAdmin
    .from("login_attempts")
    .select("failed_count, locked_until")
    .eq("email", email)
    .maybeSingle<LoginAttemptRow>();

  if (attempt?.locked_until && new Date(attempt.locked_until) > new Date()) {
    return NextResponse.json(
      {
        error: `ログイン試行回数が上限に達したため、一時的にロックされています。${LOCK_DURATION_MINUTES}分ほど時間をおいて再度お試しください。`,
      },
      { status: 429 }
    );
  }

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

  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const nextFailedCount = (attempt?.failed_count ?? 0) + 1;
    const shouldLock = nextFailedCount >= MAX_FAILED_ATTEMPTS;

    await supabaseAdmin.from("login_attempts").upsert({
      email,
      failed_count: shouldLock ? 0 : nextFailedCount,
      locked_until: shouldLock
        ? new Date(Date.now() + LOCK_DURATION_MINUTES * 60 * 1000).toISOString()
        : null,
      updated_at: new Date().toISOString(),
    });

    if (shouldLock) {
      return NextResponse.json(
        {
          error: `ログイン試行回数が上限（${MAX_FAILED_ATTEMPTS}回）に達しました。${LOCK_DURATION_MINUTES}分ほど時間をおいて再度お試しください。`,
        },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { error: "メールアドレスまたはパスワードが正しくありません" },
      { status: 401 }
    );
  }

  // ログイン成功。失敗回数の記録が残っていれば消しておく
  if (attempt) {
    await supabaseAdmin.from("login_attempts").delete().eq("email", email);
  }

  return NextResponse.json({ ok: true });
}
