import type { Metadata } from "next";
import Link from "next/link";
import {
  RoadmapSoundProvider,
  SoundToggleButton,
} from "@/components/roadmap/roadmap-sound";

// ブラウザのタブ名など。アプリ名「喋って！育てろ！英クワたん」で出す(本体名のサフィックスは付けない)。
export const metadata: Metadata = { title: { absolute: "喋って！育てろ！英クワたん" } };

// スピーキング・ロードマップ専用のレイアウト。
// 本体（UpskillEnglish）のサイドバー・ヘッダーは使わず、「陽だまりの箱庭タウン」という
// roadmap独自の温かいトーンにする（本体想定ユーザーとroadmap想定ユーザー＝話す経験がほぼない層、
// の体験を意図的に分ける。詳細は _reference/speaking-roadmap-design.md 参照）。
// ブランドとの繋がりは、上部の小さなロゴリンクと背景のオレンジ〜ティールの気配で保つ。
// 認証チェックは各ページ側で行う（本体のDashboardShellと違い、ここでは行わない）。
export default function RoadmapLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <RoadmapSoundProvider>
      <div className="min-h-dvh bg-gradient-to-b from-amber-50 via-white to-sky-50">
        <header className="border-b border-amber-100/80 bg-white/60 backdrop-blur-sm">
          <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
            <Link
              href="/"
              aria-label="UpskillEnglishへ戻る"
              className="flex items-center"
            >
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent/10 ring-1 ring-accent/20">
                <span className="font-mono text-xs font-semibold text-accent">
                  Up
                </span>
              </div>
            </Link>
            <SoundToggleButton />
          </div>
        </header>

        <main className="mx-auto max-w-3xl px-6 py-8">{children}</main>
      </div>
    </RoadmapSoundProvider>
  );
}
