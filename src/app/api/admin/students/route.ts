import { NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/admin-api-guard";
import { createStudentAccount, listStudentAccounts } from "@/lib/supabase/student-accounts";
import { isValidLoginId, normalizeLoginId } from "@/lib/student-account";

const MIN_PASSWORD_LENGTH = 8;
const MAX_DISPLAY_NAME_LENGTH = 30;

export async function GET() {
  const admin = await requireAdminApi();
  if (!admin.ok) return admin.response;
  return NextResponse.json({ students: await listStudentAccounts() });
}

export async function POST(request: Request) {
  const admin = await requireAdminApi();
  if (!admin.ok) return admin.response;

  let body: { loginId?: unknown; password?: unknown; displayName?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストがJSONとして不正です" }, { status: 400 });
  }

  const loginId = typeof body.loginId === "string" ? normalizeLoginId(body.loginId) : "";
  const password = typeof body.password === "string" ? body.password : "";
  const displayName = typeof body.displayName === "string" ? body.displayName.trim() : "";

  if (!isValidLoginId(loginId)) {
    return NextResponse.json(
      { error: "IDは英小文字・数字・-・_ の3〜20文字にしてください" },
      { status: 400 }
    );
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください` },
      { status: 400 }
    );
  }
  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    return NextResponse.json(
      { error: `表示名は${MAX_DISPLAY_NAME_LENGTH}文字以内にしてください` },
      { status: 400 }
    );
  }

  const result = await createStudentAccount({ loginId, password, displayName });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ student: result.account }, { status: 201 });
}
