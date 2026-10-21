"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Crown, Loader2 } from "lucide-react";
import { TrackOnMount } from "@/components/analytics/track-on-mount";
import { trackEvent } from "@/lib/analytics";
import { formatYen } from "@/lib/pro-offer";

// 無料お試し中の案内。カード未登録の人にだけ出す（登録済みならお試し後もそのまま続くので出さない）。
// 最終日の前日・当日は目立たせて「カードを登録すると◯円のまま続けられます」と伝える。
// ボタンはStripeのお支払い管理（カスタマーポータル）を開き、終わったら今のページに戻る。
export function TrialReminderBanner({
  daysLeft,
  monthlyAmount,
}: {
  daysLeft: number;
  monthlyAmount: number | null;
}) {
  const pathname = usePathname();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const urgent = daysLeft <= 1;
  const price = monthlyAmount ? `${formatYen(monthlyAmount)}/月` : null;

  async function openPortal() {
    if (pending) return;
    trackEvent("trial_reminder_click", { days_left: daysLeft });
    setPending(true);
    setError("");
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ returnPath: pathname?.startsWith("/roadmap") ? pathname : "/roadmap" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error ?? "お支払い管理画面を開けませんでした");
        setPending(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("通信に失敗しました");
      setPending(false);
    }
  }

  const headline =
    daysLeft === 0 ? "今日でProのお試しが終わります" : daysLeft === 1 ? "明日でProのお試しが終わります" : `Proを無料でお試し中（あと${daysLeft}日）`;

  return (
    <div
      className={`mb-5 rounded-2xl px-4 py-3 ${
        urgent ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-md" : "border border-amber-200 bg-amber-50 text-amber-900"
      }`}
    >
      <TrackOnMount
        event="trial_reminder_view"
        params={{ days_left: daysLeft }}
        onceKey={`trial_reminder_view:${daysLeft}:${new Date().toDateString()}`}
      />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-2">
          <Crown className={`mt-0.5 h-4 w-4 shrink-0 ${urgent ? "text-white" : "text-amber-500"}`} />
          <div>
            <p className="text-sm font-black">{headline}</p>
            {price && (
              <p className={`text-xs ${urgent ? "text-white/95" : "text-amber-800"}`}>
                カードを登録すると、{price}のまま続けられます
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={openPortal}
          disabled={pending}
          className={`inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-black transition-transform active:scale-95 disabled:opacity-60 ${
            urgent ? "bg-white text-orange-600" : "bg-amber-500 text-white"
          }`}
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          カードを登録する
        </button>
      </div>
      {error && <p className={`mt-1 text-xs ${urgent ? "text-white" : "text-red-600"}`}>{error}</p>}
    </div>
  );
}
