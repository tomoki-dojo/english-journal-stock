"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Menu, Sparkles } from "lucide-react";
import type { Notification } from "@/lib/supabase/notifications";

type GlobalHeaderProps = {
  onMenuClick: () => void;
  notifications: Notification[];
};

// 既読管理はDBに持たず、ブラウザ側で「最後に見た日時」だけ覚えておく軽量な設計。
const LAST_SEEN_KEY = "notifications:lastSeenAt";

export function GlobalHeader({ onMenuClick, notifications }: GlobalHeaderProps) {
  const [open, setOpen] = useState(false);
  const [hasUnread, setHasUnread] = useState(false);

  const latestCreatedAt = notifications[0]?.createdAt;

  useEffect(() => {
    if (!latestCreatedAt) return;
    const lastSeen = window.localStorage.getItem(LAST_SEEN_KEY);
    if (!lastSeen || new Date(latestCreatedAt).getTime() > new Date(lastSeen).getTime()) {
      setHasUnread(true);
    }
  }, [latestCreatedAt]);

  function handleToggle() {
    setOpen((prev) => !prev);
    if (!open && latestCreatedAt) {
      window.localStorage.setItem(LAST_SEEN_KEY, latestCreatedAt);
      setHasUnread(false);
    }
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-zinc-200/60 bg-zinc-50/70 px-4 backdrop-blur-md md:gap-4 md:px-6">
      <button
        type="button"
        onClick={onMenuClick}
        className="rounded-lg p-2 text-zinc-600 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900 md:hidden"
        aria-label="メニューを開く"
      >
        <Menu className="h-5 w-5" />
      </button>

      <div className="min-w-0 flex-1" />

      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <div className="relative">
          <button
            type="button"
            onClick={handleToggle}
            className="relative rounded-lg p-2 text-zinc-600 transition-colors hover:bg-zinc-200/60 hover:text-zinc-900"
            aria-label="お知らせ"
          >
            <Bell className="h-5 w-5" />
            {hasUnread && (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-accent ring-2 ring-zinc-50" />
            )}
          </button>

          {open && (
            <>
              {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div className="absolute right-0 top-full z-50 mt-2 max-h-96 w-80 overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-xl shadow-zinc-300/40">
                <p className="border-b border-zinc-200 px-4 py-2.5 text-xs font-medium uppercase tracking-wider text-zinc-500">
                  お知らせ
                </p>
                {notifications.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-zinc-500">お知らせはありません</p>
                ) : (
                  <ul className="divide-y divide-zinc-200">
                    {notifications.map((notification) => {
                      const content = (
                        <>
                          <p className="text-sm font-medium text-zinc-900">{notification.title}</p>
                          <p className="mt-0.5 text-xs text-zinc-600">{notification.body}</p>
                          <p className="mt-1 text-[10px] text-zinc-400">
                            {new Date(notification.createdAt).toLocaleDateString("ja-JP")}
                          </p>
                        </>
                      );

                      return (
                        <li key={notification.id} className="px-4 py-3">
                          {notification.url ? (
                            <Link
                              href={notification.url}
                              onClick={() => setOpen(false)}
                              className="block hover:opacity-80"
                            >
                              {content}
                            </Link>
                          ) : (
                            <div>{content}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>

        <Link
          href="/settings"
          className="hidden items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white shadow-lg shadow-accent/30 transition-colors hover:bg-accent/90 sm:flex sm:text-sm"
        >
          <Sparkles className="h-3.5 w-3.5" />
          プランをアップグレード
        </Link>
      </div>
    </header>
  );
}
