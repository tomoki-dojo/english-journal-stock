# english-journal-stock を ConoHa VPS にデプロイする手順書

`app.upskillenglish.bear-fruit.online` を、math-journal-stockと同じConoHa VPS上の
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
- ドメイン `app.upskillenglish.bear-fruit.online` のDNS Aレコードを
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

必要なキーは以下の11個です。

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`（**本番モード**の秘密鍵。テストモードのものではない）
- `STRIPE_WEBHOOK_SECRET`（このあとの手順6で発行される値。ここでは一旦空でもよい）
- `STRIPE_PRICE_ID_PRO_MONTHLY` / `STRIPE_PRICE_ID_PRO_ANNUAL`（本番モードで作成したPrice ID）
- `NEXT_PUBLIC_ADSENSE_CLIENT_ID`（AdSenseのパブリッシャーID。AdSenseダッシュボードで
  `app.upskillenglish.bear-fruit.online` を新しいサイトとして追加・承認してもらった後に設定する。
  未設定のままでも動作する（広告枠がプレースホルダー表示になるだけ）ため、審査待ちの間は空でよい）
- `NEXT_PUBLIC_GA_MEASUREMENT_ID`（GA4の測定ID、`G-...`の形式。Google Analyticsで
  `app.upskillenglish.bear-fruit.online` 用のプロパティを作成して発行する。
  未設定のままでも動作する（計測タグ自体が出力されないだけ）
- `ANTHROPIC_API_KEY` / `GEMINI_API_KEY`（AI添削機能`/api/writing/feedback`用。ローカルの
  `.env.local`に設定済みの値と同じものを使う）
- `AI_WRITING_PROVIDER`（`gemini`を設定。Haiku 4.5とGemini 3.5 Flash-Liteの実測比較の結果、
  速度・コスト・学習語彙の活用精度すべてでFlash-Liteが上回ったため。未設定でも`gemini`に
  フォールバックするが、明示しておくと安全）

`GOOGLE_TTS_API_KEY`はアプリ本体では使わない（音声生成バッチスクリプト専用）ため、
本番環境には設定不要です。

なお、TOEIC対策用の新規テーブル`ai_writing_usage`はSupabase側にすでにマイグレーション適用済み
（`create_ai_writing_usage`）。VPS側での追加のDB作業は不要です。

スピーキング・ロードマップ機能用のテーブル（`user_roadmap_state` / `speaking_stage_progress` /
`usage_rules` / `usage_rule_prompts` / `stage2_quiz_content` / `stage3_usage` /
`daily_activity_log` / `user_error_tag_stats`）も同様にSupabase側にマイグレーション適用済みです。
VPS側での追加のDB作業は不要ですが、Stage3のAI意味判定・Stage2穴埋めの選択肢理由生成は
上記の`ANTHROPIC_API_KEY`/`GEMINI_API_KEY`/`AI_WRITING_PROVIDER`をAI添削機能と共用するため、
これらのキーが未設定だとロードマップのStage3・Stage2穴埋めの一部機能が動かない点に注意
（新規の環境変数は不要）。

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
（ドメインは`app.upskillenglish.bear-fruit.online`に変更済み。そのままコピーすればOK）。

```
app.upskillenglish.bear-fruit.online {
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
https://app.upskillenglish.bear-fruit.online/**
```

Site URLも本番ドメインに更新しておくこと（math-journal-stockで一度踏んだ「マジックリンクが
localhost:3000に飛ぶ」不具合の再発防止）。

---

## 6. Stripe Webhookの登録

Stripeダッシュボード（**本番モード**）→ Developers → Webhooks → 「エンドポイントを追加」

- エンドポイントURL: `https://app.upskillenglish.bear-fruit.online/api/billing/webhook`
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

`https://app.upskillenglish.bear-fruit.online` にアクセスして、以下を確認します。

- [ ] トップページ（今日のピックアップ・シーン別の棚）が表示される
- [ ] ログイン（パスワード / マジックリンク）ができる
- [ ] 表現の絞り込み・シーン別フィルターが動く（Free/Proでロック挙動が正しいか）
- [ ] シーン×機能タグの絞り込みが動く（Free/Proでロック挙動が正しいか）
- [ ] マイリスト（お気に入り）への保存・削除ができる
- [ ] 例文の音声再生ができる（Proユーザーで確認）
- [ ] 設定画面からProへのアップグレード（Checkout）ができる
- [ ] Checkout完了後、Webhook経由でプランが`pro`に反映される
- [ ] 「お支払い管理」からBilling Portalが開ける
- [ ] `/tokushoho` `/terms` `/privacy` が正しく表示される
- [ ] Free/未ログインでサイドバー・ライブラリ一覧に広告枠が表示され、Proでは表示されない
      （`NEXT_PUBLIC_ADSENSE_CLIENT_ID`未設定の間は「広告スペース」のプレースホルダーでよい）
- [ ] `https://app.upskillenglish.bear-fruit.online/ads.txt` が正しく表示される
- [ ] ブラウザの開発者ツール（Network）で`gtag/js`が読み込まれている
      （`NEXT_PUBLIC_GA_MEASUREMENT_ID`設定後。GAのリアルタイムレポートにアクセスが反映されるか確認）
- [ ] `/vocabulary` で単語の検索・レベル絞り込みができる（Free/未ログインでも可）
- [ ] `/vocabulary` のブックマーク（保存）がFree/Pro問わずでき、`/mylist?tab=vocabulary`に反映される
- [ ] `/vocabulary` の「学習を始める」がFreeではロック表示、Proでは開始できる（開始すると自動で保存もされる）
- [ ] `/mylist` の「表現」「単語」タブが切り替わり、単語タブで保存済み単語と学習状態が表示される
- [ ] `/vocabulary/learn` で「ランダム学習」がFree/Proどちらでも始められる（マイリストが空でも公開単語からランダムに出題される）
- [ ] `/vocabulary/learn` の「今日の復習」はFreeでロック表示、Proで進捗ダッシュボード→クイズに進める
- [ ] 今日の復習で回答すると次回復習日が更新される（同じ単語が翌日以降まで出てこないか確認）
- [ ] ランダム学習で回答しても次回復習日が変化しない（SRS状態に影響しないことを確認）

**スピーキング・ロードマップ（`/roadmap`）**

- [ ] 初回アクセス時にオンボーディング診断（クイズ）が表示され、完了すると`user_roadmap_state`が作成される
- [ ] ロードマップのホーム画面（アーサーの飼育部屋・`RoadmapRoom`）でStage0（使い分けパーツ）が
      practice できる
- [ ] Stage1（音読・シャドーイング）のラウンドが最後まで進み、卒業判定（streak）が機能する
- [ ] Stage1をクリアしてStage2の解放しきい値（アクティブセット7件）を初めて満たしたとき、
      ラウンド最終画面に「Stage2が解放されました！」の演出が表示される（それ以外の回では出ない）
- [ ] 飼育部屋画面のStage2/Stage3のケースが、`current_stage`ではなく実際のアクティブセット件数に
      応じて動的に解放される（施錠＝点線枠＋Lockアイコン、解放＝道具アイコンの実線枠、現在地＝
      リング強調の3状態が正しく切り替わる。Stage1をやり込むほどStage2が解放されることを確認）
- [ ] Stage2（瞬間英作文）の穴埋め音読サブステップで、参考選択肢と一緒に「なぜ不自然か」の理由
      （`blank_choice_reasons`、最大2件）が表示される。表示前にmeaningJa（意味のヒント）が出ることも確認
- [ ] Stage3（自分の言葉で言う）で音声入力が動き、AIによる意味判定が返る
- [ ] Stage3の「ヒント付き言い換え」で、ヒントが最初は隠れており「ヒントを出す」ボタンで表示される
- [ ] Stage3の出題内容が日常会話寄り・ビジネス寄りに偏らず、Stage1の卒業順（日常会話優先）に
      対応した順序で出てくる
- [ ] マイク権限がブロックされている状態でStage3を開くと、「マイクの使用が許可されていません…」
      など原因が分かるエラーメッセージが表示される（汎用エラーメッセージのみにならない）
- [ ] コルクボード（卒業済み表現の一覧・検索）が表示される
- [ ] 復習・賑わい度演出（今日の活動ログに応じた演出）が表示される
- [ ] 飼育部屋画面のStage0〜5が、虫眼鏡/虫カゴ/霧吹き/温度湿度計/ピンセット/顕微鏡の
      アイコンでそれぞれ区別して表示される

**クワガタ育成機能（棚・図鑑・採集フロー）**

- [ ] 飼育部屋画面（`/roadmap`）から「棚」のケースをタップして棚（`/roadmap/shelf`）に遷移できる
- [ ] アカウント作成直後、エークワたん（既知種1体目）が「クワたんシリーズ」ショーケース棚
      （新種グリッドの上にある横長の専用カード）に表示されている
- [ ] Stage2/3/4を解放すると、対応する既知種（ホエクワたん/シャベクワたん/フルクワたん）が
      同じショーケース棚に追加される（新種タンクのグリッドには混ざらない）
- [ ] Stage5卒業時、テッペンクワたんが卵→成虫（強制羽化、サイズは自然な成長カーブのまま）になる
- [ ] 採集結果モーダルの「棚を見る」の隣に「つづきを練習する」ボタンがあり、押すと
      飼育部屋画面（`/roadmap`）に戻る
- [ ] 練習を重ねてtotalMasteredCountが節目（10件ごと、Proは5件ごと）に達すると、
      「採集に出かける」ボタンの採集チャンス数が増える
- [ ] 採集チャンスがある状態で「採集に出かける」→複数エリア解放済みならエリア選択UIが出る→
      選んだエリアの新種が結果画面（「〇〇をゲットした！」）で表示され、棚に反映される
- [ ] 50件ごとの節目でレア以上保障がかかっている（結果画面に「レアが出た！」等の表示が出る）
- [ ] エリア1の新種（カナたん・テンたん・ダンたん・バッたん・クモたん）を全種発見すると
      エリア2が解放される（図鑑のエリアタブで確認）。同様にエリア2→3、3→4も連鎖する
- [ ] 図鑑（`/roadmap/encyclopedia`）で、エリアタブの切り替え・発見済み/未発見（？？？）の
      表示が正しい
- [ ] **Freeアカウントで**、Pro限定種（エリア1のチョウたん等・エリア2〜4のPro枠・
      水中アクアリウムのゲンたん等）が、図鑑で「Pro限定」表示になっており、何度採集ロールしても
      実際には出現しないことを確認する（最重要：Pro限定種がFreeでも引けてしまうバグが
      過去にあったため、必ず確認する）
- [ ] **Freeアカウントで**、棚の新種タンクが10種類を超えると、超えた分が非表示になり
      「Proにすると全部見られます」の案内が出る（「クワたんシリーズ」ショーケース棚は
      この上限の対象外で、Freeでも常に全員表示されることを確認）
- [ ] **Proアカウントで**、棚の新種タンク表示に上限がない（11種類以上表示される）
- [ ] **Proアカウントで**、採集チャンスの発生間隔がFreeの半分（totalMasteredCount 5件ごと）
      になっている
- [ ] **Proアカウントで**、Pro限定種（チョウたん等）が実際に採集ロールで出現する
- [ ] **Proアカウントで**、「水中アクアリウム（Pro限定）」エリアが採集のエリア選択肢に
      最初から出ている（エリア4コンプリート前でも選べる）
- [ ] **Freeアカウントで**、水中アクアリウムエリアが採集のエリア選択肢に出てこない
- [ ] 水中アクアリウムの種類（ゲンたん等）だけ、棚の水槽が水色グラデーション＋気泡の
      「水中」見た目になっている（他の種類は通常のテラリウム見た目のまま）
- [ ] 設定画面のプラン比較表に「クワたんのPro限定種」の行が表示される

---

## 8. 今後のデプロイ更新方法

コード修正後、VPS上で以下を実行するだけです。

```bash
cd ~/english-journal-stock
git pull
docker compose --env-file .env.production up -d --build
```
