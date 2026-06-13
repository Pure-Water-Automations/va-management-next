#!/usr/bin/env bash
# Redeploy the PWA VA Management console to the VPS.
# Mirrors the Event Planner Console flow: rsync source -> npm ci (incl dev) ->
# prisma generate + migrate deploy -> build -> restart. Env + secrets live in the
# VPS `shared/` dir and are NOT shipped from here.
set -euo pipefail

VPS="${VPS:-root@74.208.40.108}"
BASE="/app/SecondBrain/va-management-console"
SRC="$(cd "$(dirname "$0")" && pwd)"

echo "==> rsync source -> $VPS:$BASE/current"
rsync -az --delete \
  --exclude node_modules/ --exclude .next/ --exclude .git/ \
  --exclude .env --exclude .env.local --exclude .env.production --exclude .secrets/ \
  --exclude tsconfig.tsbuildinfo --exclude design-system/ \
  "$SRC/" "$VPS:$BASE/current/"

echo "==> build + migrate + restart on VPS"
ssh "$VPS" "cd $BASE/current && \
  set -a && . $BASE/shared/.env.production && set +a && \
  npm ci --include=dev --no-audit --no-fund && \
  npx prisma generate && \
  npx prisma migrate deploy && \
  npm run build && \
  systemctl restart va-management-web && \
  sleep 2 && echo active=\$(systemctl is-active va-management-web) && \
  curl -s http://127.0.0.1:8796/api/health"

echo ""
echo "==> done. https://team.pwasecondbrain.uk"
