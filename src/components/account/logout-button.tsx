"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClientBrowser } from "@/lib/supabase/client";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    const supabase = createClientBrowser();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleLogout}
      disabled={loading}
      className="rounded-lg border border-zinc-400 bg-zinc-300/40 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:border-red-500/40 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {loading ? "ログアウト中..." : "ログアウト"}
    </button>
  );
}
