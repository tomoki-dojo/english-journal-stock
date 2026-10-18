// サーバーのメモリに置く、TTL付きの簡易キャッシュ。全ユーザー共通でほぼ変わらないマスタ用。
// ユーザー個別のデータ(進捗・所持個体・プランなど)には使わないこと。
// - 本番だけ有効(開発中はコンテンツの差し替えがすぐ見えるようTTL 0扱い)。
// - 同じキーで取得中のものがあれば、その結果を共有する(同時リクエストでDBを何度も叩かない)。
// - 失敗した結果はキャッシュしない。
// - 返した値は共有されるので、呼び出し側で書き換えないこと(必要なら複製してから)。
const ENABLED = process.env.NODE_ENV === "production";

type Entry<T> = { expiresAt: number; promise: Promise<T> };

export function ttlCached<A extends unknown[], T>(
  ttlMs: number,
  fn: (...args: A) => Promise<T>,
  keyOf: (...args: A) => string = (...args) => JSON.stringify(args)
): (...args: A) => Promise<T> {
  const store = new Map<string, Entry<T>>();
  return (...args: A) => {
    if (!ENABLED) return fn(...args);
    const key = keyOf(...args);
    const hit = store.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.promise;

    const promise = fn(...args);
    store.set(key, { expiresAt: Date.now() + ttlMs, promise });
    promise.catch(() => {
      if (store.get(key)?.promise === promise) store.delete(key);
    });
    return promise;
  };
}
