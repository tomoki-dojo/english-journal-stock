"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Loader2, Sparkles } from "lucide-react";
import { PLAN_LABELS, type Plan } from "@/lib/plan";
import type { BillingInterval } from "@/lib/stripe";
import { PLAN_COMPARISON_ROWS, PRO_FEATURE_HIGHLIGHTS } from "@/lib/pro-features";
import { Toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type PlanBillingCardProps = {
  plan: Plan;
  subscriptionStatus: string | null;
};

const PLAN_BADGE_CLASSES: Record<Plan, string> = {
  free: "bg-zinc-200 text-zinc-600",
  pro: "bg-accent/10 text-accent ring-1 ring-accent/20",
  premium: "bg-amber-100 text-amber-700 ring-1 ring-amber-500/20",
};

// 価格は表示用のラベル。実際の請求額はStripe側のPrice設定が正になる（ここは案内用）。
const INTERVAL_LABELS: Record<BillingInterval, string> = {
  monthly: "¥680/月",
  annual: "¥6,800/年（月あたり約567円）",
};

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  active: "有効",
  trialing: "トライアル中",
  past_due: "支払い遅延中",
  unpaid: "未払い",
  canceled: "解約済み",
  incomplete: "手続き未完了",
  incomplete_expired: "手続き期限切れ",
  paused: "一時停止中",
};

const PLAN_FEATURES: Record<Plan, string[]> = {
  free: [
    "全表現の意味・例文を閲覧可能",
    "シーン・機能タグでの絞り込みは一部ロック",
    "マイリスト保存 15件まで",
    "例文の音声再生なし",
  ],
  pro: ["全表現の意味・例文を閲覧可能", ...PRO_FEATURE_HIGHLIGHTS],
  premium: ["Proの全機能"],
};

export function PlanBillingCard({ plan, subscriptionStatus }: PlanBillingCardProps) {
  const searchParams = useSearchParams();
  const [pendingInterval, setPendingInterval] = useState<BillingInterval | null>(null);
  const [selectedInterval, setSelectedInterval] = useState<BillingInterval>("monthly");
  const [portalPending, setPortalPending] = useState(false);
  const [error, setError] = useState("");
  const [toastMessage, setToastMessage] = useState("");

  useEffect(() => {
    const checkout = searchParams.get("checkout");
    if (checkout === "success") {
      setToastMessage("お支払いが完了しました。プランが反映されるまで少し時間がかかる場合があります。");
    } else if (checkout === "cancelled") {
      setToastMessage("お手続きをキャンセルしました。");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleUpgrade(interval: BillingInterval) {
    if (pendingInterval) return;
    setPendingInterval(interval);
    setError("");

    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interval }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.url) {
        setError(data.error ?? "アップグレード手続きの開始に失敗しました");
        setPendingInterval(null);
        return;
      }

      window.location.href = data.url;
    } catch {
      setError("通信に失敗しました");
      setPendingInterval(null);
    }
  }

  async function handleManageBilling() {
    if (portalPending) return;
    setPortalPending(true);
    setError("");

    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.url) {
        setError(data.error ?? "お支払い管理画面を開けませんでした");
        return;
      }

      window.location.href = data.url;
    } catch {
      setError("通信に失敗しました");
    } finally {
      setPortalPending(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-100/50 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">プラン・お支払い</h2>
        <span className={cn("rounded-md px-2.5 py-1 text-xs font-medium", PLAN_BADGE_CLASSES[plan])}>
          {PLAN_LABELS[plan]}
        </span>
      </div>

      {subscriptionStatus && subscriptionStatus !== "active" && (
        <p className="text-xs text-amber-600">
          契約状況: {SUBSCRIPTION_STATUS_LABELS[subscriptionStatus] ?? subscriptionStatus}
        </p>
      )}

      <ul className="space-y-1 text-xs text-zinc-500">
        {PLAN_FEATURES[plan].map((feature) => (
          <li key={feature} className="flex items-center gap-1.5">
            <Check className="h-3.5 w-3.5 shrink-0 text-accent" />
            {feature}
          </li>
        ))}
      </ul>

      {plan === "free" && (
        <div className="border-t border-zinc-200 pt-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-zinc-600">
            <Sparkles className="h-3.5 w-3.5 text-accent" />
            FreeとProのちがい
          </div>
          <table className="mt-2.5 w-full text-xs">
            <thead>
              <tr className="text-zinc-400">
                <th className="py-1 text-left font-medium"></th>
                <th className="py-1 text-left font-medium">Free</th>
                <th className="py-1 text-left font-medium text-accent">Pro</th>
              </tr>
            </thead>
            <tbody>
              {PLAN_COMPARISON_ROWS.map((row) => (
                <tr key={row.label} className="border-t border-zinc-200/70">
                  <td className="py-1.5 pr-2 text-zinc-500">{row.label}</td>
                  <td className="py-1.5 pr-2 text-zinc-500">{row.free}</td>
                  <td className="py-1.5 font-medium text-zinc-800">{row.pro}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {plan === "free" && (
        <div className="space-y-3 border-t border-zinc-200 pt-4">
          <div className="inline-flex rounded-lg border border-zinc-300 p-0.5 text-xs">
            {(["monthly", "annual"] as const).map((interval) => (
              <button
                key={interval}
                type="button"
                onClick={() => setSelectedInterval(interval)}
                className={cn(
                  "rounded-md px-3 py-1.5 font-medium transition-colors",
                  selectedInterval === interval
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-500 hover:text-zinc-700"
                )}
              >
                {interval === "monthly" ? "月払い" : "年払い（お得）"}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => handleUpgrade(selectedInterval)}
            disabled={pendingInterval !== null}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white shadow-lg shadow-accent/30 transition-colors hover:bg-accent/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pendingInterval === selectedInterval ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            Proにアップグレード（{INTERVAL_LABELS[selectedInterval]}）
          </button>
        </div>
      )}

      {plan !== "free" && (
        <div className="border-t border-zinc-200 pt-4">
          <button
            type="button"
            onClick={handleManageBilling}
            disabled={portalPending}
            className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-medium text-zinc-600 transition-colors hover:border-zinc-400 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {portalPending ? "読み込み中..." : "お支払い管理"}
          </button>
        </div>
      )}

      {error && <p className="text-xs text-red-600">{error}</p>}

      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage("")} />}
    </section>
  );
}
