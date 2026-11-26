// 生徒用アカウント（ID＋パスワード）の作成・一覧・パスワード再設定。管理画面からだけ呼ぶ。
import { supabaseAdmin } from "@/lib/supabase/server";
import {
  isStudentEmail,
  loginIdFromStudentEmail,
  studentEmailFromLoginId,
} from "@/lib/student-account";

export type StudentAccount = {
  userId: string;
  loginId: string;
  displayName: string | null;
  createdAt: string;
  lastSignInAt: string | null;
};

export async function listStudentAccounts(): Promise<StudentAccount[]> {
  const users = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  const students = users.filter((u) => isStudentEmail(u.email));
  if (students.length === 0) return [];

  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("user_id, display_name")
    .in(
      "user_id",
      students.map((u) => u.id)
    );
  const nameById = new Map((profiles ?? []).map((p) => [p.user_id as string, p.display_name as string | null]));

  return students
    .map((u) => ({
      userId: u.id,
      loginId: loginIdFromStudentEmail(u.email!),
      displayName: nameById.get(u.id) ?? null,
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
    }))
    .sort((a, b) => a.loginId.localeCompare(b.loginId));
}

export async function createStudentAccount(input: {
  loginId: string;
  password: string;
  displayName: string;
}): Promise<{ ok: true; account: StudentAccount } | { ok: false; error: string }> {
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email: studentEmailFromLoginId(input.loginId),
    password: input.password,
    // 確認メールを送らずに、すぐ使える状態にする
    email_confirm: true,
    user_metadata: { student: true },
  });

  if (error || !data.user) {
    const message = error?.message ?? "";
    if (/already|registered|exists/i.test(message)) {
      return { ok: false, error: "このIDはもう使われています" };
    }
    return { ok: false, error: message || "作成できませんでした" };
  }

  // profiles の行はトリガー（handle_new_user）が作る。表示名だけ入れる
  if (input.displayName) {
    await supabaseAdmin
      .from("profiles")
      .update({ display_name: input.displayName })
      .eq("user_id", data.user.id);
  }

  return {
    ok: true,
    account: {
      userId: data.user.id,
      loginId: input.loginId,
      displayName: input.displayName || null,
      createdAt: data.user.created_at,
      lastSignInAt: null,
    },
  };
}

export async function resetStudentPassword(
  userId: string,
  password: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { data: found, error: getError } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (getError || !found.user) return { ok: false, error: "アカウントが見つかりません" };
  // 生徒用アカウント以外のパスワードはここから変えない
  if (!isStudentEmail(found.user.email)) return { ok: false, error: "生徒用のアカウントではありません" };

  const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { password });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
