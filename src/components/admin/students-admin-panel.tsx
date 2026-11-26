"use client";

import { useState, type FormEvent } from "react";
import { Check, Copy, KeyRound, Loader2, RefreshCw } from "lucide-react";
import type { StudentAccount } from "@/lib/supabase/student-accounts";
import { Toast } from "@/components/ui/toast";

type StudentsAdminPanelProps = {
  initialStudents: StudentAccount[];
};

const inputClass =
  "w-full rounded-lg border border-zinc-400 bg-zinc-300/60 px-3 py-2 text-sm text-zinc-900 placeholder:text-zinc-500 transition-colors focus:border-accent/50 focus:outline-none focus:ring-1 focus:ring-accent/30";
const labelClass = "text-xs font-medium uppercase tracking-wider text-zinc-500";

// 子どもが打ちやすいように、紛らわしい文字（l・1・o・0）を抜いた英小文字4つ＋数字4つ
function generatePassword(): string {
  const letters = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  const pick = (chars: string, n: number) =>
    Array.from(crypto.getRandomValues(new Uint32Array(n)), (v) => chars[v % chars.length]).join("");
  return pick(letters, 4) + pick(digits, 4);
}

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" });
}

export function StudentsAdminPanel({ initialStudents }: StudentsAdminPanelProps) {
  const [students, setStudents] = useState(initialStudents);
  const [loginId, setLoginId] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState(generatePassword);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  // 作った直後・付け直した直後だけパスワードを見せる（あとからは見られない）
  const [issued, setIssued] = useState<{ loginId: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState("");

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setError("");
    try {
      const res = await fetch("/api/admin/students", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ loginId, displayName, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "作成できませんでした");
        return;
      }
      const created = json.student as StudentAccount;
      setStudents((prev) => [...prev, created].sort((a, b) => a.loginId.localeCompare(b.loginId)));
      setIssued({ loginId: created.loginId, password });
      setCopied(false);
      setLoginId("");
      setDisplayName("");
      setPassword(generatePassword());
    } finally {
      setPending(false);
    }
  }

  async function handleReset(student: StudentAccount) {
    if (resettingId) return;
    const next = generatePassword();
    setResettingId(student.userId);
    try {
      const res = await fetch(`/api/admin/students/${student.userId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password: next }),
      });
      const json = await res.json();
      if (!res.ok) {
        setToastMessage(json.error ?? "付け直せませんでした");
        return;
      }
      setIssued({ loginId: student.loginId, password: next });
      setCopied(false);
    } finally {
      setResettingId(null);
    }
  }

  async function copyIssued() {
    if (!issued) return;
    await navigator.clipboard.writeText(`ID: ${issued.loginId}\nパスワード: ${issued.password}`);
    setCopied(true);
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleCreate}
        className="space-y-4 rounded-xl border border-zinc-200 bg-zinc-100/50 p-5 md:p-6"
      >
        <h2 className="text-base font-semibold text-zinc-900">生徒を追加</h2>

        <div className="space-y-2">
          <label htmlFor="student-id" className={labelClass}>
            ID
          </label>
          <input
            id="student-id"
            value={loginId}
            onChange={(e) => setLoginId(e.target.value.toLowerCase())}
            placeholder="例: jonan-taro"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            pattern="[a-z0-9_\-]{3,20}"
            required
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="student-name" className={labelClass}>
            表示名
          </label>
          <input
            id="student-name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="例: たろう"
            maxLength={30}
            className={inputClass}
          />
        </div>

        <div className="space-y-2">
          <label htmlFor="student-password" className={labelClass}>
            パスワード
          </label>
          <div className="flex gap-2">
            <input
              id="student-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              required
              className={`${inputClass} font-mono`}
            />
            <button
              type="button"
              onClick={() => setPassword(generatePassword())}
              aria-label="パスワードを作り直す"
              className="shrink-0 rounded-lg border border-zinc-300 px-3 text-zinc-500 hover:text-zinc-800"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-50"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          作成
        </button>
      </form>

      {issued && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-5">
          <p className="font-mono text-sm text-zinc-900">ID: {issued.loginId}</p>
          <p className="font-mono text-sm text-zinc-900">パスワード: {issued.password}</p>
          <button
            type="button"
            onClick={() => void copyIssued()}
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 hover:text-emerald-900"
          >
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "コピーしました" : "コピー"}
          </button>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-zinc-200">
        <div className="grid grid-cols-[1fr_1fr_auto_auto_auto] gap-x-4 bg-zinc-100 px-4 py-2 text-xs font-medium text-zinc-500">
          <span>ID</span>
          <span>表示名</span>
          <span>作成</span>
          <span>最終ログイン</span>
          <span />
        </div>
        {students.length === 0 && <p className="px-4 py-6 text-center text-sm text-zinc-400">まだいません</p>}
        {students.map((s) => (
          <div
            key={s.userId}
            className="grid grid-cols-[1fr_1fr_auto_auto_auto] items-center gap-x-4 border-t border-zinc-100 px-4 py-2.5 text-sm"
          >
            <span className="font-mono text-zinc-900">{s.loginId}</span>
            <span className="text-zinc-600">{s.displayName ?? "—"}</span>
            <span className="text-xs text-zinc-500">{formatDate(s.createdAt)}</span>
            <span className="text-xs text-zinc-500">{formatDate(s.lastSignInAt)}</span>
            <button
              type="button"
              onClick={() => void handleReset(s)}
              disabled={resettingId !== null}
              title="パスワードを付け直す"
              aria-label={`${s.loginId} のパスワードを付け直す`}
              className="rounded-md p-1.5 text-zinc-400 hover:text-accent disabled:opacity-50"
            >
              {resettingId === s.userId ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <KeyRound className="h-4 w-4" />
              )}
            </button>
          </div>
        ))}
      </div>

      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage("")} />}
    </div>
  );
}
