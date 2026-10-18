// 採集ミニゲームの制限時間(秒)。サーバーとクライアントの両方から使う。
// 奥のエリア(4・5・古代の森)は単語が難しく長いので、時間を長めにする。
const LONG_AREAS = new Set(["area4", "area5", "ancient"]);

export function getMinigameDurationSec(areaCode: string): number {
  return LONG_AREAS.has(areaCode) ? 15 : 10;
}
