#!/usr/bin/env bash
# Deploy the PWA VA Management console.
#
#   ./deploy.sh prod           deploy main            -> Hostinger PRODUCTION (guarded)
#   ./deploy.sh prod <ref>     prod refuses anything that isn't main or a v* tag
#   ./deploy.sh dev  <ref>     deploy any committed ref -> IONOS dev/testing box
#
# House model (main = prod, set 2026-07-09):
#   main       = production — EXACTLY what's live on Hostinger. Ship via this script.
#   feature/*  = dev + testing, deployed to the IONOS subdomains (dev-team, discovery,
#                dev-projects). Promote by merging a tested feature into main + `prod`.
#   hotfix     = branch FROM main, fix, merge back to main, deploy prod.
#
# Only COMMITTED code ever reaches a box:
#   prod = git push main to the box's bare repo + checkout/reset (the box IS a git
#          checkout on `main` — `git log` on the box = what's live).
#   dev  = `git archive <ref>` rsync'd (never the dirty working tree).
# Prod additionally: pg_dumps the DB first, runs migrate deploy, and health-checks.
#
# NOTE: `dev` has NO default ref on purpose. The dev box runs whichever
# feature/integration branch is under test (e.g. integration/dev-mcp); deploying a bare
# `main` there would push the lean prod schema onto the dev DB and break it.
set -euo pipefail

ENV="${1:-}"
REF="${2:-}"
SRC="$(cd "$(dirname "$0")" && pwd)"

DEV_VPS="root@74.208.40.108"
PROD_VPS="root@2.24.121.26"
BASE="/app/SecondBrain/va-management-console"
SERVICE="va-management-web"
PORT="8796"
DEV_URL="https://dev-team.pwasecondbrain.uk"
PROD_URL="https://team.purewaterautomations.com"

usage() { echo "usage: ./deploy.sh <dev|prod> [ref]   (dev requires an explicit ref)"; exit 1; }
[ -z "$ENV" ] && usage

build_and_restart() { # $1 = vps
  ssh "$1" "cd $BASE/current && \
    set -a && . $BASE/shared/.env.production && set +a && \
    npm ci --include=dev --no-audit --no-fund && \
    npx prisma generate && \
    npx prisma migrate deploy && \
    npm run build && \
    systemctl restart $SERVICE && \
    sleep 2 && echo active=\$(systemctl is-active $SERVICE) && \
    curl -sf http://127.0.0.1:$PORT/api/health"
}

case "$ENV" in
  dev)
    [ -z "$REF" ] && { echo "ERROR: dev needs an explicit ref, e.g. ./deploy.sh dev integration/dev-mcp"; exit 1; }
    git -C "$SRC" rev-parse --verify --quiet "$REF^{commit}" >/dev/null \
      || { echo "ERROR: '$REF' is not a committed ref. Commit first — the dirty tree never ships."; exit 1; }
    SHA="$(git -C "$SRC" rev-parse --short "$REF")"
    echo "==> dev: git archive $REF ($SHA) -> $DEV_VPS:$BASE/current"
    TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
    git -C "$SRC" archive "$REF" | tar -x -C "$TMP"
    # va-world lives in its own repo and is deployed separately; excluded so the
    # --delete rsync never touches the live va-world dir on the dev box.
    rsync -az --delete \
      --exclude node_modules/ --exclude .next/ --exclude .git/ \
      --exclude va-world/ --exclude .secrets/ \
      "$TMP/" "$DEV_VPS:$BASE/current/"
    ssh "$DEV_VPS" "echo '$SHA' > $BASE/current/DEPLOYED_VERSION"
    build_and_restart "$DEV_VPS"
    echo; echo "==> done. $DEV_URL (deployed $SHA)"
    ;;

  prod)
    REF="${REF:-main}"
    # HARD GUARD: prod only ships main or a v* release tag.
    if [ "$REF" != "main" ] && ! [[ "$REF" == v* ]]; then
      echo "ERROR: prod deploys only 'main' or a v* tag (got '$REF')."
      echo "       Promote first:  git merge <tested-feature> into main, then ./deploy.sh prod"
      exit 1
    fi
    git -C "$SRC" rev-parse --verify --quiet "$REF^{commit}" >/dev/null \
      || { echo "ERROR: '$REF' does not resolve to a commit."; exit 1; }
    SHA="$(git -C "$SRC" rev-parse --short "$REF")"

    echo "==> prod: backing up database first"
    ssh "$PROD_VPS" "cd $BASE && set -a && . shared/.env.production && set +a && \
      TS=\$(date +%Y%m%d-%H%M%S) && \
      pg_dump \"\$DATABASE_URL\" | gzip > backups/va_console-predeploy-\$TS.sql.gz && \
      gzip -t backups/va_console-predeploy-\$TS.sql.gz && echo \"backup ok: backups/va_console-predeploy-\$TS.sql.gz\""

    echo "==> prod: pushing $REF ($SHA) to the box repo"
    git -C "$SRC" push --force "ssh://$PROD_VPS$BASE/repo.git" "$REF:main"

    echo "==> prod: checkout main + build + migrate + restart"
    ssh "$PROD_VPS" "cd $BASE/current && \
      git fetch origin && git checkout -f -B main origin/main && git reset --hard origin/main && \
      git log --oneline -1"
    build_and_restart "$PROD_VPS"
    echo; echo "==> done. $PROD_URL (deployed $SHA)"
    ;;

  *) usage ;;
esac
