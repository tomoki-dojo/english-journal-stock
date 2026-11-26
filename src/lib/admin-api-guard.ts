import { NextResponse } from "next/server";
import { checkAdminAccess } from "@/lib/supabase/admin-guard";

const ADMIN_GUARD_MESSAGES: Record<string, { status: number; error: string }> = {
  "no-user": { status: 401, error: "ログインが必要です" },
  "not-admin": { status: 403, error: "権限がありません" },
  "mfa-not-enrolled": {
    status: 403,
    error: "管理者アカウントの二要素認証が未設定です。設定画面から有効化してください。",
  },
  "mfa-required": {
    status: 403,
    error: "二要素認証の確認が必要です。管理画面から認証してください。",
  },
};

// 管理用APIルートの入口チェック（ログイン＋is_admin＋MFA検証済み）
export async function requireAdminApi() {
  const result = await checkAdminAccess();
  if (result.ok) return result;
  const message = ADMIN_GUARD_MESSAGES[result.reason];
  return {
    ok: false as const,
    response: NextResponse.json({ error: message.error }, { status: message.status }),
  };
}
