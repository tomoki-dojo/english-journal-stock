// 単語帳・表現一覧のサーバー側ページネーションで使う1ページあたりの件数。
// サーバー側データ層（src/lib/supabase/*.ts、service_role利用）とクライアントコンポーネントの
// 両方から参照するため、どちらにもバンドルして問題ない依存を持たないファイルに分離している。
export const VOCABULARY_PAGE_SIZE = 24;
export const EXPRESSION_PAGE_SIZE = 24;
