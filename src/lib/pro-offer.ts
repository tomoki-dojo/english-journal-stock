// Proの「先行者価格」と「無料トライアル」の設定（クライアントからも読める値だけを置く）。
// 方針は _reference/monetization-strategy-memo.md 12章。
//
// 先行者価格：期限（FOUNDER_DEADLINE_ISO）までに月払いでProを始めた人は、解約しない限りずっと月480円。
//   期限を過ぎてから始める人は通常価格。年払いには先行者価格はない（通常の年6,800円のみ）。
//   残り人数ではなく期限で区切る（加入者が少ない段階で「あと◯人」を出さないため）。
// 無料トライアル：月払いだけ、1アカウント1回、7日間。カード登録なしで始められ、
//   期限までにカードを登録しなければProは自動で終わる（勝手に課金されない）。

export const FOUNDER_DEADLINE_ISO = "2026-12-31T23:59:59+09:00";
export const FOUNDER_DEADLINE_LABEL = "2026年12月31日";
// ボタンなど短い表示用（「12月31日」）。FOUNDER_DEADLINE_ISOの日付部分から作るので、期限を変えれば連動する。
export const FOUNDER_DEADLINE_SHORT_LABEL = (() => {
  const [, month, day] = FOUNDER_DEADLINE_ISO.slice(0, 10).split("-");
  return `${Number(month)}月${Number(day)}日`;
})();
export const FOUNDER_MONTHLY_PRICE = 480;
export const REGULAR_MONTHLY_PRICE = 680;
export const REGULAR_ANNUAL_PRICE = 6800;
export const PRO_TRIAL_DAYS = 7;

export function isFounderPeriod(now: Date = new Date()): boolean {
  return now.getTime() <= Date.parse(FOUNDER_DEADLINE_ISO);
}

export function formatYen(amount: number): string {
  return `¥${amount.toLocaleString("ja-JP")}`;
}
