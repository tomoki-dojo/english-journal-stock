// ロードマップ（英クワたん）の「区切り広告」の設定。
// タイマーで勝手に出すのではなく、区切りのいい場面（練習から部屋・棚・図鑑に戻ったとき、採集結果を閉じたとき）で、
// 前回の広告から一定時間たっていたときだけ、通常の広告枠を1つ見せる（AdSenseのポリシー上、タイマーでの
// 自動表示・再読み込みはしない）。Pro会員には出さない。詳細は _reference/kuwagata-motif-exploration.md 参照。

// 前回の広告表示（または遊び始め）から、次に出してよくなるまでの間隔
export const AD_BREAK_MIN_INTERVAL_MS = 5 * 60 * 1000;

// 区切り広告を出してよい画面（練習中の画面には出さない）
export const AD_BREAK_PATHS = new Set(["/roadmap", "/roadmap/shelf", "/roadmap/encyclopedia"]);

// 区切り広告用のAdSense広告ユニット。専用ユニットを作ったら NEXT_PUBLIC_ADSENSE_SLOT_ROADMAP_BREAK に設定する
// （未設定の間は本体サイドバーと同じユニットを使う）。
export const AD_BREAK_SLOT = process.env.NEXT_PUBLIC_ADSENSE_SLOT_ROADMAP_BREAK || "7523817086";

export const AD_BREAK_STORAGE_KEY = "roadmap_ad_break_last_at";
