import { NextResponse } from "next/server";
import { checkAdminAccess } from "@/lib/supabase/admin-guard";
import { listNotifications, createNotification } from "@/lib/supabase/notifications";

const MAX_TITLE_LENGTH = 60;
const MAX_BODY_LENGTH = 400;

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

async function requireAdmin() {
  const result = await checkAdminAccess();
  if (result.ok) return result;
  const message = ADMIN_GUARD_MESSAGES[result.reason];
  return {
    ok: false as const,
    response: NextResponse.json({ error: message.error }, { status: message.status }),
  };
}

function isNotificationInput(
  value: unknown
): value is { title: string; body: string; url?: string } {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.title === "string" &&
    v.title.trim().length > 0 &&
    v.title.length <= MAX_TITLE_LENGTH &&
    typeof v.body === "string" &&
    v.body.trim().length > 0 &&
    v.body.length <= MAX_BODY_LENGTH &&
    (v.url === undefined || typeof v.url === "string")
  );
}

// 一覧（管理画面用。件数を増やして取得する）
export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  const notifications = await listNotifications(50);
  return NextResponse.json({ notifications });
}

// 新規作成
export async function POST(request: Request) {
  const admin = await requireAdmin();
  if (!admin.ok) return admin.response;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "リクエストボディがJSONとして不正です" }, { status: 400 });
  }

  if (!isNotificationInput(json)) {
    return NextResponse.json(
      { error: `title（${MAX_TITLE_LENGTH}文字以内）とbody（${MAX_BODY_LENGTH}文字以内）が必要です` },
      { status: 400 }
    );
  }

  const notification = await createNotification({
    title: json.title.trim(),
    body: json.body.trim(),
    url: json.url?.trim() || undefined,
  });

  if (!notification) {
    return NextResponse.json({ error: "作成に失敗しました" }, { status: 500 });
  }

  return NextResponse.json({ notification }, { status: 201 });
}
