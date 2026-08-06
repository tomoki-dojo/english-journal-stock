import { createClientServer } from "@/lib/supabase/server-auth";
import { supabaseAdmin } from "@/lib/supabase/server";

export type AdminGuardResult =
  | { ok: true; userId: string }
  | {
      ok: false;
      reason: "no-user" | "not-admin" | "mfa-not-enrolled" | "mfa-required";
    };

// 管理画面（お知らせ管理など）へのアクセス制御。
// ログイン＋is_adminフラグに加えて、MFA(TOTP)を有効化し、かつ今回のセッションで
// 検証済み（aal2）であることまで要求する。
// （Stripeのセキュリティ対策措置状況申告書「二段階認証または二要素認証を採用する」に対応するための措置）
export async function checkAdminAccess(): Promise<AdminGuardResult> {
  const supabase = await createClientServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { ok: false, reason: "no-user" };

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .single();

  if (!profile?.is_admin) return { ok: false, reason: "not-admin" };

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();

  if (aal?.currentLevel === "aal2") {
    return { ok: true, userId: user.id };
  }

  // TOTPが登録済みなら次に必要なレベルはaal2になる。登録済みだが今回のセッションで未検証。
  if (aal?.nextLevel === "aal2") {
    return { ok: false, reason: "mfa-required" };
  }

  // TOTP自体が未登録
  return { ok: false, reason: "mfa-not-enrolled" };
}
