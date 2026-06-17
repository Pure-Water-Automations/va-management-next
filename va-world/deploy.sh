#!/usr/bin/env bash
# Deploy va-world (Colyseus virtual office) to the VPS. Independently runnable:
# rsyncs just va-world/ into the manager's deployed tree, installs its OWN deps
# (separate node_modules from the Next manager), builds the Phaser client with the
# production WS URL baked in, and restarts the service. Env + secrets live in the
# VPS shared/ dir and are NOT shipped from here.
set -euo pipefail

VPS="${VPS:-root@74.208.40.108}"
BASE="/app/SecondBrain/va-management-console"
DIR="$BASE/current/va-world"
SRC="$(cd "$(dirname "$0")" && pwd)"
WS_URL="${VITE_WORLD_WS_URL:-wss://world.pwasecondbrain.uk}"

echo "==> rsync va-world/ -> $VPS:$DIR"
rsync -az --delete \
  --exclude node_modules/ --exclude dist/ --exclude .git/ \
  --exclude .env --exclude .env.local --exclude .env.production \
  --exclude tsconfig.tsbuildinfo \
  "$SRC/" "$VPS:$DIR/"

echo "==> npm ci + build (VITE_WORLD_WS_URL=$WS_URL) + restart on VPS"
ssh "$VPS" "cd $DIR && \
  npm ci --include=dev --no-audit --no-fund && \
  VITE_WORLD_WS_URL='$WS_URL' npm run build && \
  systemctl restart va-world && \
  sleep 2 && echo active=\$(systemctl is-active va-world) && \
  curl -s http://127.0.0.1:2567/health"

echo ""
echo "==> done. https://world.pwasecondbrain.uk"
