"use client";

import { useState } from "react";
import { createClientBrowser } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/analytics";

// 「登録なしで試す」。匿名サインイン(本物の一時アカウント)を作って、タイトル経由でStage1へ進む。
export function GuestStartButton({ className }: { className?: string }) {
  const [status, setStatus] = useState<"idle" | "starting" | "error">("idle");

  const start = async () => {
    setStatus("starting");
    const supabase = createClientBrowser();
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      setStatus("error");
      return;
    }
    trackEvent("guest_start");
    window.location.href = `/roadmap/title/enter?next=${encodeURIComponent("/roadmap/stage1")}`;
  };

  return (
    <>
      <button type="button" onClick={start} disabled={status === "starting"} className={className}>
        {status === "starting" ? "準備中..." : "登録なしで試す"}
      </button>
      {status === "error" && <p className="mt-2 text-center text-sm font-bold text-red-600">始められませんでした</p>}
    </>
  );
}
