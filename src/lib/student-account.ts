// 塾の生徒など、メールアドレスを使えない人向けの「ID＋パスワード」アカウント。
// Supabase Auth はメールアドレスか電話番号が必須なので、IDを架空のメールアドレスに変換して登録する。
// このドメインにはメールを送らない（作成時に email_confirm: true にするので確認メールも飛ばない）。
export const STUDENT_EMAIL_DOMAIN = "students.upskillenglish.bear-fruit.online";

// IDは英小文字・数字・ハイフン・アンダースコアで3〜20文字
export const STUDENT_LOGIN_ID_PATTERN = /^[a-z0-9_-]{3,20}$/;

export function normalizeLoginId(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidLoginId(value: string): boolean {
  return STUDENT_LOGIN_ID_PATTERN.test(value);
}

export function studentEmailFromLoginId(loginId: string): string {
  return `${normalizeLoginId(loginId)}@${STUDENT_EMAIL_DOMAIN}`;
}

export function isStudentEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${STUDENT_EMAIL_DOMAIN}`);
}

export function loginIdFromStudentEmail(email: string): string {
  return email.slice(0, email.length - STUDENT_EMAIL_DOMAIN.length - 1);
}

// ログイン欄の入力（メールアドレス または ID）を、Supabase に渡すメールアドレスに直す
export function resolveLoginEmail(input: string): string {
  const value = input.trim().toLowerCase();
  return value.includes("@") ? value : studentEmailFromLoginId(value);
}

// 画面に出すアカウント名（生徒は架空のメールアドレスではなくIDを見せる）
export function accountLabel(email: string | null | undefined): string {
  if (!email) return "";
  return isStudentEmail(email) ? `ID: ${loginIdFromStudentEmail(email)}` : email;
}
