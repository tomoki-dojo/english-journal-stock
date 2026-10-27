import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { cache } from "react";

// Server Component や Route Handler から「今ログイン中のユーザー」を取得する用。
// これは既存の server.ts（service_role・RLSを無視する管理者権限）とは別物。
// こちらはユーザー自身のセッションに基づいて動く、RLSが効く一般権限のクライアント。
export async function createClientServer() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server Component から呼ばれた場合はCookieを書き換えられないため無視。
            // ミドルウェア側でセッション更新をしているので実害はない。
          }
        },
      },
    }
  );
}

// APIルートなどで「ログイン中のユーザーID」だけ手早く取りたい場合のヘルパー
export type CurrentUser = { id: string; email: string | undefined; isAnonymous: boolean };

// 同じリクエスト内(layoutとpageなど)で何度呼んでも、判定は1回だけにする。
// まずJWTの署名をローカルで検証する(getClaims。Authへのネットワーク往復なし)。
// 検証できなかったとき(旧方式の鍵・期限切れなど)は、従来どおりAuthに問い合わせるgetUserに戻す。
// なお、セッションの失効(ログアウトなど)はJWTの有効期限までここでは反映されない。
// ミドルウェアは毎回getUserで検証しているので、画面側では弾かれる。
// MFAを要求する管理画面のガード(admin-guard.ts)は、このヘルパーを使わずgetUserのまま。
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClientServer();
  try {
    const { data, error } = await supabase.auth.getClaims();
    const claims = data?.claims;
    if (!error && claims?.sub) {
      return {
        id: claims.sub,
        email: typeof claims.email === "string" ? claims.email : undefined,
        isAnonymous: claims.is_anonymous === true,
      };
    }
  } catch {
    // 下のgetUserで確認する。
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user ? { id: user.id, email: user.email, isAnonymous: user.is_anonymous === true } : null;
});