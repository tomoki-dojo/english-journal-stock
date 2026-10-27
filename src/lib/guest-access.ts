// ゲスト(匿名ログイン)が使える範囲。ミドルウェア(Edge)から読むので、node専用モジュールは使わない。
// ゲストは Stage1・採集・棚 と、登録の画面だけ。それ以外(AI判定のStage・課金・設定など)は止める。

const GUEST_PAGE_PREFIXES = [
  "/welcome",
  "/auth",
  "/terms",
  "/privacy",
  "/tokushoho",
  "/roadmap/title",
  "/roadmap/stage1",
  "/roadmap/shelf",
  "/roadmap/register",
];

const GUEST_API_PREFIXES = [
  "/api/auth",
  "/api/roadmap/guest",
  "/api/roadmap/stage1",
  "/api/roadmap/kuwagata",
  "/api/roadmap/word-lookup",
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

export type GuestGuardDecision = "allow" | "redirect" | "api_forbidden";

export function guestGuardDecision(pathname: string): GuestGuardDecision {
  if (pathname.startsWith("/api/")) {
    return GUEST_API_PREFIXES.some((p) => matchesPrefix(pathname, p)) ? "allow" : "api_forbidden";
  }
  return GUEST_PAGE_PREFIXES.some((p) => matchesPrefix(pathname, p)) ? "allow" : "redirect";
}
