"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Ban,
  BookOpen,
  Bookmark,
  Bug,
  Crown,
  FastForward,
  Loader2,
  MessageCircle,
  Mic,
  Sparkles,
  TreePine,
  Volume2,
  type LucideIcon,
} from "lucide-react";
import {
  STAGE3_FREE_DAILY_LIMIT,
  STAGE3_PRO_DAILY_LIMIT,
  STAGE4_FREE_DAILY_LIMIT,
  STAGE4_PRO_DAILY_LIMIT,
} from "./types";
import type { BillingInterval } from "@/lib/stripe";

// 価格は表示用。実際の請求額はStripe側のPriceが正(本体の plan-billing-card.tsx と同じ値)。
const PRICE_LABEL: Record<BillingInterval, { main: string; sub: string }> = {
  monthly: { main: "¥680", sub: "/月" },
  annual: { main: "¥6,800", sub: "/年（2か月分おトク）" },
};

// 「Freeとここが違う」の大きな数字カード。Free→Proの変化を一目で見せる。
type Stat = { icon: LucideIcon; label: string; free: string; pro: string; unit?: string };

function buildStats(shelfCap: number): Stat[] {
  return [
    { icon: MessageCircle, label: "AI判定 Stage3", free: `${STAGE3_FREE_DAILY_LIMIT}回`, pro: `${STAGE3_PRO_DAILY_LIMIT}`, unit: "回/日" },
    { icon: Mic, label: "AI会話 Stage4・5", free: `${STAGE4_FREE_DAILY_LIMIT}回`, pro: `${STAGE4_PRO_DAILY_LIMIT}`, unit: "回/日" },
    { icon: Bug, label: "棚に飾れる種類", free: `${shelfCap}種`, pro: "無制限" },
    { icon: Sparkles, label: "採集チャンス", free: "ふつう", pro: "2倍", unit: "のペース" },
  ];
}

// Pro限定の特典。目立たせたいもの。
// 文字で目立たせたい行は、labelを部分的に強調したノードで持つ(古代の森・珍しい生き物を大きく・色付きに)。
const PRO_ONLY: { icon: LucideIcon; label: ReactNode; featured?: boolean }[] = [
  {
    icon: TreePine,
    featured: true,
    label: (
      <>
        Pro限定エリア
        <span className="mx-0.5 rounded-md bg-amber-200/80 px-1.5 py-0.5 text-lg font-black text-amber-700">「古代の森」</span>
        と、各エリアのPro限定の
        <span className="mx-0.5 rounded-md bg-amber-200/80 px-1.5 py-0.5 text-lg font-black text-amber-700">珍しい生き物</span>
      </>
    ),
  },
  { icon: FastForward, label: "Stageスキップ（先のStageから始められる）" },
];

// 本体のUpskillEnglishもProになる特典。
const APP_PERKS: { icon: LucideIcon; label: string }[] = [
  { icon: Volume2, label: "例文の音声再生" },
  { icon: BookOpen, label: "単語を効率よく復習（今日の復習）" },
  { icon: Bookmark, label: "マイリスト保存が無制限" },
];

