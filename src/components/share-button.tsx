"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

// 共有ボタン。共有シートが使える端末(主にスマホ)はそれを開き、使えない環境ではリンクをコピーする。
// 共有するURLはLP(/welcome)。流入元をGA4で見分けられるよう utm_campaign を付ける。
type Props = {
  text: string;
  campaign: string;
  label?: string;
  className?: string;
};

const SHARE_TITLE = "喋って！育てろ！英クワたん";

export function ShareButton({ text, campaign, label = "友だちに教える", className }: Props) {
  const [copied, setCopied] = useState(false);

  async function share() {
    const url = `${window.location.origin}/welcome?utm_source=share&utm_medium=app&utm_campaign=${campaign}`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: SHARE_TITLE, text, url });
        return;
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        // 共有に失敗したときはコピーにフォールバックする
      }
    }
    try {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // クリップボードも使えない環境では何もしない
    }
  }

  return (
    <button
      type="button"
      onClick={() => void share()}
      className={
        className ??
        "inline-flex items-center justify-center gap-1.5 rounded-full border-2 border-[#eaaccb] bg-white px-5 py-2.5 text-sm font-black text-[#e5215a] transition-transform active:scale-95"
      }
    >
      {copied ? <Check className="h-4 w-4" strokeWidth={3} /> : <Share2 className="h-4 w-4" />}
      {copied ? "コピーしました" : label}
    </button>
  );
}
