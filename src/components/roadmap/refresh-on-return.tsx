"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// ブラウザの「戻る／進む」やタブへの復帰で、前に見た画面の古いデータが出てしまうのを防ぐ。
// 通常のリンク移動では何もしない（余計な再取得はしない）。
export function RefreshOnReturn() {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      // 移動が終わってから、いまの画面のサーバーデータを取り直す。
      timer = setTimeout(() => router.refresh(), 50);
    };
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) refresh();
    };
    window.addEventListener("popstate", refresh);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("popstate", refresh);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [router]);

  return null;
}
