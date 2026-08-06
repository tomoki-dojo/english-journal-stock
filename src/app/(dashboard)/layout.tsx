import { DashboardShell } from "@/components/layout";
import { listNotifications } from "@/lib/supabase/notifications";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Plan } from "@/lib/plan";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [notifications, user] = await Promise.all([
    listNotifications(8).catch(() => []),
    getCurrentUser(),
  ]);

  let account: { displayName: string | null; email: string; plan: Plan } | null = null;

  if (user) {
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("display_name, plan")
      .eq("user_id", user.id)
      .single();

    account = {
      displayName: profile?.display_name ?? null,
      email: user.email ?? "",
      plan: (profile?.plan as Plan) ?? "free",
    };
  }

  return (
    <DashboardShell notifications={notifications} account={account}>
      {children}
    </DashboardShell>
  );
}
