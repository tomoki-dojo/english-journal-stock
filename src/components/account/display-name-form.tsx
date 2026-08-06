"use client";

import { useState, type FormEvent } from "react";

type Status = "idle" | "saving" | "success" | "error";

const MAX_LENGTH = 40;

type DisplayNameFormProps = {
  initialDisplayName: string;
};

// 公開ストックでの作成者表示に使う表示名の設定フォーム。
// 未設定のユーザーの問題は「匿名ユーザー」表示になる。
export function DisplayNameForm({ initialDisplayName }: DisplayNameFormProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");

    if (!displayName.trim()) {
      setStatus("error");
      setMessage("表示名を入力してください");
      return;
    }

    setStatus("saving");

    try {
      const res = await fetch("/api/account/display-name", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName }),
      });

      const json = await res.json();

      if (!res.ok) {
        setStatus("error");
        setMessage(json.error ?? "更新に失敗しました");
        return;
      }

      setStatus("success");
      setMessage("表示名を更新しました。");
      setDisplayName(json.displayName ?? displayName);
    } catch {
      setStatus("error");
      setMessage("通信に失敗しました");
    }
  }

  return (
    <section className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-100/50 p-5">
      <div>
        <h2 className="text-base font-semibold text-zinc-900">表示名</h2>
        <p className="mt-1 text-xs text-zinc-500">
          公開ストックに問題を公開したとき、作成者として表示される名前です。未設定の場合は「匿名ユーザー」と表示されます。
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="space-y-2">
          <label
            htmlFor="display-name"
            className="text-xs font-medium uppercase tracking-wider text-zinc-500"
          >
            表示名
          </label>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            maxLength={MAX_LENGTH}
            placeholder="例：どーじょー"
            className="w-full rounded-lg border border-zinc-400 bg-zinc-300/60 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 transition-colors focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
          />
        </div>

        <button
          type="submit"
          disabled={status === "saving"}
          className="w-full rounded-lg bg-accent/20 px-4 py-2.5 text-sm font-medium text-accent ring-1 ring-accent/30 transition-colors hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {status === "saving" ? "保存中..." : "表示名を保存する"}
        </button>
      </form>

      {message && (
        <p
          className={
            status === "error" ? "text-xs text-red-600" : "text-xs text-emerald-600"
          }
        >
          {message}
        </p>
      )}
    </section>
  );
}
