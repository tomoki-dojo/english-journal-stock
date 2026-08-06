// src/lib/supabase/client.ts（ブラウザ・クライアントコンポーネント用）
import { createBrowserClient } from "@supabase/ssr";

// ログインフォームのsubmit処理や、クライアントコンポーネントからの読み書きはこれを使う。
// @supabase/ssr ベースにすることで、ミドルウェア(セッション更新)・サーバー側(server-auth.ts)と
// Cookie経由でログイン状態が一致するようになる。
export function createClientBrowser() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}