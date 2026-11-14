"use client";

import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { ShareCard, SHARE_CARD_SIZE, type ShareCardData, type ShareCardLayout } from "@/components/share/share-card";

// シェア用カード（components/share/share-card.tsx）を画面の外で描いて、PNGにする。
// 画面の一部をそのまま写す方式（以前の captureRef）より、いつも同じ形・大きさの画像になる。
export async function renderShareCard(data: ShareCardData, layout: ShareCardLayout): Promise<Blob | null> {
  if (typeof document === "undefined") return null;
  const { width, height } = SHARE_CARD_SIZE[layout];
  const host = document.createElement("div");
  // 画面の外に置く（display:none だと画像化できないので、見えない位置に置くだけにする）
  Object.assign(host.style, { position: "fixed", left: "-10000px", top: "0", width: `${width}px`, height: `${height}px`, pointerEvents: "none" });
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    root.render(createElement(ShareCard, { data, layout }));
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    // 虫のパーツ・マスコットの画像が読み込み終わるまで待つ
    const imgs = Array.from(host.querySelectorAll("img"));
    await Promise.all(imgs.map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined))));
    const node = host.firstElementChild as HTMLElement | null;
    if (!node) return null;
    const { toBlob } = await import("html-to-image");
    return await toBlob(node, { pixelRatio: 2, width, height, cacheBust: false });
  } catch {
    return null;
  } finally {
    root.unmount();
    host.remove();
  }
}

// 横長のカードをサーバーに置き、リンクのプレビュー（/s/<id>）用のIDをもらう。失敗・時間切れならnull。
export async function uploadShareCard(png: Blob, campaign: string, timeoutMs = 3000): Promise<string | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`/api/share-card?campaign=${encodeURIComponent(campaign)}`, {
      method: "POST",
      headers: { "Content-Type": "image/png" },
      body: png,
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { id?: string };
    return typeof json.id === "string" ? json.id : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
