import * as Sentry from "@sentry/nextjs";

// ブラウザ側のエラー監視（Sentry）。DSNが未設定なら何もしない。
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    tracesSampleRate: 0,
    // 利用者側の環境が原因で、こちらでは直せないノイズを除く。
    ignoreErrors: [
      "ResizeObserver loop limit exceeded",
      "ResizeObserver loop completed with undelivered notifications.",
      "Non-Error promise rejection captured",
    ],
  });
}
