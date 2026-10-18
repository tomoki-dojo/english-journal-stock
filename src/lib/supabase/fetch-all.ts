// Supabase(PostgREST)は1回の取得が最大1000行までに制限されていることがあるため、
// 範囲を区切って全件を取り直す。順序が揺れると取りこぼす/重複するので、呼び出し側で必ずorderを付けること。
const PAGE_SIZE = 1000;

export async function fetchAllRows<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}
