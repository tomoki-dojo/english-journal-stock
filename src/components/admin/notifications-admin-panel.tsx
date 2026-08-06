"use client";

import { useState, type FormEvent } from "react";
import { Loader2, Pencil, Trash2, X } from "lucide-react";
import type { Notification } from "@/lib/supabase/notifications";
import { Toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

type NotificationsAdminPanelProps = {
  initialNotifications: Notification[];
};

const MAX_TITLE_LENGTH = 60;
const MAX_BODY_LENGTH = 400;

export function NotificationsAdminPanel({ initialNotifications }: NotificationsAdminPanelProps) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState("");

  function resetForm() {
    setEditingId(null);
    setTitle("");
    setBody("");
    setUrl("");
    setError("");
  }

  function startEdit(notification: Notification) {
    setEditingId(notification.id);
    setTitle(notification.title);
    setBody(notification.body);
    setUrl(notification.url ?? "");
    setError("");
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;

    if (!title.trim() || !body.trim()) {
      setError("タイトルと本文は必須です");
      return;
    }

    setPending(true);
    setError("");

    try {
      const payload = { title: title.trim(), body: body.trim(), url: url.trim() || undefined };
      const res = editingId
        ? await fetch(`/api/admin/notifications/${editingId}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/admin/notifications", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json.error ?? "保存に失敗しました");
        return;
      }

      if (editingId) {
        setNotifications((prev) =>
          prev.map((n) => (n.id === editingId ? json.notification : n))
        );
        setToastMessage("お知らせを更新しました");
      } else {
        setNotifications((prev) => [json.notification, ...prev]);
        setToastMessage("お知らせを作成しました");
      }
      resetForm();
    } catch {
      setError("通信に失敗しました");
    } finally {
      setPending(false);
    }
  }

  async function handleDelete(id: string) {
    if (deletingId) return;
    if (!window.confirm("このお知らせを削除しますか？")) return;

    setDeletingId(id);

    try {
      const res = await fetch(`/api/admin/notifications/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(json.error ?? "削除に失敗しました");
        return;
      }

      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (editingId === id) resetForm();
      setToastMessage("お知らせを削除しました");
    } catch {
      setError("通信に失敗しました");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <div className="space-y-8">
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-100/50 p-5 md:p-6"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-zinc-900">
              {editingId ? "お知らせを編集" : "新しいお知らせを作成"}
            </h2>
            {editingId && (
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-zinc-700"
              >
                <X className="h-3.5 w-3.5" />
                編集をやめる
              </button>
            )}
          </div>

          <div className="space-y-2">
            <label htmlFor="notif-title" className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              タイトル
            </label>
            <input
              id="notif-title"
              type="text"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={MAX_TITLE_LENGTH}
              placeholder="例：新着問題のお知らせ"
              className="w-full rounded-lg border border-zinc-400 bg-zinc-300/60 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 transition-colors focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="notif-body" className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              本文
            </label>
            <textarea
              id="notif-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              maxLength={MAX_BODY_LENGTH}
              rows={3}
              placeholder="例：〇〇分野の問題を追加しました。ぜひ解いてみてください。"
              className="w-full rounded-lg border border-zinc-400 bg-zinc-300/60 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 transition-colors focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="notif-url" className="text-xs font-medium uppercase tracking-wider text-zinc-500">
              リンク先（任意）
            </label>
            <input
              id="notif-url"
              type="text"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="例：/stock"
              className="w-full rounded-lg border border-zinc-400 bg-zinc-300/60 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 transition-colors focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={pending}
            className="flex items-center justify-center gap-2 rounded-lg bg-accent/20 px-4 py-2.5 text-sm font-medium text-accent ring-1 ring-accent/30 transition-colors hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {editingId ? "更新する" : "作成する"}
          </button>
        </form>

        <div className="space-y-3">
          <h2 className="text-base font-semibold text-zinc-900">お知らせ一覧</h2>
          {notifications.length === 0 ? (
            <p className="text-sm text-zinc-500">まだお知らせがありません。</p>
          ) : (
            <div className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100/40">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={cn(
                    "flex flex-col gap-2 p-4 sm:flex-row sm:items-start sm:justify-between",
                    editingId === notification.id && "bg-accent/5"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-zinc-900">{notification.title}</p>
                    <p className="mt-1 text-xs text-zinc-600">{notification.body}</p>
                    {notification.url && (
                      <p className="mt-1 text-[11px] text-zinc-400">リンク: {notification.url}</p>
                    )}
                    <p className="mt-1 text-[11px] text-zinc-400">
                      {new Date(notification.createdAt).toLocaleString("ja-JP")}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startEdit(notification)}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-400 bg-zinc-300/40 px-3 py-1.5 text-xs font-medium text-zinc-700 transition-colors hover:border-accent/50 hover:text-accent"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      編集
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(notification.id)}
                      disabled={deletingId === notification.id}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-400 bg-zinc-300/40 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:border-red-500/40 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      削除
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage("")} />}
    </>
  );
}
