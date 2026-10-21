// 自分（開発者）のテストのアクセスを、GA4の集計から除くための印。
// 本番でテストするとき、どの回線・どの端末（iPhoneの実機を含む）からでも除けるように、IPではなく端末に印を付ける。
//
// 印の付け方（端末ごとに1回。印はその端末のブラウザに残る）：
//   - 管理画面（/admin/notifications）を開く … 管理者アカウントなら自動で付く
//   - 任意のページを ?ga_internal=1 付きで開く … テスト用のFreeアカウントや、ログイン前の画面用
//   - ?ga_internal=0 で外せる
// 印がある端末は、GA4に traffic_type=internal を付けて送る（components/analytics/google-analytics.tsx）。
// GA4側では「管理 → データ設定 → データフィルタ → Internal Traffic」を「有効」にしておく。

export const GA_INTERNAL_PARAM = "ga_internal";
export const GA_INTERNAL_STORAGE_KEY = "ga_internal_traffic";

export function markInternalTraffic(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(GA_INTERNAL_STORAGE_KEY, "1");
  } catch {
    // localStorageが使えない環境では、印を付けられない（そのまま計測される）
  }
}
