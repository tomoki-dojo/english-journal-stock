---
description: /words の下書き記事を最終チェックして公開する（誤字脱字の確認 → draft を外す → main に入れてプッシュ → 自動デプロイの確認）
argument-hint: "[ブランチ名（例: feature/words-batch2）] [slug ...（省略するとそのブランチの下書き全部）]"
---

どーじょーが直し終えた /words の記事を公開する。記事は `content/words/<slug>.md`（書き方は `src/lib/words.ts` の冒頭のコメント）。

引数: $ARGUMENTS
- 1つ目がブランチ名（`feature/` で始まるもの）。省略したら今のブランチ
- 2つ目以降が slug。省略したら、そのブランチで `draft: true` が付いている記事を全部対象にする

## 大事なこと

- **文章はどーじょーが直したもの。言い回し・口調・構成は変えない。** 直してよいのは、明らかな誤字脱字・変換ミス・英文の文法やつづりの誤りだけ。迷ったら直さずに「ここはこう読めますが合っていますか？」と聞く
- 直す前に、見つけたものを全部一覧で見せて、どーじょーの OK をもらってから直す

## 手順

1. **対象を決める**
   - `git checkout <ブランチ>`、`git status` がきれいか確認（変更が残っていたら止めて聞く）
   - 対象の記事の一覧（slug・タイトル・分類）を見せる

2. **記事ごとにチェックする**（直さずに、まず一覧にする）
   - 誤字脱字・変換ミス・「てにをは」の抜け
   - 英文：つづり・文法・冠詞・三単現の s。英文と日本語訳（`|` の後ろ）の意味がずれていないか
   - ```talk・```balloon の「話す人: 英語 | 字幕」の形が崩れていないか（話す人はクマかアーサー）
   - ```phrases の行の形（`英語 | 日本語`）
   - frontmatter：title・description・word・category・answer・published があるか。category が `src/lib/words.ts` の WORD_CATEGORIES の名前のどれかか（場面で使う英語なら side、数字と数学の英語のシリーズなら order も）
   - 本文の `/words/<slug>` のリンクと related の slug が実在するか。**まだ公開していない（draft の）記事へのリンクがあれば、公開の順番を提案する**
   - 結果を「記事 → 見つけたもの（行・今の文・直す案）」の一覧で見せる。何もなければ「なし」

3. **どーじょーの OK をもらって直す**
   - OK が出たものだけ直す
   - 対象の記事から `draft: true` の行を消す。`published` を今日の日付（YYYY-MM-DD）にする

4. **確認してコミットする**
   - `npx tsc --noEmit` と `npm run build`（記事のページが静的に作られるので、Markdown の崩れもここで分かる）
   - コミットのメッセージは「〇〇・△△ほか N 本を公開（draft を外す）」
   - コミットしたあと `git ls-tree -r HEAD | wc -l` が、前のコミットからファイルが減っていないか確認する

5. **main に入れてプッシュする**
   - `git checkout main` → `git pull --ff-only origin main` → `git merge --no-ff <ブランチ>` → `git push origin main`
   - プッシュすると GitHub Actions（`.github/workflows/deploy.yml`）が VPS に自動でデプロイする

6. **公開を確認する**
   - `gh` が使えれば `gh run watch` でデプロイの終わりを待つ（使えなければ Actions のタブを見てもらう）
   - 終わったら、公開した記事ごとに `curl -s -o /dev/null -w "%{http_code}" https://app.upskillenglish.bear-fruit.online/words/<slug>` が 200 か、`/sitemap.xml` に入っているか確認する
   - 公開した記事の URL の一覧を出す（Search Console の「URL 検査」で登録をリクエストするときに使う。1日の上限があるので10本前後ずつ）

7. **共有ボードに書く**
   - `_reference/shared-board.md` に「/words に N 本を公開（slug の一覧、main のハッシュ）」を1行追記する
