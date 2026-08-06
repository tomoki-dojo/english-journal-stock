"use client";

import { useState } from "react";
import { GlobalHeader } from "./global-header";
import { Sidebar, type SidebarAccount } from "./sidebar";
import type { Notification } from "@/lib/supabase/notifications";

type DashboardShellProps = {
  children: React.ReactNode;
  notifications: Notification[];
  account: SidebarAccount | null;
};

export function DashboardShell({ children, notifications, account }: DashboardShellProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="min-h-dvh bg-background text-zinc-900">
      <Sidebar isOpen={isOpen} onClose={() => setIsOpen(false)} account={account} />

      <div className="flex min-h-dvh flex-col md:pl-[260px]">
        <GlobalHeader onMenuClick={() => setIsOpen(true)} notifications={notifications} />

        <main className="flex-1 px-6 pb-8 pt-24 md:px-8">
          {children}
        </main>
      </div>
    </div>
  );
}
