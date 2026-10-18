// GA4へのイベント送信（クライアント側）。GA4のタグ（components/analytics/google-analytics.tsx）が
// 読み込まれていない環境（測定ID未設定・広告ブロッカー等）では何もしない。
// 英クワたんの課金までの流れ（Pro案内を見た→決済に進んだ→課金した、棚・AI判定の上限に当たった）を
// 測るために使う。イベント名・パラメータは _reference/monetization-strategy-memo.md 9章参照。

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export type AnalyticsParams = Record<string, string | number | boolean | undefined>;

export function trackEvent(name: string, params: AnalyticsParams = {}): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return;
  try {
    window.gtag("event", name, params);
  } catch {
    // 計測の失敗で画面を壊さない
  }
}

// 同じイベントを1回だけ送る（onceKeyごと、このタブの間）。同じ画面に同じきっかけが2回出ても二重に数えないため。
export function trackEventOnce(onceKey: string, name: string, params: AnalyticsParams = {}): void {
  try {
    const key = `ga_once:${onceKey}`;
    if (window.sessionStorage.getItem(key)) return;
    window.sessionStorage.setItem(key, "1");
  } catch {
    // sessionStorageが使えない環境では、重複を許して送る
  }
  trackEvent(name, params);
}
