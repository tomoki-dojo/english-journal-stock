import type { Metadata } from "next";
import Link from "next/link";
import { Settings } from "lucide-react";
import {
  RoadmapSoundProvider,
  SoundToggleButton,
} from "@/components/roadmap/roadmap-sound";
import { GuestSignupTracker } from "@/components/analytics/guest-signup-tracker";
import { RefreshOnReturn } from "@/components/roadmap/refresh-on-return";
import { RoadmapAdBreakProvider } from "@/components/roadmap/roadmap-ad-break";
import { TrialReminderBanner } from "@/components/roadmap/trial-reminder-banner";
import { getTrialStatus } from "@/lib/pro-trial-status";
import { APP_VERSION } from "@/lib/app-version";
import { getCurrentUser } from "@/lib/supabase/server-auth";
import { getPlan } from "@/lib/supabase/profile";

// ブラウザのタブ名など。アプリ名「喋って！育てろ！英クワたん」で出す(本体名のサフィックスは付けない)。
export const metadata: Metadata = { title: { absolute: "喋って！育てろ！英クワたん" } };

// スピーキング・ロードマップ専用のレイアウト。
// 本体（UpskillEnglish）のサイドバー・ヘッダーは使わず、「陽だまりの箱庭タウン」という
// roadmap独自の温かいトーンにする（本体想定ユーザーとroadmap想定ユーザー＝話す経験がほぼない層、
// の体験を意図的に分ける。詳細は _reference/speaking-roadmap-design.md 参照）。
// ブランドとの繋がりは、上部の小さなロゴリンクと背景のオレンジ〜ティールの気配で保つ。
// 認証チェックは各ページ側で行う（本体のDashboardShellと違い、ここでは行わない）。
export default async function RoadmapLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 区切り広告はFree会員だけ（Pro会員・未ログインには出さない）
  const user = await getCurrentUser();
  const plan = user ? await getPlan(user.id) : null;
  const showAds = plan === "free";
  // 無料お試し中で、まだカードを登録していない人には「あと◯日でProが終わります」を出す
  const trial = user && plan && plan !== "free" ? await getTrialStatus(user.id) : null;

  return (
    <RoadmapSoundProvider>
      <RefreshOnReturn />
      <GuestSignupTracker isAnonymous={user?.isAnonymous === true} />
      <div className="min-h-dvh bg-gradient-to-b from-amber-50 via-white to-sky-50">
        <header className="border-b border-amber-100/80 bg-white/60 backdrop-blur-sm">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-3 py-1.5 sm:px-6 sm:py-3">
            <Link
              href="/"
              aria-label="UpskillEnglishへ戻る"
              className="flex items-center"
            >
              <div className="flex h-6 w-6 items-center justify-center rounded-lg sm:h-7 sm:w-7 bg-accent/10 ring-1 ring-accent/20">
                <span className="font-mono text-[10px] font-semibold text-accent sm:text-xs">
                  Up
                </span>
              </div>
            </Link>
            <div className="flex items-center gap-3">
              <Link
                href="/roadmap/title/version?from=room"
                className="rounded-full bg-amber-100/80 px-2 py-0.5 text-[10px] font-bold text-amber-800 sm:px-2.5 sm:py-1 sm:text-xs transition-colors hover:bg-amber-200/80"
              >
                v{APP_VERSION}
              </Link>
              <Link
                href="/roadmap/settings"
                aria-label="設定"
                className="flex h-6 w-6 items-center justify-center rounded-full text-zinc-600 transition-colors hover:bg-amber-100/70 active:scale-95 sm:h-8 sm:w-8"
              >
                <Settings className="h-4 w-4 sm:h-5 sm:w-5" />
              </Link>
              <SoundToggleButton />
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-2 pb-8 pt-1 sm:px-6 sm:py-8">
          {trial && !trial.hasPaymentMethod && (
            <TrialReminderBanner daysLeft={trial.daysLeft} monthlyAmount={trial.monthlyAmount} />
          )}
          <RoadmapAdBreakProvider enabled={showAds}>{children}</RoadmapAdBreakProvider>
        </main>
      </div>
    </RoadmapSoundProvider>
  );
}
