import Link from "next/link";
import { Crown } from "lucide-react";
import {
  FOUNDER_DEADLINE_SHORT_LABEL,
  FOUNDER_MONTHLY_PRICE,
  PRO_TRIAL_DAYS,
  formatYen,
} from "@/lib/pro-offer";

// 部屋に置く、Free会員向けのPro案内ボタン（先行者価格・無料お試し）。
// 出し分け: お試しも先行者価格も使えるなら1つにまとめる。どちらも使えない人には出さない。
export function RoomProOfferButton({
  founderActive,
  trialEligible,
}: {
  founderActive: boolean;
  trialEligible: boolean;
}) {
  const founderText = `${FOUNDER_DEADLINE_SHORT_LABEL}まで${formatYen(FOUNDER_MONTHLY_PRICE)}`;
  const label =
    trialEligible && founderActive
      ? `Proお試し＆${founderText}`
      : founderActive
        ? `${FOUNDER_DEADLINE_SHORT_LABEL}まで月${formatYen(FOUNDER_MONTHLY_PRICE)}でPro`
        : trialEligible
          ? `Proを${PRO_TRIAL_DAYS}日間無料で試す`
          : null;
  if (!label) return null;

  return (
    <div className="mb-2">
      <Link
        href="/roadmap/pro?from=room"
        className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 px-3.5 py-1.5 text-xs font-black text-white shadow-sm transition-transform hover:brightness-105 active:scale-95"
      >
        <Crown className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </Link>
    </div>
  );
}
