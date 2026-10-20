# Supabaseメールテンプレート（日本語）

Supabase ダッシュボード → Authentication → Emails（Email Templates）に貼り付ける。
UpskillEnglish と英クワたんは同じSupabaseプロジェクトを共有しているため、文面は両ブランド共通（どちらから登録しても違和感がない書き方）。

| Supabaseの種類 | 件名 | 本文ファイル |
|---|---|---|
| Magic Link | ログインリンクのお知らせ【UpskillEnglish / 英クワたん】 | magic-link.html |
| Confirm signup | メールアドレスの確認【UpskillEnglish / 英クワたん】 | confirmation.html |
| Reset Password | パスワードの再設定【UpskillEnglish / 英クワたん】 | recovery.html |

- `{{ .ConfirmationURL }}` と `{{ .Email }}` は書き換えない。
- 送信者名（SMTP設定の Sender name）は「UpskillEnglish」など、両方の入口で自然な名前にする。
