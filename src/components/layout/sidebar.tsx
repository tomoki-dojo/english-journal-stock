"use client";

import Link from "next/link";
import { X } from "lucide-react";
import { navItems } from "./nav-items";
import { PLAN_LABELS, type Plan } from "@/lib/plan";
import { cn } from "@/lib/utils";

export type SidebarAccount = {
  displayName: string | null;
  email: string;
  plan: Plan;
};

type SidebarProps = {
  isOpen: boolean;
  onClose: () => void;
  account: SidebarAccount | null;
};

// 表示名がなければメールアドレスの@より前を使う。イニシャルはその先頭1〜2文字。
function resolveDisplayName(account: SidebarAccount): string {
  return account.displayName?.trim() || account.email.split("@")[0] || "ユーザー";
}

function resolveInitials(name: string): string {
  return name.slice(0, 2).toUpperCase();
}

export function Sidebar({ isOpen, onClose, account }: SidebarProps) {
  const name = account ? resolveDisplayName(account) : null;
  return (
    <>
      <div
        aria-hidden={!isOpen}
        className={cn(
          "fixed inset-0 z-40 bg-black/60 backdrop-blur-sm transition-opacity md:hidden",
          isOpen ? "opacity-100" : "pointer-events-none opacity-0"
        )}
        onClick={onClose}
      />

      <aside
        className={cn(
          "fixed left-0 top-0 z-50 flex h-dvh w-[260px] flex-col border-r border-zinc-200/60 bg-white transition-transform duration-300 ease-in-out md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-zinc-200/60 px-5">
          <Link href="/" className="flex items-center gap-2.5" onClick={onClose}>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/10 ring-1 ring-accent/20">
              <span className="font-mono text-sm font-semibold text-accent">Ex</span>
            </div>
            {/* TODO: 仮の名称。アプリの正式名称が決まったら差し替える */}
            <span className="text-sm font-semibold tracking-tight text-zinc-900">
              English Journal
            </span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-600 transition-colors hover:bg-zinc-200/80 hover:text-zinc-800 md:hidden"
            aria-label="メニューを閉じる"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                className="group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-zinc-600 transition-colors hover:bg-zinc-200/50 hover:text-zinc-900"
              >
                <Icon className="h-[18px] w-[18px] shrink-0 text-zinc-500 transition-colors group-hover:text-accent" />
                <span className="flex-1 truncate">{item.label}</span>
                {item.badge && (
                  <span className="rounded-md bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent ring-1 ring-accent/20">
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="shrink-0 border-t border-zinc-200/60 p-4">
          {account && name ? (
            <div className="flex items-center gap-3 rounded-xl bg-zinc-100/40 p-3 ring-1 ring-zinc-200/60">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent/30 to-accent/10 text-sm font-medium text-accent ring-1 ring-accent/20">
                {resolveInitials(name)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900">{name}</p>
                <p className="text-xs text-zinc-500">{PLAN_LABELS[account.plan]} プラン</p>
              </div>
            </div>
          ) : (
            <Link
              href="/login"
              onClick={onClose}
              className="flex items-center justify-center rounded-xl bg-zinc-100/40 p-3 text-sm font-medium text-zinc-700 ring-1 ring-zinc-200/60 transition-colors hover:text-accent"
            >
              ログイン
            </Link>
          )}
          <div className="mt-3 flex items-center justify-center gap-3 text-[11px] text-zinc-400">
            <Link
              href="/terms"
              onClick={onClose}
              className="underline-offset-2 hover:text-zinc-600 hover:underline"
            >
              利用規約
            </Link>
            <span className="text-zinc-200">|</span>
            <Link
              href="/privacy"
              onClick={onClose}
              className="underline-offset-2 hover:text-zinc-600 hover:underline"
            >
              プライバシーポリシー
            </Link>
            <span className="text-zinc-200">|</span>
            <Link
              href="/tokushoho"
              onClick={onClose}
              className="underline-offset-2 hover:text-zinc-600 hover:underline"
            >
              特商法表記
            </Link>
          </div>
        </div>
      </aside>
    </>
  );
}
