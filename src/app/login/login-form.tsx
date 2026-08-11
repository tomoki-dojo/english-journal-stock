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
};

type LoginFormProps = {
  reason?: string;
};

export function LoginForm({ reason }: LoginFormProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("password");

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

  const handleMagicSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMagicStatus("sending");
    setMagicError("");

    const supabase = createClientBrowser();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        // メール内リンクをクリックした後にここへ戻ってくる
        emailRedirectTo: `${window.location.origin}/auth/callback`,
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

    router.push("/");
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
          マジックリンク
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
            まだパスワード未設定の場合は、一度マジックリンクでログイン後、
            アカウント設定画面でパスワードを設定してください。
          </p>
        </form>
      ) : magicStatus === "sent" ? (
        <div className="text-center">
          <p>
            {email} 宛にログイン用のリンクを送信しました。メールを確認してください。
          </p>
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
