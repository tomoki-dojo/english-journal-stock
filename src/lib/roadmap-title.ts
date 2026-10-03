// ロードマップのタイトル画面まわりの共通定数。ミドルウェア（Edge）からも読むので、node専用モジュールは使わない。
export const ROADMAP_TITLE_PATH = "/roadmap/title";
export const TITLE_SEEN_COOKIE = "roadmap_title_seen";
// 最後の操作から12時間。ミドルウェアが操作のたびにクッキーを延長する。
export const TITLE_SEEN_MAX_AGE = 12 * 60 * 60;

// タイトル後に戻る先。/roadmap配下の内部パスだけ許可（オープンリダイレクト防止）。
export function sanitizeRoadmapNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/roadmap") || next.startsWith("//")) return "/roadmap";
  if (next === ROADMAP_TITLE_PATH || next.startsWith(`${ROADMAP_TITLE_PATH}/`) || next.startsWith(`${ROADMAP_TITLE_PATH}?`)) {
    return "/roadmap";
  }
  return next;
}
