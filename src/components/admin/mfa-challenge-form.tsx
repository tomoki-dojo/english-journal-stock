"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { listMfaFactors, verifyTotpChallenge } from "@/lib/supabase/mfa";

// 管理者ログイン後、二要素認証の検証（aal1→aal2への昇格）が必要な場合の入力フォーム。
export function MfaChallengeForm() {
  const router = useRouter();
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "verifying" | "error">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      const { data, error } = await listMfaFactors();
      if (error) {
        setStatus("error");
        setError("認証情報の取得に失敗しました");
        return;
      }
      const verified = data.totp.find((f) => f.status === "verified");
      if (!verified) {
        setStatus("error");
        setError("二要素認証が設定されていません。設定画面から登録してください。");
        return;
      }
      setFactorId(verified.id);
      setStatus("ready");
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!factorId) return;
    setStatus("verifying");
    setError("");

    const { error } = await verifyTotpChallenge(factorId, code.trim());
    if (error) {
      setStatus("ready");
      setError("コードが正しくありません。もう一度お試しください。");
      return;
    }

    router.push("/admin/notifications");
    router.refresh();
  }

  if (status === "loading") {
    return <p className="text-sm text-zinc-500">読み込み中...</p>;
  }

  if (status === "error" && !factorId) {
    return <p className="text-sm text-red-600">{error}</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <input
        type="text"
        inputMode="numeric"
        placeholder="認証アプリの6桁コード"
        value={code}
        onChange={(e) => setCode(e.target.value)}
        maxLength={6}
        autoFocus
        className="rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900"
      />
      <button
        type="submit"
        disabled={status === "verifying" || code.trim().length !== 6}
        className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent/90 disabled:opacity-50"
      >
        {status === "verifying" ? "確認中..." : "確認"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </form>
  );
}
