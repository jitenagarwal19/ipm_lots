#!/usr/bin/env bash
#
# Server-side deploy. Lives in the checkout root on the VPS and is invoked by
# .github/workflows/deploy.yml as:  ./deploy.sh <git-sha>
#
# Design notes:
#   - Migrations run BEFORE the new code starts, and only ever via
#     `prisma migrate deploy`. Never `db push` — it resolves differences by
#     applying them, which against production can drop a column and its data.
#   - The build happens here, from the exact checkout being deployed.
#   - The previous commit is recorded so a bad deploy can be rolled back with
#     one command (printed at the end).
#   - `pm2 reload` restarts workers one at a time rather than dropping the API.
#
# Deliberately NOT automatic: rollback. A failed migration needs a human to
# decide whether reverting the code is safe with the new schema in place.

set -euo pipefail

TARGET_SHA="${1:-origin/main}"
APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$APP_DIR"

PREVIOUS_SHA="$(git rev-parse HEAD)"
echo "==> Deploying ${TARGET_SHA} (currently ${PREVIOUS_SHA})"

echo "==> Fetching"
git fetch --all --prune
git checkout --detach "$TARGET_SHA"

echo "==> Backing up the database first"
# A migration that goes wrong is only recoverable if this ran.
BACKUP_DIR="${BACKUP_DIR:-/var/ipm/backups}"
mkdir -p "$BACKUP_DIR"
pg_dump "$(grep -E '^DATABASE_URL' backend/.env | cut -d'"' -f2)" -Fc \
  -f "$BACKUP_DIR/pre-deploy-$(date +%Y%m%d-%H%M%S).dump"
# Keep the last 20 only.
ls -1t "$BACKUP_DIR"/pre-deploy-*.dump 2>/dev/null | tail -n +21 | xargs -r rm --

echo "==> Backend: install, migrate, build"
cd "$APP_DIR/backend"
npm ci --omit=dev --ignore-scripts
npm ci --include=dev --ignore-scripts   # tsc and prisma CLI are devDependencies
npx prisma generate
npx prisma migrate deploy
npm run build

echo "==> Frontend: install and build"
cd "$APP_DIR/frontend"
npm ci
# Next resolves rewrite destinations at build time, so the backend origin has to
# be present for the build itself. Setting it only at run time silently proxies
# production to whatever port was baked in.
BACKEND_PORT="$(grep -E '^PORT=' ../backend/.env | cut -d= -f2 | tr -d '"' || echo 4100)"
BACKEND_URL="http://127.0.0.1:${BACKEND_PORT}" npm run build
node scripts/verify-rewrites.mjs "http://127.0.0.1:${BACKEND_PORT}"

echo "==> Restarting services"
cd "$APP_DIR"
# launchd, not pm2: these run as LaunchDaemons so they come back when the Mac is
# powered on, without anyone logging in. kickstart -k restarts a running job.
for svc in ipm-api ipm-worker ipm-web; do
  if sudo launchctl kickstart -k "system/com.sumanexport.$svc" 2>/dev/null; then
    echo "    restarted $svc"
  else
    echo "    $svc not loaded as a daemon — start it with launchctl load, or run it by hand"
  fi
done

echo
echo "==> Deployed ${TARGET_SHA}"
echo "    Roll back with:  ./deploy.sh ${PREVIOUS_SHA}"
echo "    Note: a rollback does NOT undo migrations. Check what"
echo "    'prisma migrate deploy' applied before reverting."
