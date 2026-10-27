"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/analytics";

// ゲストが登録を終えて戻ってきたとき、guest_signup を1回だけ送る(登録画面で付けた印を見る)。
export function GuestSignupTracker({ isAnonymous }: { isAnonymous: boolean }) {
  useEffect(() => {
    if (isAnonymous) return;
    try {
      if (window.localStorage.getItem("guest_upgrade_pending") === "1") {
        window.localStorage.removeItem("guest_upgrade_pending");
        trackEvent("guest_signup");
      }
    } catch {
      // 計測の失敗で画面を壊さない
    }
  }, [isAnonymous]);
  return null;
}
