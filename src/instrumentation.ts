import * as Sentry from "@sentry/nextjs";

// サーバー側のエラー監視（Sentry）。DSNが未設定なら何もしない。
// Server Component・Route Handler・Server Actionで握りつぶされなかった例外が送られる。
// try/catchでJSONエラーを返しているAPIの例外は送られないので、必要な所では Sentry.captureException を呼ぶ。
export async function register() {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return;
  if (process.env.NEXT_RUNTIME === "nodejs" || process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV,
      // パフォーマンス計測は使わない（エラー監視だけ）。
      tracesSampleRate: 0,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
