import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { TrackOnMount } from "@/components/analytics/track-on-mount";

// ゲスト(匿名ログイン)に、登録(無料)を案内する帯。source=どこで見せたか(計測用)。
export function GuestRegisterBanner({
  source,
  variant = "light",
}: {
  source: "shelf" | "catch" | "round";
  variant?: "light" | "dark";
}) {
  const dark = variant === "dark";
  return (
    <div
      className={
        dark
          ? "w-full rounded-xl bg-white/10 px-3 py-2.5 text-center ring-1 ring-white/25"
          : "mb-4 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
      }
    >
      <TrackOnMount event="guest_register_view" params={{ source }} onceKey={`guest_register_view:${source}`} />
      <p className={dark ? "text-xs font-semibold text-white" : "text-sm font-bold text-amber-900"}>
        {source === "round" ? "登録（無料）で続きから遊べる" : "この子を残すには登録（無料）"}
      </p>
      <Link
        href={`/roadmap/register?from=${source}`}
        className={
          dark
            ? "mt-2 inline-flex items-center gap-1 rounded-full bg-white px-4 py-1.5 text-xs font-black text-amber-600 transition-transform active:scale-95"
            : "inline-flex shrink-0 items-center gap-1 rounded-full bg-[#e5215a] px-4 py-1.5 text-xs font-black text-white shadow-sm transition-transform active:scale-95"
        }
      >
        登録する
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
