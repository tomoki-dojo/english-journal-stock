# english-journal-stock を ConoHa VPS にデプロイする手順書

`app.english-journal.bear-fruit.online` を、math-journal-stockと同じConoHa VPS上の
Dockerコンテナとしてデプロイする手順です。

このVPSにはすでにn8n用のCaddy（コンテナ名 `n8n-docker-caddy-1`、`/root/n8n-docker/` 配下）と
math-journal-stock用のコンテナが、ポート80/443を使って稼働しています。english-journal-stockも
**既存のn8n用Caddyに相乗りする**構成にしてあります（2つ目のCaddyは立てません）。
appコンテナは既存のn8n用Dockerネットワーク（`n8n-docker_default`）に参加し、
既存Caddyの`Caddyfile`にサイト設定を1ブロック追記する形でリバースプロキシしてもらいます。

math-journal-stockのVPS移行時に作った `docs/vps-migration.md` の「8. 今後、英語アプリなど
別サービスを同じVPSに追加する場合」で想定していた通りの作業です。

作業はすべてVPS側のターミナル（SSH接続後）で実行してください。

---

## 0. 事前確認

- VPSにSSH接続できること
- VPSにDockerとDocker Composeが入っていること（math-journal-stockが動いているなら入っているはず）
  ```bash
  docker --version
  docker compose version
  ```
- ドメイン `app.english-journal.bear-fruit.online` のDNS Aレコードを
  `163.44.110.196`（このVPSのIP）に向けて設定済みであること（ConoHa WINGのDNS管理画面）
- Stripeダッシュボードで、本番モード（サンドボックスではない）の「Pro（英語アプリ）」商品と
  月額・年額のPrice IDを作成済みであること
- Supabase（english-journal-stockプロジェクト）のURL・anon key・service role keyを
  手元に控えていること

---

## 1. リポジトリをVPSに取得

```bash
cd ~
git clone git@github.com-english-journal-stock:tomoki-dojo/english-journal-stock.git english-journal-stock
cd english-journal-stock
```

GitHubのSSHデプロイキーがまだない場合は、math-journal-stockのときと同様の手順でデプロイキーを
作成してください（`~/.ssh/config`に`github.com-english-journal-stock`のHostエントリを追加する形）。

---

## 2. 環境変数ファイルを作る

```bash
cp .env.production.example .env.production
nano .env.production
```

必要なキーは以下の6個です。

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`（**本番モード**の秘密鍵。テストモードのものではない）
- `STRIPE_WEBHOOK_SECRET`（このあとの手順6で発行される値。ここでは一旦空でもよい）
- `STRIPE_PRICE_ID_PRO_MONTHLY` / `STRIPE_PRICE_ID_PRO_ANNUAL`（本番モードで作成したPrice ID）

`GOOGLE_TTS_API_KEY`はアプリ本体では使わない（音声生成バッチスクリプト専用）ため、
本番環境には設定不要です。

**重要：`docker compose`コマンドは必ず`--env-file .env.production`を付けて実行してください。**
docker-composeの`${変数}`展開は`.env`という名前のファイルしか自動で読まないため、
`.env.production`のままだと`NEXT_PUBLIC_SUPABASE_URL`などがビルドに反映されず、
ビルドエラー（`supabaseUrl is required`など）になります。

---

## 3. アプリコンテナを起動

```bash
cd ~/english-journal-stock
docker compose --env-file .env.production up -d --build
docker compose logs -f app   # エラーが出ていないか確認。Ctrl+Cで抜ける
```

---

## 4. 既存Caddyにサイト設定を追記

```bash
nano /root/n8n-docker/Caddyfile
```

ファイルの末尾に、このリポジトリの`Caddyfile`に書いてある内容をそのまま貼り付けます
（ドメインは`app.english-journal.bear-fruit.online`のまま、書き換え不要）。

```
app.english-journal.bear-fruit.online {
	reverse_proxy english-journal-stock:3000

	encode gzip

	log {
		output file /data/access-english-journal-stock.log {
			roll_size 10mb
			roll_keep 5
		}
	}
}
```

既存Caddyに設定をリロードさせます（ダウンタイムなしで反映されます）。

```bash
docker exec n8n-docker-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

もしこのコマンドでエラーになる場合は、代わりに以下でコンテナごと再起動してください
（n8nとmath-journal-stockが数秒止まりますが実害は小さいです）。

```bash
docker restart n8n-docker-caddy-1
```

DNSが正しく向いていれば、Let's EncryptのSSL証明書をCaddyが自動取得します
（数秒〜数十秒で発行されます）。

---

## 5. Supabase側の設定

Supabaseダッシュボード（english-journal-stockプロジェクト）→ Authentication → URL Configuration で、
以下をRedirect URLsに追加してください（マジックリンク・パスワード再設定等で必要）。

```
https://app.english-journal.bear-fruit.online/**
```

Site URLも本番ドメインに更新しておくこと（math-journal-stockで一度踏んだ「マジックリンクが
localhost:3000に飛ぶ」不具合の再発防止）。

---

## 6. Stripe Webhookの登録

Stripeダッシュボード（**本番モード**）→ Developers → Webhooks → 「エンドポイントを追加」

- エンドポイントURL: `https://app.english-journal.bear-fruit.online/api/billing/webhook`
- リッスンするイベント:
  - `checkout.session.completed`
  - `customer.subscription.created`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`

作成すると署名シークレット（`whsec_...`）が発行されるので、それを`.env.production`の
`STRIPE_WEBHOOK_SECRET`に設定し、コンテナを再起動して反映します。

```bash
nano .env.production   # STRIPE_WEBHOOK_SECRETを追記
docker compose --env-file .env.production up -d --build
```

Stripeダッシュボードの該当Webhookから「テストイベントを送信」して、200が返ってくることを確認してください。

---

## 7. 動作確認チェックリスト

`https://app.english-journal.bear-fruit.online` にアクセスして、以下を確認します。

- [ ] トップページ・表現一覧が表示される
- [ ] ログイン（パスワード / マジックリンク）ができる
- [ ] 表現の絞り込み・シーン別フィルターが動く（Free/Proでロック挙動が正しいか）
- [ ] マイリスト（お気に入り）への保存・削除ができる
- [ ] 例文の音声再生ができる（Proユーザーで確認）
- [ ] 設定画面からProへのアップグレード（Checkout）ができる
- [ ] Checkout完了後、Webhook経由でプランが`pro`に反映される
- [ ] 「お支払い管理」からBilling Portalが開ける
- [ ] `/tokushoho` `/terms` `/privacy` が正しく表示される

---

## 8. 今後のデプロイ更新方法

コード修正後、VPS上で以下を実行するだけです。

```bash
cd ~/english-journal-stock
git pull
docker compose --env-file .env.production up -d --build
```