export function RoadmapProPlan({
  isPro,
  checkoutResult,
  screenshots,
  shelfCap,
}: {
  isPro: boolean;
  shelfCap: number;
  checkoutResult: "success" | null;
  screenshots: string[];
}) {
  const [interval, setInterval] = useState<BillingInterval>("monthly");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ interval, returnTo: "roadmap" }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || typeof json.url !== "string") {
        throw new Error(json.error ?? "決済ページを開けませんでした");
      }
      window.location.href = json.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "決済ページを開けませんでした");
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-400 via-amber-500 to-orange-500 px-5 py-7 text-center text-white shadow-lg">
        <div className="pointer-events-none absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white/15" />
        <div className="pointer-events-none absolute -bottom-10 -left-6 h-28 w-28 rounded-full bg-white/10" />
        <div className="relative">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-white/25 ring-4 ring-white/20">
            <Crown className="h-8 w-8 text-white" strokeWidth={1.75} />
          </div>
          <h1 className="text-3xl font-black tracking-tight drop-shadow-sm">UpskillEnglish Pro</h1>
          <p className="mt-1 text-sm font-bold text-white/95">英クワたんと本体アプリ、2つまとめてPro</p>
          {!isPro && (
            <a
              href="#plan"
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white px-6 py-2.5 text-sm font-black text-amber-600 shadow-md transition-transform active:scale-95"
            >
              {PRICE_LABEL.monthly.main}{PRICE_LABEL.monthly.sub}でProにする
              <ArrowRight className="h-4 w-4" strokeWidth={3} />
            </a>
          )}
        </div>
      </div>

      {checkoutResult === "success" && (
        <div className="rounded-2xl bg-amber-500 px-5 py-4 text-center text-white shadow">
          <Sparkles className="mx-auto mb-1 h-6 w-6" />
          <p className="font-bold">Pro会員になりました！</p>
          <p className="mt-1 text-xs text-white/90">反映まで少し時間がかかることがあります。</p>
          <Link
            href="/roadmap/shelf"
            className="mt-3 inline-block rounded-full bg-white px-5 py-2 text-sm font-bold text-amber-600"
          >
            棚を見に行く
          </Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {buildStats(shelfCap).map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-amber-200 bg-white p-4 text-center shadow-sm">
            <p className="flex items-center justify-center gap-1.5 text-sm font-black text-zinc-700 sm:text-base">
              <stat.icon className="h-5 w-5 text-amber-500" strokeWidth={2} />
              {stat.label}
            </p>
            <p className="mt-2 text-base font-bold sm:text-lg text-zinc-400 line-through decoration-zinc-300">Free {stat.free}</p>
            <p className="mt-0.5 leading-none">
              <span className="text-4xl font-black text-amber-500">{stat.pro}</span>
              {stat.unit && <span className="ml-0.5 text-sm font-black text-amber-600">{stat.unit}</span>}
            </p>
          </div>
        ))}
      </div>

      <div className="space-y-2.5">
        {PRO_ONLY.map((perk, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-2xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-white px-4 py-3.5 shadow-sm"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-500 text-white shadow">
              <perk.icon className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <span className="mb-0.5 inline-block rounded-full bg-amber-500 px-2 py-0.5 text-[10px] font-black tracking-wide text-white">
                Pro限定
              </span>
              <p className={`leading-relaxed text-zinc-800 ${perk.featured ? "text-base font-black" : "text-sm font-bold"}`}>{perk.label}</p>
            </div>
          </div>
        ))}
      </div>

      <section className="rounded-2xl border border-amber-100 bg-white/80 p-5 shadow-sm">
        <h2 className="mb-3 text-base font-black text-amber-900">本体のUpskillEnglishもPro</h2>
        <ul className="space-y-2.5">
          {APP_PERKS.map((perk) => (
            <li key={perk.label} className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100">
                <perk.icon className="h-4 w-4 text-amber-600" strokeWidth={2.25} />
              </span>
              <p className="text-sm font-semibold text-zinc-800">{perk.label}</p>
            </li>
          ))}
        </ul>
        {screenshots.length > 0 && (
          <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
            {screenshots.map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={src}
                src={src}
                alt="UpskillEnglishの画面"
                className="h-56 w-auto shrink-0 rounded-lg border border-zinc-200 shadow-sm"
              />
            ))}
          </div>
        )}
      </section>

      <div className="flex items-center justify-center gap-3 rounded-2xl border-2 border-emerald-400 bg-emerald-50 px-4 py-3.5 shadow-sm">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
          <Ban className="h-5 w-5" strokeWidth={2.5} />
        </span>
        <p className="text-lg font-black text-emerald-700">どちらのアプリも広告なし</p>
      </div>

      {isPro ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4 text-center">
          <p className="font-bold text-amber-900">Pro会員です</p>
          <Link href="/settings" className="mt-1 inline-block text-xs text-amber-700 underline underline-offset-2">
            お支払い・解約の管理
          </Link>
        </div>
      ) : (
        <div id="plan" className="scroll-mt-4 rounded-2xl border-2 border-amber-300 bg-white p-5 shadow-md">
          <div className="mb-4 grid grid-cols-2 gap-2 rounded-full bg-amber-50 p-1">
            {(["monthly", "annual"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setInterval(v)}
                className={`rounded-full py-2 text-sm font-bold transition-colors ${
                  interval === v ? "bg-amber-500 text-white shadow" : "text-amber-700"
                }`}
              >
                {v === "monthly" ? "月払い" : "年払い"}
              </button>
            ))}
          </div>
          <p className="text-center">
            <span className="text-3xl font-black text-zinc-900">{PRICE_LABEL[interval].main}</span>
            <span className="text-sm text-zinc-500">{PRICE_LABEL[interval].sub}</span>
          </p>
          <button
            type="button"
            onClick={startCheckout}
            disabled={pending}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-full bg-amber-500 py-3 text-base font-black text-white shadow transition-transform active:scale-95 disabled:opacity-60"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            Proにする
          </button>
          {error && <p className="mt-2 text-center text-xs text-red-500">{error}</p>}
          <p className="mt-3 text-center text-[11px] text-zinc-400">
            いつでも解約できます（
            <Link href="/tokushoho" className="underline underline-offset-2">
              特定商取引法に基づく表記
            </Link>
            ）
          </p>
        </div>
      )}
    </div>
  );
}
