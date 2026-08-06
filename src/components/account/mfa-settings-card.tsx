"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import {
  listMfaFactors,
  enrollTotpFactor,
  verifyTotpEnrollment,
  unenrollFactor,
} from "@/lib/supabase/mfa";

type Status = "loading" | "enrolled" | "not-enrolled" | "enrolling" | "error";

type EnrollData = {
  factorId: string;
  qrCodeSvg: string;
  secret: string;
};

// 管理者アカウント向けの二要素認証(TOTP)設定UI。
// 管理画面（/admin/notifications）は、これを有効化して検証済みにしないとアクセスできない。
export function MfaSettingsCard() {
  const [status, setStatus] = useState<Status>("loading");
  const [enrollData, setEnrollData] = useState<EnrollData | null>(null);
  const [code, setCode] = useState("");
  const [verifyError, setVerifyError] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [existingFactorId, setExistingFactorId] = useState<string | null>(null);

  async function refresh() {
    setStatus("loading");
    const { data, error } = await listMfaFactors();
    if (error) {
      setStatus("error");
      return;
    }
    const verifiedTotp = data.totp.find((f) => f.status === "verified");
    if (verifiedTotp) {
      setExistingFactorId(verifiedTotp.id);
      setStatus("enrolled");
    } else {
      setExistingFactorId(null);
      setStatus("not-enrolled");
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleStartEnroll() {
    const { data, error } = await enrollTotpFactor();
    if (error || !data) {
      setStatus("error");
      return;
    }
    setEnrollData({
      factorId: data.id,
      qrCodeSvg: data.totp.qr_code,
      secret: data.totp.secret,
    });
    setStatus("enrolling");
  }

  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    if (!enrollData) return;
    setVerifying(true);
    setVerifyError("");

    const { error } = await verifyTotpEnrollment(enrollData.factorId, code.trim());
    setVerifying(false);

    if (error) {
      setVerifyError("コードが正しくありません。認証アプリの表示を確認してもう一度入力してください。");
      return;
    }

    setEnrollData(null);
    setCode("");
    await refresh();
  }

  async function handleDisable() {
    if (!existingFactorId) return;
    if (!window.confirm("二要素認証を無効化しますか？無効化すると管理画面にアクセスできなくなります。")) {
      return;
    }
    const { error } = await unenrollFactor(existingFactorId);
    if (error) {
      setStatus("error");
      return;
    }
    await refresh();
  }

  return (
    <div className="rounded-xl border border-zinc-200/60 bg-zinc-100/40 p-4">
      <h2 className="text-sm font-medium text-zinc-900">二要素認証（管理者向け）</h2>
      <p className="mt-1 text-xs text-zinc-500">
        認証アプリ（Google Authenticatorなど）を使ったTOTP認証。管理画面へのアクセスに必須。
      </p>

      <div className="mt-3">
        {status === "loading" && <p className="text-xs text-zinc-500">読み込み中...</p>}

        {status === "error" && (
          <p className="text-xs text-red-600">状態の取得に失敗しました。ページを再読み込みしてください。</p>
        )}

        {status === "enrolled" && (
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600">
              <ShieldCheck className="h-4 w-4" />
              有効
            </span>
            <button
              type="button"
              onClick={handleDisable}
              className="flex items-center gap-1.5 text-xs text-zinc-500 hover:text-red-600"
            >
              <ShieldOff className="h-3.5 w-3.5" />
              無効化する
            </button>
          </div>
        )}

        {status === "not-enrolled" && (
          <button
            type="button"
            onClick={handleStartEnroll}
            className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white hover:bg-accent/90"
          >
            二要素認証を設定する
          </button>
        )}

        {status === "enrolling" && enrollData && (
          <form onSubmit={handleVerify} className="space-y-3">
            <p className="text-xs text-zinc-600">
              認証アプリでQRコードを読み取るか、下のシークレットキーを手動入力して登録してください。
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={enrollData.qrCodeSvg}
              alt="認証アプリ登録用QRコード"
              className="w-40 rounded-lg bg-white p-2"
            />
            <p className="break-all rounded bg-zinc-50 px-2 py-1.5 font-mono text-[11px] text-zinc-600">
              {enrollData.secret}
            </p>
            <input
              type="text"
              inputMode="numeric"
              placeholder="6桁のコード"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              className="w-32 rounded-lg border border-zinc-300 bg-zinc-50 px-3 py-2 text-sm text-zinc-900"
            />
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={verifying || code.trim().length !== 6}
                className="rounded-lg bg-accent px-3 py-2 text-xs font-medium text-white hover:bg-accent/90 disabled:opacity-50"
              >
                {verifying ? "確認中..." : "確認して有効化"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEnrollData(null);
                  setStatus("not-enrolled");
                }}
                className="rounded-lg px-3 py-2 text-xs text-zinc-500 hover:text-zinc-700"
              >
                キャンセル
              </button>
            </div>
            {verifyError && <p className="text-xs text-red-600">{verifyError}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
