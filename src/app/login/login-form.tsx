"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClientBrowser } from "@/lib/supabase/client";

type Mode = "password" | "magic";

// ログインが必要な画面から飛ばされてきたとき、「なぜこの画面に来たか」を一言で伝える案内文言。
// 各ページのredirect("/login?reason=...")と対応させること。
const REASON_MESSAGES: Record<string, string> = {
  mylist: "マイリストは無料ログインでご利用いただけます。",
  "vocabulary-learn": "単語学習は無料ログインでご利用いただけます（効率よく復習はPro限定です）。",
  "vocabulary-learn-quiz": "「今日の復習」は無料ログイン後、Pro会員限定でご利用いただけます。",
  "vocabulary-learn-random": "ランダム学習は無料ログインでご利用いただけます。",
  "vocabulary-learn-start": "単語の学習を始めるには無料ログインが必要です（効率よく復習はPro限定です）。",
  audio: "例文の音声再生には無料ログインが必要です（Pro会員限定の機能です）。",
  settings: "アカウント設定は無料ログインが必要です。",
  "writing-feedback": "AI添削機能は無料ログインでご利用いただけます（月の利用回数に上限があります）。",
  practice: "「演習」は無料ログインでご利用いただけます（一部の機能はPro限定です）。",
  roadmap: "「喋って！育てろ！英クワたん」アプリは無料ログインでご利用いただけます（一部の機能はPro限定です）。",
};

type LoginFormProps = {
  reason?: string;
  // ログイン後に戻る先。未指定ならダッシュボード（"/"）。
  // "/"始まりの内部パス以外（外部URL等）は無視してオープンリダイレクトを防ぐ。
  next?: string;
  // 初期表示のログイン方法。サインアップ導線（メールだけで始められるマジックリンク）から来た場合に "magic"。
  mode?: Mode;
};

function sanitizeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  return next;
}

export function LoginForm({ reason, next, mode: initialMode }: LoginFormProps) {
  const redirectTo = sanitizeNext(next);
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(initialMode ?? "password");

  // マジックリンク用
  const [email, setEmail] = useState("");
  const [magicStatus, setMagicStatus] = useState<
    "idle" | "sending" | "sent" | "error"
  >("idle");
  const [magicError, setMagicError] = useState("");

  // パスワード用
  const [pwEmail, setPwEmail] = useState("");
  const [pwPassword, setPwPassword] = useState("");
  const [pwStatus, setPwStatus] = useState<"idle" | "sending" | "error">(
    "idle"
  );
  const [pwError, setPwError] = useState("");

  const reasonMessage = reason ? REASON_MESSAGES[reason] : undefined;

  // Googleでログイン。Googleの画面から戻ってきたら /auth/callback で ?code=... をセッションに交換する。
  const [googleStatus, setGoogleStatus] = useState<"idle" | "redirecting" | "error">("idle");
  const handleGoogle = async () => {
    setGoogleStatus("redirecting");
    const supabase = createClientBrowser();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      },
    });
    if (error) setGoogleStatus("error");
  };

  const handleMagicSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMagicStatus("sending");
    setMagicError("");

    const supabase = createClientBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // メール内リンクをクリックした後にここへ戻ってくる（nextで元のページに戻す）
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(redirectTo)}`,
      },
    });

    if (error) {
      setMagicStatus("error");
      setMagicError(error.message);
      return;
    }

    setMagicStatus("sent");
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwStatus("sending");
    setPwError("");

    // ログイン失敗回数を記録・ロックできるよう、専用APIルート経由でログインする
    // （supabase.auth.signInWithPassword を直接呼ばない）
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: pwEmail, password: pwPassword }),
    });
    const json = await res.json();

    if (!res.ok) {
      setPwStatus("error");
      setPwError(json.error ?? "ログインに失敗しました");
      return;
    }

    router.push(redirectTo);
    router.refresh();
  };

  return (
    <div className="max-w-sm mx-auto mt-20">
      <h1 className="text-xl font-bold mb-4">ログイン</h1>

      {reasonMessage && (
        <div className="mb-5 rounded-lg border border-accent/20 bg-accent/5 px-4 py-3 text-sm text-zinc-700">
          {reasonMessage}
        </div>
      )}

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
        {googleStatus === "redirecting" ? "Googleへ移動中..." : "Googleでログイン"}
      </button>
      {googleStatus === "error" && (
        <p className="mb-2 text-sm text-red-600">Googleでのログインを始められませんでした</p>
      )}
      <div className="mb-3 flex items-center gap-3 text-xs text-zinc-400">
        <span className="h-px flex-1 bg-zinc-200" />
        <span>または</span>
        <span className="h-px flex-1 bg-zinc-200" />
      </div>

      <div className="mb-5 flex gap-1 rounded-lg border p-1 text-sm">
        <button
          type="button"
          onClick={() => setMode("password")}
          className={`flex-1 rounded-md px-3 py-1.5 transition-colors ${
            mode === "password" ? "bg-black text-white" : "text-gray-600"
          }`}
        >
          パスワード
        </button>
        <button
          type="button"
          onClick={() => setMode("magic")}
          className={`flex-1 rounded-md px-3 py-1.5 transition-colors ${
            mode === "magic" ? "bg-black text-white" : "text-gray-600"
          }`}
        >
          メールでログイン
        </button>
      </div>

      {mode === "password" ? (
        <form onSubmit={handlePasswordSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="メールアドレス"
            value={pwEmail}
            onChange={(e) => setPwEmail(e.target.value)}
            className="border rounded px-3 py-2"
          />
          <input
            type="password"
            required
            placeholder="パスワード"
            value={pwPassword}
            onChange={(e) => setPwPassword(e.target.value)}
            className="border rounded px-3 py-2"
          />
          <button
            type="submit"
            disabled={pwStatus === "sending"}
            className="bg-black text-white rounded px-3 py-2 disabled:opacity-50"
          >
            {pwStatus === "sending" ? "ログイン中..." : "ログイン"}
          </button>
          {pwStatus === "error" && (
            <p className="text-red-600 text-sm">{pwError}</p>
          )}
          <p className="text-xs text-gray-500">
            まだパスワード未設定の場合は、一度メールでログイン後、
            アカウント設定画面でパスワードを設定してください。
          </p>
        </form>
      ) : magicStatus === "sent" ? (
        <div className="text-center">
          <p>
            {email} 宛にログイン用のリンクを送信しました。メールを確認してください。
          </p>
          <p className="mt-3 text-sm text-gray-600">
            届かないときは、迷惑メールフォルダもご確認ください。
          </p>
          <button
            type="button"
            onClick={() => setMagicStatus("idle")}
            className="mt-4 text-sm text-gray-500 underline hover:text-gray-700"
          >
            メールアドレスを入れ直す
          </button>
        </div>
      ) : (
        <form onSubmit={handleMagicSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border rounded px-3 py-2"
          />
          <button
            type="submit"
            disabled={magicStatus === "sending"}
            className="bg-black text-white rounded px-3 py-2 disabled:opacity-50"
          >
            {magicStatus === "sending" ? "送信中..." : "ログインリンクを送る"}
          </button>
          {magicStatus === "error" && (
            <p className="text-red-600 text-sm">{magicError}</p>
          )}
        </form>
      )}

      <p className="mt-6 text-center text-xs text-gray-500">
        ログインすることで
        <a href="/terms" className="underline hover:text-gray-700">
          利用規約
        </a>
        および
        <a href="/privacy" className="underline hover:text-gray-700">
          プライバシーポリシー
        </a>
        に同意したものとみなされます。
      </p>
    </div>
  );
}
