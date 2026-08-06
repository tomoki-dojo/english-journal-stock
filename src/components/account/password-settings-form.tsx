"use client";

import { useState, type FormEvent } from "react";
import { createClientBrowser } from "@/lib/supabase/client";

type Status = "idle" | "saving" | "success" | "error";

const MIN_LENGTH = 8;

// ログイン中のユーザーがパスワードを新規設定/変更するためのフォーム。
// updateUser はセッションが必要なため、未ログイン状態では使えない
// （呼び出し元の /settings ページで未ログイン時はリダイレクトしている）。
export function PasswordSettingsForm() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    if (password.length < MIN_LENGTH) {
      setStatus("error");
      setMessage(`パスワードは${MIN_LENGTH}文字以上にしてください`);
      return;
    }
    if (password !== confirm) {
      setStatus("error");
      setMessage("確認用パスワードが一致しません");
      return;
    }

    setStatus("saving");

    const supabase = createClientBrowser();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setStatus("error");
      setMessage(error.message);
      return;
    }

    setStatus("success");
    setMessage("パスワードを設定しました。次回からパスワードでログインできます。");
    setPassword("");
    setConfirm("");
  }

  return (
    <section className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-100/50 p-5">
      <div>
        <h2 className="text-base font-semibold text-zinc-900">パスワードでログイン</h2>
        <p className="mt-1 text-xs text-zinc-500">
          パスワードを設定すると、次回からマジックリンクなしでログインできます。
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-2">
          <label
            htmlFor="new-password"
            className="text-xs font-medium uppercase tracking-wider text-zinc-500"
          >
            新しいパスワード
          </label>
          <input
            id="new-password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder={`${MIN_LENGTH}文字以上`}
            className="w-full rounded-lg border border-zinc-400 bg-zinc-300/60 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 transition-colors focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </div>

        <div className="space-y-2">
          <label
            htmlFor="confirm-password"
            className="text-xs font-medium uppercase tracking-wider text-zinc-500"
          >
            確認用
          </label>
          <input
            id="confirm-password"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            placeholder="もう一度入力"
            className="w-full rounded-lg border border-zinc-400 bg-zinc-300/60 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 transition-colors focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </div>

        <button
          type="submit"
          disabled={status === "saving"}
          className="w-full rounded-lg bg-accent/20 px-4 py-2.5 text-sm font-medium text-accent ring-1 ring-accent/30 transition-colors hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "saving" ? "保存中..." : "パスワードを設定する"}
        </button>
      </form>

      {message && (
        <p
          className={
            status === "error"
              ? "text-xs text-red-600"
              : "text-xs text-emerald-600"
          }
        >
          {message}
        </p>
      )}
    </section>
  );
}
