#!/usr/bin/env bash
# Deploy the PWA VA Management console.
#
#   ./deploy.sh dev            deploy committed HEAD of main -> IONOS staging
#   ./deploy.sh dev  <ref>     deploy any committed ref      -> IONOS staging
#   ./deploy.sh hub  [ref]     deploy feature/os-hub (or ref) -> IONOS second
#                              instance: dev-projects.pwasecondbrain.uk :8801,
#                              service va-projects-web, DB va_console_hub
#   ./deploy.sh prod           deploy origin/production      -> Hostinger PRODUCTION
#   ./deploy.sh prod <ref>     prod refuses anything that isn't the production
#                              branch or a v* tag (guard against shipping WIP)
#
# Model (dual-env-deploy house standard, adapted):
#   main        = integration, deployed freely to the IONOS dev box
#   production  = exactly what's live on Hostinger; moves via merge + this script
#   hotfix      = branch FROM production, fix, merge back, deploy prod,
#                 then cherry-pick/merge back to main (dev ⊇ prod invariant)
#
# Only COMMITTED code ever reaches a box:
#   dev  = `git archive <ref>` rsync'd (never the dirty working tree)
#   prod = git push to the box's bare repo + `git reset --hard` of current/
#          (the box IS a git checkout — `git log` on the box = what's live)
#
# Prod flow additionally: pg_dumps the DB first, runs migrate deploy, and
# health-checks after restart. Env + secrets live in each box's shared/ dir
# and are never shipped from here.
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

usage() { echo "usage: ./deploy.sh <dev|hub|prod> [ref]"; exit 1; }
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

deploy_ionos() { # archive-based deploy to the IONOS box; uses BASE/SERVICE/PORT globals
  git -C "$SRC" rev-parse --verify --quiet "$REF^{commit}" >/dev/null \
    || { echo "ERROR: '$REF' is not a committed ref. Commit first — the dirty tree never ships."; exit 1; }
  SHA="$(git -C "$SRC" rev-parse --short "$REF")"
  echo "==> $ENV: git archive $REF ($SHA) -> $DEV_VPS:$BASE/current"
  TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
  git -C "$SRC" archive "$REF" | tar -x -C "$TMP"
  # va-world lives in its own repo and is deployed separately; excluded so the
  # --delete rsync never touches the live va-world dir on the dev box.
  rsync -az --delete \
    --exclude node_modules/ --exclude .next/ --exclude .git/ \
    --exclude va-world/ \
    "$TMP/" "$DEV_VPS:$BASE/current/"
  ssh "$DEV_VPS" "echo '$SHA' > $BASE/current/DEPLOYED_VERSION"
  build_and_restart "$DEV_VPS"
  echo; echo "==> done. $DEV_URL (deployed $SHA)"
}

case "$ENV" in
  dev)
    REF="${REF:-main}"
    deploy_ionos
    ;;

  hub)
    # Second IONOS instance: the OS Hub test environment. Own service, port,
    # and DATABASE (va_console_hub) — safe to deploy feature-branch WIP here.
    REF="${REF:-feature/os-hub}"
    BASE="/app/SecondBrain/va-projects-console"
    SERVICE="va-projects-web"
    PORT="8801"
    DEV_URL="https://dev-projects.pwasecondbrain.uk"
    deploy_ionos
    ;;

  prod)
    REF="${REF:-production}"
    # HARD GUARD: prod only ships the production branch or a v* release tag.
    if [ "$REF" != "production" ] && ! [[ "$REF" == v* ]]; then
      echo "ERROR: prod deploys only 'production' or a v* tag (got '$REF')."
      echo "       Promote first:  git merge <work> into production, then ./deploy.sh prod"
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
    git -C "$SRC" push "ssh://$PROD_VPS$BASE/repo.git" "$REF:production"

    echo "==> prod: checkout + build + migrate + restart"
    ssh "$PROD_VPS" "cd $BASE/current && \
      git fetch origin && git reset --hard origin/production && \
      git log --oneline -1"
    build_and_restart "$PROD_VPS"
    echo; echo "==> done. $PROD_URL (deployed $SHA)"
    echo "==> reminder: dev ⊇ prod — if this was a hotfix, merge it back to main."
    ;;

  *) usage ;;
esac
