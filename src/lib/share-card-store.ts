import { createHash, randomBytes } from "node:crypto";

// シェアカード（横長PNG）の置き場所。公開バケット share-cards に「<利用者ごとの印>/<ランダム>.png」で置く。
// 利用者ごとの印は user id のハッシュの先頭（URLから user id は分からない）。リンクのID＝「印-ランダム」。
export const SHARE_CARD_BUCKET = "share-cards";
export const SHARE_CARD_DAILY_LIMIT = 40;
export const SHARE_CARD_MAX_BYTES = 1_500_000;
const ID_PATTERN = /^([0-9a-f]{10})-([0-9a-f]{12})$/;

export function ownerPrefix(userId: string): string {
  return createHash("sha256").update(`share-card:${userId}`).digest("hex").slice(0, 10);
}

export function newShareCardId(userId: string): { id: string; objectPath: string } {
  const prefix = ownerPrefix(userId);
  const rand = randomBytes(6).toString("hex");
  return { id: `${prefix}-${rand}`, objectPath: `${prefix}/${rand}.png` };
}

export function shareCardObjectPath(id: string): string | null {
  const m = ID_PATTERN.exec(id);
  return m ? `${m[1]}/${m[2]}.png` : null;
}

export function shareCardPublicUrl(objectPath: string): string {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return `${base}/storage/v1/object/public/${SHARE_CARD_BUCKET}/${objectPath}`;
}
