import { redirect } from "next/navigation";
import Link from "next/link";
import { Shield } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import { PasswordSettingsForm } from "@/components/account/password-settings-form";
import { DisplayNameForm } from "@/components/account/display-name-form";
import { LogoutButton } from "@/components/account/logout-button";
import { MfaSettingsCard } from "@/components/account/mfa-settings-card";
import { PlanBillingCard } from "@/components/account/plan-billing-card";
import type { Plan } from "@/lib/plan";

export default async function SettingsPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("display_name, is_admin, plan, subscription_status")
    .eq("user_id", user.id)
    .single();

  return (
    <div className="max-w-lg space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
          アカウント設定
        </h1>
        <p className="mt-2 text-sm text-zinc-500">{user.email}</p>
      </div>

      <PlanBillingCard
        plan={(profile?.plan as Plan) ?? "free"}
        subscriptionStatus={profile?.subscription_status ?? null}
      />

      <DisplayNameForm initialDisplayName={profile?.display_name ?? ""} />

      <PasswordSettingsForm />

      {profile?.is_admin && (
        <>
          <MfaSettingsCard />

          <Link
            href="/admin/notifications"
            className="flex items-center gap-2 text-sm text-zinc-500 hover:text-accent"
          >
            <Shield className="h-4 w-4" />
            お知らせ管理（管理者）
          </Link>
        </>
      )}

      <LogoutButton />
    </div>
  );
}
