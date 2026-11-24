#!/usr/bin/env bash
# /ship・/words-publish の確認をまとめて、結果を短く返す（トークン節約のため）。
#   scripts/ship-check.sh check                 … tsc・lint・build。通れば1行ずつ、失敗したらその出力の最後30行
#   scripts/ship-check.sh deploy <sha> [slug…]  … Actions の Deploy to VPS を待つ → /welcome → 記事の 200 と sitemap
#   scripts/ship-check.sh words <slug…>         … 記事の frontmatter と、リンク・related の行き先（無い／draft のまま）
set -uo pipefail
cd "$(dirname "$0")/.."
SITE=https://app.upskillenglish.bear-fruit.online
REPO=tomoki-dojo/english-journal-stock
API=https://api.github.com/repos/$REPO/actions/runs

run_step() { # name, command…
  local name=$1; shift
  local out; out=$("$@" 2>&1); local code=$?
  if [ $code -eq 0 ]; then echo "$name: OK"; else echo "$name: NG (exit $code)"; echo "$out" | tail -30; exit 1; fi
}

case "${1:-}" in
check)
  run_step tsc npx tsc --noEmit
  run_step lint npm run lint
  run_step build npm run build
  ;;

deploy)
  sha=${2:?コミットのハッシュを渡す}; shift 2
  id=""
  for _ in 1 2 3 4 5 6; do
    id=$(curl -s "$API?per_page=5" | python3 -c 'import sys,json
d=json.load(sys.stdin); r=[x for x in d.get("workflow_runs",[]) if x["head_sha"].startswith(sys.argv[1])]
print(r[0]["id"] if r else ("RATE" if "rate limit" in d.get("message","") else ""))' "$sha")
    case "$id" in [0-9]*|RATE) break;; esac; sleep 10
  done
  if [ "$id" = RATE ] || [ -z "$id" ]; then echo "deploy: run が見つからない（$id）。GitHub の Actions のタブで確認"; exit 1; fi
  result=""
  for _ in $(seq 1 20); do
    r=$(curl -s "$API/$id" | python3 -c 'import sys,json
d=json.load(sys.stdin); print("RATE" if "rate limit" in d.get("message","") else "%s %s" % (d.get("status"), d.get("conclusion")))')
    if [ "$r" = RATE ]; then
      html=$(curl -sL "https://github.com/$REPO/actions/runs/$id")
      if echo "$html" | grep -q 'completed successfully'; then r="completed success"
      elif echo "$html" | grep -qiE 'failed|cancelled'; then r="completed failure"; fi
    fi
    case "$r" in completed*) result=$r; break;; RATE|"") result="確認できない（API の上限か、読み取りの失敗）"; break;; esac
    sleep 30
  done
  echo "deploy: run $id ${result:-まだ終わっていない（10分待った）}"
  [ "$result" = "completed success" ] || { echo "ログ: https://github.com/$REPO/actions/runs/$id"; exit 1; }
  echo "welcome: $(curl -s -o /dev/null -w '%{http_code}' $SITE/welcome)"
  if [ $# -gt 0 ]; then
    sm=$(curl -s $SITE/sitemap.xml)
    for s in "$@"; do
      c=$(curl -s -o /dev/null -w '%{http_code}' "$SITE/words/$s")
      echo "$sm" | grep -q "/words/$s<" && m=sitemap-ok || m=sitemap-NG
      echo "$s: $c $m"
    done
  fi
  ;;

words)
  shift; sel=" $* "
  for s in "$@"; do
    f=content/words/$s.md
    [ -f "$f" ] || { echo "$s: ファイルがない"; continue; }
    msg=""
    for k in title description word answer published; do grep -q "^$k:" "$f" || msg+=" $k なし;"; done
    for t in $( (grep -oE '/words/[a-z0-9-]+' "$f" | sed 's#/words/##'; grep -m1 '^related:' "$f" | sed 's/related://;s/[][,]/ /g') | sort -u); do
      [ "$t" = category ] || [ "$t" = all ] && continue
      if [ ! -f "content/words/$t.md" ]; then msg+=" → $t が存在しない;"
      elif grep -q '^draft: true' "content/words/$t.md" && [[ "$sel" != *" $t "* ]]; then msg+=" → $t は draft のまま;"; fi
    done
    echo "$s: $(grep -m1 '^category:' "$f" | cut -d' ' -f2-) $(grep -m1 '^side:' "$f" | cut -d' ' -f2-) ${msg:- OK}"
  done
  ;;

*) sed -n 2,5p "$0"; exit 1;;
esac
