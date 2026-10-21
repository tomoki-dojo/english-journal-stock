"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

// ルートレイアウトも含めてレンダリングが失敗したときの最後の砦。Sentryに送って、再読み込みボタンだけ出す。
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="ja">
      <body style={{ fontFamily: "sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0 }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontWeight: 700 }}>エラーが発生しました</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ marginTop: 12, padding: "8px 20px", borderRadius: 999, border: "1px solid #ccc", background: "#fff", cursor: "pointer" }}
          >
            再読み込み
          </button>
        </div>
      </body>
    </html>
  );
}
