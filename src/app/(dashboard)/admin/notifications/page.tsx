import { notFound, redirect } from "next/navigation";
import { checkAdminAccess } from "@/lib/supabase/admin-guard";
import { listNotifications } from "@/lib/supabase/notifications";
import { NotificationsAdminPanel } from "@/components/admin/notifications-admin-panel";

export default async function AdminNotificationsPage() {
  const access = await checkAdminAccess();

  if (!access.ok) {
    if (access.reason === "no-user") redirect("/login");
    // 管理者以外には存在自体を見せない
    if (access.reason === "not-admin") notFound();
    // 二要素認証が未設定なら設定画面へ、設定済みだが未検証ならチャレンジ画面へ
    if (access.reason === "mfa-not-enrolled") redirect("/settings");
    redirect("/admin/mfa-challenge");
  }

  const notifications = await listNotifications(50);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">お知らせ管理</h1>
        <p className="mt-2 text-sm text-zinc-500">
          ここで作成したお知らせは、全ユーザーのヘッダーのベルアイコンに表示されます。
        </p>
      </div>

      <NotificationsAdminPanel initialNotifications={notifications} />
    </div>
  );
}
