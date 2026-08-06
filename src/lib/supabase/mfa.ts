import { createClientBrowser } from "@/lib/supabase/client";

// Supabase AuthのMFA(TOTP)機能をラップするクライアント側ヘルパー。
// 設定画面の登録UIと、管理画面アクセス時の確認UIの両方から使う。

export async function listMfaFactors() {
  const supabase = createClientBrowser();
  return supabase.auth.mfa.listFactors();
}

export async function enrollTotpFactor() {
  const supabase = createClientBrowser();
  return supabase.auth.mfa.enroll({ factorType: "totp" });
}

// 新規登録時の確認、ログイン後のセッション昇格（aal1→aal2）どちらでも使う共通処理。
// Supabase側では両方とも「challenge→verify」で同じ仕組み。
export async function verifyTotpEnrollment(factorId: string, code: string) {
  const supabase = createClientBrowser();
  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error) {
    return { data: null, error: challenge.error };
  }
  return supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code,
  });
}

export const verifyTotpChallenge = verifyTotpEnrollment;

export async function unenrollFactor(factorId: string) {
  const supabase = createClientBrowser();
  return supabase.auth.mfa.unenroll({ factorId });
}

export async function getAssuranceLevel() {
  const supabase = createClientBrowser();
  return supabase.auth.mfa.getAuthenticatorAssuranceLevel();
}
