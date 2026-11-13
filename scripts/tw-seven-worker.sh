#!/usr/bin/env bash
# 7-ELEVEN 一番賞庫存：在 worker（comfy-worker）上由 launchd 每天跑兩次。
# 1. 用 openpoint-imap-research 掃全台 7-11 i地圖（要會員 GID 換 token，所以不放 GitHub Actions）
# 2. 轉成 data/tw-seven.json，commit 後 push 到 main（Cloudflare Pages 自動部署）
#
# 這個 clone（~/1kuji-shops）是機器人專用的：每次都 reset 到 origin/main，不要在裡面手動改東西。
set -euo pipefail

REPO="${REPO:-$HOME/1kuji-shops}"
OPENPOINT="${OPENPOINT:-$HOME/openpoint-imap-research}"
BRANCH="${BRANCH:-main}" # 測試時可改推到其他分支
export NVM_DIR="$HOME/.nvm"
# shellcheck disable=SC1091
. "$NVM_DIR/nvm.sh" >/dev/null
nvm use -s 22 >/dev/null

log() { echo "[$(date '+%F %T')] $*"; }

cd "$REPO"
git fetch -q origin "$BRANCH"
git checkout -q -B "$BRANCH" "origin/$BRANCH"
git reset -q --hard "origin/$BRANCH"
if [ ! -f scraper/convert-seven.ts ]; then
  log "$BRANCH 還沒有 7-11 轉換程式，略過"
  exit 0
fi
# package-lock 有變才重裝
lock_hash=$(shasum package-lock.json | cut -d' ' -f1)
if [ ! -d node_modules ] || [ "$(cat node_modules/.lock-hash 2>/dev/null)" != "$lock_hash" ]; then
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm ci --no-audit --no-fund >/dev/null
  echo "$lock_hash" > node_modules/.lock-hash
fi

log "掃描 7-11 全台"
started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
summary=$(cd "$OPENPOINT" && npm run fetch:inventory --silent -- \
  --all --area 全台 --mode both --json --include-zero --concurrency 4 --delay-ms 150 2>>"$HOME/Library/Logs/1kuji-seven.err")
out_dir=$(printf '%s' "$summary" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);if(!j.ok||j.errors>j.discoveredStores*0.05)process.exit(2);console.log(j.outputDir)})') || {
  log "掃描失敗或錯誤太多：$summary"
  exit 1
}

npm run convert:seven --silent -- "$out_dir/inventory.json" "$started"
rm -rf "$out_dir" # 每次 ~13 MB，worker 硬碟很滿

git add data/tw-seven.json
if git diff --staged --quiet; then
  log "沒有變更"
  exit 0
fi
git -c user.name="1kuji-worker" -c user.email="1kuji-worker@users.noreply.github.com" \
  commit -q -m "data: 台灣 7-11 庫存 $started"
for i in 1 2 3; do
  if git pull -q --rebase origin "$BRANCH" && git push -q origin "HEAD:$BRANCH"; then
    log "已推送"
    exit 0
  fi
  sleep 10
done
log "推送失敗"
exit 1
