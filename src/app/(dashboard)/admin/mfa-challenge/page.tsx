import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getIsAdmin } from "@/lib/supabase/notifications";
import { MfaChallengeForm } from "@/components/admin/mfa-challenge-form";

export default async function AdminMfaChallengePage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  if (!(await getIsAdmin(user.id))) {
    notFound();
  }

  return (
    <div className="max-w-sm space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">二要素認証の確認</h1>
        <p className="mt-2 text-sm text-zinc-500">
          管理画面にアクセスするには、認証アプリのコードを入力してください。
        </p>
      </div>
      <MfaChallengeForm />
    </div>
  );
}
