import Script from "next/script";
import { GA_INTERNAL_PARAM, GA_INTERNAL_STORAGE_KEY } from "@/lib/analytics-internal";

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

// Google Analytics (GA4) の計測タグ。全プラン・全ページで読み込む
// （広告と違い、Pro/Premiumも含めた利用状況・コンバージョン分析のため）。
// NEXT_PUBLIC_GA_MEASUREMENT_ID（G-XXXXXXXXXX）が未設定の間は何も出力しない。
// 自分（開発者）のテストのアクセスには traffic_type=internal を付ける。GA4の「データフィルタ」で
// 「Internal Traffic」を有効にすると、集計から除かれる（仕組みは lib/analytics-internal.ts 参照）。
export function GoogleAnalytics() {
  if (!GA_MEASUREMENT_ID) return null;

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          var gaInternal = false;
          try {
            var gaParam = new URLSearchParams(window.location.search).get('${GA_INTERNAL_PARAM}');
            if (gaParam === '1') window.localStorage.setItem('${GA_INTERNAL_STORAGE_KEY}', '1');
            if (gaParam === '0') window.localStorage.removeItem('${GA_INTERNAL_STORAGE_KEY}');
            gaInternal = window.localStorage.getItem('${GA_INTERNAL_STORAGE_KEY}') === '1';
          } catch (e) {}
          gtag('config', '${GA_MEASUREMENT_ID}', gaInternal ? { traffic_type: 'internal' } : {});
        `}
      </Script>
    </>
  );
}
