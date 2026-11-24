---
description: 実装が終わった変更を main に入れてプッシュする（プッシュすると GitHub Actions が VPS に自動デプロイする）
argument-hint: "[ブランチ名（省略すると今のブランチ）]"
---

実装・テストが終わった変更を本番に出す。プッシュしたあとのデプロイ（VPS でのプルとコンテナの立て直し）は GitHub Actions（`.github/workflows/deploy.yml`）が自動でやるので、ここではプッシュまでと、デプロイの結果の確認をする。

対象のブランチ: $ARGUMENTS（空なら今のブランチ）

## 手順

1. **状態を確認する**
   - `git status` でコミットしていない変更がないか見る。あれば、何の変更かを示して「コミットするか・やめるか」をどーじょーに聞く（勝手にコミットしない）
   - `git fetch origin` して、`origin/main` との差分のコミット一覧（`git log --oneline origin/main..<ブランチ>`）と変わったファイルの一覧を見せる
   - **ローカルの main にしかないコミットも見る**：`git log --oneline origin/main..main`。ほかのチャットが main に直接コミットしていると、ここに出て、プッシュで一緒に本番に出る。あれば、何のコミットか（誰が・何を）と、`content/words` の記事なら `draft: true` のままかを示して、「一緒に出すか・待つか」をどーじょーに聞く

2. **チェックする**（どれかが失敗したら、その時点で止めて原因を報告する。直すかどうかはどーじょーに聞く）
   - `scripts/ship-check.sh check`（tsc・lint・build をまとめてやり、通れば1行ずつ、失敗したらその出力の最後30行だけを返す。build は時間がかかるが必ずやる。`.env.local` の値で通ればよい）

3. **どーじょーの OK をもらう**
   - 「これを本番に出します」として、手順1の一覧（ブランチの分と、ローカルの main にしかない分を分けて）とチェックの結果を短くまとめて見せ、OK をもらってから次へ進む

4. **main に入れてプッシュする**
   - ブランチが main 以外なら：`git checkout main` → `git pull --ff-only origin main` → `git merge --no-ff <ブランチ>`（コンフリクトしたら止めて相談）
   - ローカルの main にしかないコミットがあったときは、マージしたあとの main で `scripts/ship-check.sh check` をもう一度通してからプッシュする（手順2はブランチだけで見ているため）
   - プッシュの直前に `git log --oneline origin/main..main` を見て、手順3で見せた一覧と同じか確かめる。増えていたら止めて聞く
   - `git push origin main`
   - プッシュしたら、そのコミットの短いハッシュを伝える

5. **デプロイの結果を見る**
   - `scripts/ship-check.sh deploy <短いハッシュ>`（Actions の Deploy to VPS が終わるまで30秒おきに待ち、API の上限に当たったら Actions のページで確かめ、最後に `/welcome` の状態を返す。`gh` は使わない）
   - 失敗したら、Actions のログの最後の数十行を見せて原因を説明する（VPS 側は `ssh` で `cd ~/english-journal-stock && docker compose logs --tail 100 app`）

6. **共有ボードに書く**
   - `_reference/shared-board.md`（このフォルダになければ `~/Developer/english-journal-stock/_reference/shared-board.md`）の運用ルールに従って、何を本番に出したか（コミットのハッシュと一行の説明）を1行追記する
