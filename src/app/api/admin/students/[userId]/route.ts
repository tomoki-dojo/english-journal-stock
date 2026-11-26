import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-guard";
import { resetStudentPassword } from "@/lib/supabase/student-accounts";

const MIN_PASSWORD_LENGTH = 8;

// 生徒がパスワードを忘れたとき用（メールでの再設定ができないため、管理画面から付け直す）
export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const admin = await requireAdminApi();
  if (!admin.ok) return admin.response;

  const { userId } = await params;
  let body: { password?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストがJSONとして不正です" }, { status: 400 });
  }

  const password = typeof body.password === "string" ? body.password : "";
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください` },
      { status: 400 }
    );
  }

  const result = await resetStudentPassword(userId, password);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
