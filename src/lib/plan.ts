// アカウントのプラン区分。
// math-journal-stock由来の仮の枠組み（free/pro/premium）をそのまま置いている。
// 実際の料金・機能内容・段階数は英語アプリの仕様確定後に見直すこと。
// （PlanBillingCardなど課金UIの中身は、料金設計が決まるまで意図的に未移植）
export const PlanValues = ["free", "pro", "premium"] as const;
export type Plan = (typeof PlanValues)[number];

export const PLAN_LABELS: Record<Plan, string> = {
  free: "Free",
  pro: "Pro",
  premium: "Premium",
};
