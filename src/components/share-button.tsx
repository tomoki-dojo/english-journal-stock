"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Check, Share2 } from "lucide-react";
import { trackEvent } from "@/lib/analytics";
import type { ShareCardData } from "@/components/share/share-card";
import { renderShareCard, uploadShareCard } from "@/lib/share-image";

// 共有ボタン。共有シートが使える端末(主にスマホ)はそれを開き、使えない環境ではリンクをコピーする。
// card を渡すと、シェア用の画像カード（虫のイラスト・名前・ロゴ入り）を作って一緒に共有し、
// リンクも /s/<id>（貼るとそのカードがプレビューに出るページ）にする。カードを作れないときは紹介ページ（/welcome）。
// 流入元をGA4で見分けられるよう utm_campaign を付ける。
// captureRef（画面の一部をそのまま画像にする旧方式）は、card を渡していない呼び出し元のために残している。
type Props = {
  text: string;
  campaign: string;
  label?: string;
  className?: string;
  captureRef?: RefObject<HTMLElement | null>;
  card?: ShareCardData;
  // 画面に出た時点で画像を作ってアップロードしておく（押してから共有シートが開くまでを短くする。
  // iPhoneは押してから時間がかかると共有シートを開けないため）。何度も出る画面（単語ノートの結果など）は false。
  prefetch?: boolean;
};

const SHARE_TITLE = "喋って！育てろ！英クワたん";

async function captureNode(node: HTMLElement): Promise<Blob | null> {
  try {
    const { toBlob } = await import("html-to-image");
    return await toBlob(node, {
      pixelRatio: 2,
      backgroundColor: "#2a1a05",
      // 紙吹雪はアニメーション途中の位置で写ってしまうので除く
      filter: (el) => !(el instanceof HTMLElement && el.classList.contains("animate-egg-confetti")),
    });
  } catch {
    return null;
  }
}

type Prepared = { file: File | null; id: string | null };

async function prepare(card: ShareCardData, campaign: string): Promise<Prepared> {
  const [portrait, landscape] = await Promise.all([renderShareCard(card, "portrait"), renderShareCard(card, "landscape")]);
  const id = landscape ? await uploadShareCard(landscape, campaign) : null;
  return { file: portrait ? new File([portrait], "eikuwatan.png", { type: "image/png" }) : null, id };
}

export function ShareButton({ text, campaign, label = "友だちに教える", className, captureRef, card, prefetch = true }: Props) {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const prepared = useRef<Promise<Prepared> | null>(null);
  const cardKey = card ? JSON.stringify(card) : "";

  useEffect(() => {
    prepared.current = null;
    if (!card || !prefetch) return;
    // 演出のアニメーションと重ならないよう、少し待ってから裏で作る
    const t = window.setTimeout(() => {
      prepared.current = prepare(card, campaign);
    }, 600);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey, campaign, prefetch]);

  async function share() {
    if (busy) return;
    setBusy(true);
    trackEvent("share_click", { campaign });
    try {
      let file: File | null = null;
      let id: string | null = null;
      if (card) {
        const p = await (prepared.current ?? (prepared.current = prepare(card, campaign)));
        file = p.file;
        id = p.id;
      } else if (captureRef?.current && typeof navigator.share === "function") {
        const blob = await captureNode(captureRef.current);
        file = blob ? new File([blob], "eikuwatan.png", { type: "image/png" }) : null;
      }
      const utm = `utm_source=share&utm_medium=app&utm_campaign=${campaign}`;
      const url = id ? `${window.location.origin}/s/${id}?${utm}` : `${window.location.origin}/welcome?${utm}`;
      const params = { campaign, link: id ? "card" : "welcome", image: Boolean(file) };

      if (typeof navigator.share === "function") {
        try {
          if (file && navigator.canShare?.({ files: [file] })) {
            await navigator.share({ title: SHARE_TITLE, text, url, files: [file] });
          } else {
            await navigator.share({ title: SHARE_TITLE, text, url });
          }
          trackEvent("share_complete", { ...params, method: "native" });
          return;
        } catch (err) {
          if (err instanceof DOMException && err.name === "AbortError") {
            trackEvent("share_cancel", { campaign });
            return;
          }
          // 共有に失敗したとき（押してから時間がかかりすぎた等）はコピーにフォールバックする
        }
      }
      try {
        await navigator.clipboard.writeText(`${text}\n${url}`);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2000);
        trackEvent("share_complete", { ...params, method: "copy" });
      } catch {
        // クリップボードも使えない環境では何もしない
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={() => void share()}
      aria-busy={busy}
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
