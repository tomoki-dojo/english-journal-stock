import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getProOfferState } from "@/lib/pro-offer-server";
import { ROADMAP_TITLE_PATH } from "@/lib/roadmap-title";
import { PasswordSettingsForm } from "@/components/account/password-settings-form";
import { LogoutButton } from "@/components/account/logout-button";
import { RoadmapSettingsPlan } from "@/components/roadmap/roadmap-settings-plan";
import { RoadmapProPlan } from "@/components/roadmap/roadmap-pro-plan";
import { FREE_SHELF_NEW_SPECIES_TANK_CAP } from "@/lib/supabase/kuwagata";

export default async function RoadmapSettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    redirect("/login?reason=roadmap&next=/roadmap/settings");
  }

  const offer = await getProOfferState(user.id);
  const isPro = offer.isPro;

  return (
    <div className="mx-auto max-w-lg space-y-5 px-1">
      <Link
        href="/roadmap"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 transition-colors hover:text-zinc-900"
      >
        <ChevronLeft className="h-4 w-4" />
        部屋に戻る
      </Link>

      <div>
        <h1 className="text-xl font-black text-amber-900">設定</h1>
        <p className="mt-1 text-sm text-zinc-500">{user.email}</p>
      </div>

      {isPro && <RoadmapSettingsPlan />}

      <PasswordSettingsForm compact />

      <LogoutButton redirectTo={ROADMAP_TITLE_PATH} />

      {!isPro && (
        <div className="pt-4">
          <RoadmapProPlan
            isPro={false}
            isTrialing={false}
            founderActive={offer.founderActive}
            trialEligible={offer.trialEligible}
            startedTrial={false}
            startedWithFounderPrice={false}
            checkoutResult={null}
            from="settings"
            purchasedInterval={null}
            checkoutSessionId={null}
            screenshots={[]}
            shelfCap={FREE_SHELF_NEW_SPECIES_TANK_CAP}
          />
        </div>
      )}
    </div>
  );
}
