"use client";

import { useEffect, useState } from "react";
import { createClientBrowser } from "@/lib/supabase/client";

export const GUEST_UPGRADE_FLAG = "guest_upgrade_pending";

// ゲスト(匿名ログイン)の登録。新しいアカウントを作らず、いまのアカウントにGoogle/メールを紐付けるので、
// つかまえた虫はそのまま残る。
export function GuestRegisterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");
  const [googleStatus, setGoogleStatus] = useState<"idle" | "redirecting" | "error">("idle");

  // すでに登録済みの人が開いたときは、部屋へ進める
  useEffect(() => {
    createClientBrowser()
      .auth.getUser()
      .then(({ data }) => {
        if (data.user && data.user.is_anonymous !== true) window.location.href = "/roadmap";
      })
      .catch(() => {});
  }, []);

  const callback = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent("/roadmap")}`;
  const markPending = () => {
    try {
      window.localStorage.setItem(GUEST_UPGRADE_FLAG, "1");
    } catch {
      // 計測用の印なので、保存できなくても登録は続けられる
    }
  };

  const handleGoogle = async () => {
    setGoogleStatus("redirecting");
    markPending();
    const { error: linkError } = await createClientBrowser().auth.linkIdentity({
      provider: "google",
      options: { redirectTo: callback() },
    });
    if (linkError) setGoogleStatus("error");
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("sending");
    setError("");
    markPending();
    const { error: updateError } = await createClientBrowser().auth.updateUser(
      { email },
      { emailRedirectTo: callback() },
    );
    if (updateError) {
      setStatus("error");
      setError(
        /already|registered|exists/i.test(updateError.message)
          ? "このメールアドレスはすでに登録されています"
          : "送信できませんでした。メールアドレスを確認してください",
      );
      return;
    }
    setStatus("sent");
  };

  // 登録済みのアカウントに入り直す(ゲストのデータは引き継がれない)
  const handleExisting = async () => {
    await createClientBrowser().auth.signOut();
    window.location.href = `/login?reason=roadmap&next=${encodeURIComponent("/roadmap")}`;
  };

  return (
    <div className="mx-auto mt-6 max-w-sm">
      <h1 className="mb-4 text-xl font-bold text-zinc-900">登録（無料）</h1>

      <button
        type="button"
        onClick={handleGoogle}
        disabled={googleStatus === "redirecting"}
        className="mb-2 flex w-full items-center justify-center gap-2 rounded border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
      >
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        {googleStatus === "redirecting" ? "Googleへ移動中..." : "Googleで登録"}
      </button>
      {googleStatus === "error" && <p className="mb-2 text-sm text-red-600">Googleでの登録を始められませんでした</p>}

      <div className="my-3 flex items-center gap-3 text-xs text-zinc-400">
        <span className="h-px flex-1 bg-zinc-200" />
        <span>または</span>
        <span className="h-px flex-1 bg-zinc-200" />
      </div>

      {status === "sent" ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {email} に確認メールを送りました。メールのリンクを開くと登録が完了します。
        </p>
      ) : (
        <form onSubmit={handleEmail} className="space-y-2">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="メールアドレス"
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full rounded bg-[#e5215a] px-3 py-2 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {status === "sending" ? "送信中..." : "メールで登録"}
          </button>
          {status === "error" && <p className="text-sm text-red-600">{error}</p>}
        </form>
      )}

      <button
        type="button"
        onClick={handleExisting}
        className="mt-6 block w-full text-center text-xs font-semibold text-zinc-500 underline underline-offset-4"
      >
        登録済みの方はサインイン
      </button>
    </div>
  );
}
