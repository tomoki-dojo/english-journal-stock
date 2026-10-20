# Supabaseメールテンプレート（日本語）

Supabase ダッシュボード → Authentication → Emails（Email Templates）に貼り付ける。
UpskillEnglish と英クワたんは同じSupabaseプロジェクトを共有しているため、文面は両ブランド共通（どちらから登録しても違和感がない書き方）。

| Supabaseの種類 | 件名 | 本文ファイル |
|---|---|---|
| Magic Link | ログインリンクのお知らせ【UpskillEnglish / 英クワたん】 | magic-link.html |
| Confirm signup | メールアドレスの確認【UpskillEnglish / 英クワたん】 | confirmation.html |
| Reset Password | パスワードの再設定【UpskillEnglish / 英クワたん】 | recovery.html |

- リンクは `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=...` 形式（`{{ .ConfirmationURL }}` は使わない）。アプリの `/auth/callback` が token_hash を検証するため、別ブラウザ（メールアプリ内ブラウザ等）で開いてもログインできる。`{{ .Email }}` も含め書き換えない。
- 新規ユーザーがマジックリンクで登録する場合も Confirm signup のテンプレートが使われるため、3つとも同じ形式にしている。
- 送信者名（SMTP設定の Sender name）は「UpskillEnglish」など、両方の入口で自然な名前にする。
