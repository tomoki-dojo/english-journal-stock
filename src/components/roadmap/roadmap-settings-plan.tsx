"use client";

import { useState } from "react";
import { Crown } from "lucide-react";

// 設定画面のプラン欄(Proの人用)。お支払い・解約の管理(Stripe)を開く。
export function RoadmapSettingsPlan() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function openPortal() {
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ returnPath: "/roadmap/settings" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setError(data.error ?? "お支払い管理画面を開けませんでした");
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("通信に失敗しました");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="space-y-3 rounded-xl border border-zinc-200 bg-zinc-100/50 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-zinc-900">プラン</h2>
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800 ring-1 ring-amber-500/30">
          <Crown className="h-3 w-3" />
          Pro
        </span>
      </div>

      <button
        type="button"
        onClick={openPortal}
        disabled={pending}
        className="w-full rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:text-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "開いています..." : "お支払い・解約の管理"}
      </button>

      {error && <p className="text-xs text-red-600">{error}</p>}
    </section>
  );
}
