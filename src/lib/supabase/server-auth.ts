import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

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
export async function getCurrentUser() {
  const supabase = await createClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}