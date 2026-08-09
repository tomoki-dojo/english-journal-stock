"use client";

import { useEffect, useId, useRef, useState } from "react";

declare global {
  interface Window {
    adsbygoogle?: unknown[];
  }
}

type AdUnitProps = {
  slot: string;
  className?: string;
  format?: string;
  // インフィード広告など「fluid」レイアウトを使う広告ユニットの場合に指定する。
  // AdSenseの広告ユニット作成画面でスニペットと一緒に発行される
  // data-ad-layout-key の値（例: "-fb+5w+4e-db+86"）をそのまま渡す。
  layoutKey?: string;
};

const ADSENSE_CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID;

// AdSenseの広告枠を1つ表示する再利用可能なコンポーネント（math-journal-stockと同じ実装）。
// NEXT_PUBLIC_ADSENSE_CLIENT_ID（パブリッシャーID、ca-pub-...）が未設定の間は、
// 開発中や本番投入前でも壊れないように「広告スペース」のプレースホルダーを表示する。
// AdSenseの審査・広告ユニット作成が終わって環境変数を設定したら、自動的に実広告に切り替わる。
//
// スクリプト（adsbygoogle.js）はページ全体で1回だけ読み込めばよいので、
// 既に読み込み済みかどうかをdata属性でチェックしてから追加する。
export function AdUnit({ slot, className, format = "auto", layoutKey }: AdUnitProps) {
  const insRef = useRef<HTMLModElement>(null);
  const pushedRef = useRef(false);
  const [scriptReady, setScriptReady] = useState(false);
  const uid = useId();

  useEffect(() => {
    if (!ADSENSE_CLIENT_ID) return;

    const existingScript = document.querySelector<HTMLScriptElement>(
      'script[data-adsense-loader="true"]'
    );

    if (existingScript) {
      if (window.adsbygoogle) {
        setScriptReady(true);
      } else {
        existingScript.addEventListener("load", () => setScriptReady(true));
      }
      return;
    }

    const script = document.createElement("script");
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT_ID}`;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.dataset.adsenseLoader = "true";
    script.onload = () => setScriptReady(true);
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    if (!scriptReady || !ADSENSE_CLIENT_ID || pushedRef.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushedRef.current = true;
    } catch {
      // 広告ブロッカー等でpushが失敗しても致命的ではないので握りつぶす
    }
  }, [scriptReady]);

  if (!ADSENSE_CLIENT_ID) {
    return (
      <div
        className={`flex min-h-[90px] items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-100/60 text-xs text-zinc-400 ${className ?? ""}`}
      >
        広告スペース（AdSense未設定）
      </div>
    );
  }

  if (layoutKey) {
    return (
      <ins
        key={uid}
        ref={insRef}
        className={`adsbygoogle block ${className ?? ""}`}
        style={{ display: "block" }}
        data-ad-client={ADSENSE_CLIENT_ID}
        data-ad-slot={slot}
        data-ad-format="fluid"
        data-ad-layout-key={layoutKey}
      />
    );
  }

  return (
    <ins
      key={uid}
      ref={insRef}
      className={`adsbygoogle block ${className ?? ""}`}
      style={{ display: "block" }}
      data-ad-client={ADSENSE_CLIENT_ID}
      data-ad-slot={slot}
      data-ad-format={format}
      data-full-width-responsive="true"
    />
  );
}
