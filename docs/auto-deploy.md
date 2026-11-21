# 自動デプロイ（GitHub Actions）の設定

main にプッシュすると、GitHub Actions（`.github/workflows/deploy.yml`）が VPS に SSH で入り、
`git pull` と `docker compose --env-file .env.production up -d --build` を自動で実行する。
手でやっていた `docs/vps-deploy.md` の「8. 今後のデプロイ更新方法」と同じ。

Claude Code では、実装の公開は `/ship`、/words の記事の公開は `/words-publish` で、プッシュまでやってもらえる。

## 最初に1回だけやること

### 1. VPS に、GitHub Actions 用の鍵を作る（VPS に SSH で入って）

```bash
ssh-keygen -t ed25519 -f ~/.ssh/github_actions -N "" -C "github-actions-deploy"
cat ~/.ssh/github_actions.pub >> ~/.ssh/authorized_keys
cat ~/.ssh/github_actions
```

最後に出てきた `-----BEGIN OPENSSH PRIVATE KEY-----` から `-----END OPENSSH PRIVATE KEY-----` までを、全部コピーする。

### 2. GitHub に Secrets を登録する

GitHub の english-journal-stock のリポジトリ → Settings → Secrets and variables → Actions → New repository secret

| 名前 | 値 |
|---|---|
| VPS_HOST | 163.44.110.196 |
| VPS_USER | root |
| VPS_SSH_KEY | 手順1でコピーした秘密鍵（全部） |
| VPS_PORT | SSH のポートを 22 以外にしている場合だけ |

### 3. SSH の接続元を絞っている場合

ConoHa のセキュリティグループや VPS のファイアウォールで、SSH（22番）を自分の IP だけに絞っていると、
GitHub Actions から入れない。その場合は Actions のログに `dial tcp ... i/o timeout` と出る。

### 4. 動くか確かめる

GitHub のリポジトリ → Actions → Deploy to VPS → Run workflow で、手で1回動かす。緑になれば OK。

## うまくいかないとき

- Actions のログで、どの手順で止まったかを見る
- VPS で `cd ~/english-journal-stock && docker compose logs --tail 100 app`
- 自動デプロイを止めたいときは、Actions のタブで Deploy to VPS → 右上の「…」→ Disable workflow
