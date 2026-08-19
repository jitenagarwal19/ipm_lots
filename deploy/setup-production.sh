#!/usr/bin/env bash
#
# Create the production instance: its own checkout, its own database, its own
# ports, its own uploads directory.
#
#   bash deploy/setup-production.sh
#
# Why separate at all: development and production currently share a machine. A
# `npm run dev` that grabs a port, or a migration run in the wrong terminal,
# would otherwise hit live compliance data. Separation makes that impossible
# rather than merely unlikely.
#
# Ports are deliberately NOT the defaults. Dev uses 3000/4000, so production
# takes 3100/4100 — starting the dev server can never accidentally shadow or
# collide with production.

set -euo pipefail

PROD_DIR="${PROD_DIR:-/Users/jitenagarwal/ipm-production}"
DATA_DIR="${DATA_DIR:-/Users/jitenagarwal/ipm-data}"
DEV_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROD_DB="${PROD_DB:-ipm_lots_prod}"
DEV_DB="${DEV_DB:-ipm_lots}"
BRANCH="${BRANCH:-gb-mrl-register-and-lookup}"
PGBIN="$(ls -d /opt/homebrew/Cellar/postgresql@16/*/bin | head -1)"

step() { printf "\n\033[1m==> %s\033[0m\n" "$1"; }
ok()   { printf "    \033[32m✓\033[0m %s\n" "$1"; }

step "Checkout at $PROD_DIR"
if [[ -d "$PROD_DIR/.git" ]]; then
  ok "already exists"
else
  REMOTE="$(git -C "$DEV_DIR" remote get-url origin)"
  git clone --branch "$BRANCH" "$REMOTE" "$PROD_DIR"
  ok "cloned $BRANCH"
fi

step "Data directories"
mkdir -p "$DATA_DIR/uploads" "$DATA_DIR/backups" "$PROD_DIR/logs"
ok "$DATA_DIR/{uploads,backups}"

step "Database $PROD_DB"
if "$PGBIN/psql" -lqt | cut -d'|' -f1 | grep -qw "$PROD_DB"; then
  ok "already exists — leaving its data alone"
else
  "$PGBIN/createdb" "$PROD_DB"
  ok "created"
  # Seed from the development database, which currently holds the real GB MRL
  # register and lab reports. One-time: after this the two diverge, which is
  # the entire point.
  "$PGBIN/pg_dump" "postgresql://jitenagarwal@localhost:5432/$DEV_DB" -Fc \
    | "$PGBIN/pg_restore" -d "postgresql://jitenagarwal@localhost:5432/$PROD_DB" --no-owner
  ok "seeded from $DEV_DB"
fi

step "Uploads"
if [[ -d "$DEV_DIR/backend/uploads" ]] && [[ -z "$(ls -A "$DATA_DIR/uploads" 2>/dev/null)" ]]; then
  cp -R "$DEV_DIR/backend/uploads/." "$DATA_DIR/uploads/"
  ok "copied $(ls -1 "$DATA_DIR/uploads" | wc -l | tr -d ' ') files"
else
  ok "already populated or nothing to copy"
fi

step "Production .env"
if [[ -f "$PROD_DIR/backend/.env" ]]; then
  ok "already exists — not overwriting"
else
  # Start from the dev secrets (OpenAI, Gmail), then override everything that
  # must differ. Rotate the OpenAI key soon: it now lives in two places.
  grep -E '^(OPENAI_API_KEY|OPEN_API_KEY|GMAIL_|PROCESSED_GMAIL_LABEL|TRACKED_EMAIL_LIMIT)' \
    "$DEV_DIR/backend/.env" 2>/dev/null > "$PROD_DIR/backend/.env" || true
  cat >> "$PROD_DIR/backend/.env" <<ENV

# ── production instance ──────────────────────────────────────────────
DATABASE_URL="postgresql://jitenagarwal@localhost:5432/$PROD_DB"
NODE_ENV=production
PORT=4100
WEB_PORT=3100
UPLOADS_DIR=$DATA_DIR/uploads
BACKUP_DIR=$DATA_DIR/backups

# Cloudflare terminates real TLS, so the session cookie stays Secure.
# Do NOT set COOKIE_SECURE=false here.

AUTH_ALLOWED_EMAILS=spices@sumanexport.in,connect@sumanexport.in,export@sumanexport.in,operations@sumanexport.in
AUTH_NOTIFY_EMAIL=spices@sumanexport.in

REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# ── monitoring ───────────────────────────────────────────────────────
WATCHDOG_ALERT_EMAIL=spices@sumanexport.in
PUBLIC_URL=https://f2vxka-xhb8.indianspiceexporter.com
# External dead-man's switch. The watchdog cannot email you about a Mac that is
# switched off — this can. Create a check at healthchecks.io and paste its ping
# URL here.
HEARTBEAT_URL=
ENV
  chmod 600 "$PROD_DIR/backend/.env"
  ok "written (chmod 600)"
fi

step "Copy Gmail credential files if present"
for f in credentials.json token.json; do
  if [[ -f "$DEV_DIR/backend/$f" && ! -f "$PROD_DIR/backend/$f" ]]; then
    cp "$DEV_DIR/backend/$f" "$PROD_DIR/backend/$f"
    chmod 600 "$PROD_DIR/backend/$f"
    ok "$f"
  fi
done

step "Install and build"
( cd "$PROD_DIR/backend"  && npm ci --silent && npx prisma generate && npx prisma migrate deploy && npm run build )
ok "backend"
# BACKEND_URL must be set for the BUILD, not the run: Next bakes rewrite
# destinations into routes-manifest.json. Without it production would proxy to
# the dev backend on 4000 and requests would silently vanish.
( cd "$PROD_DIR/frontend" \
    && npm ci --silent \
    && BACKEND_URL="http://127.0.0.1:4100" npm run build \
    && node scripts/verify-rewrites.mjs "http://127.0.0.1:4100" )
ok "frontend"

step "Done"
cat <<NEXT

    Production:   $PROD_DIR       db=$PROD_DB   ports 4100/3100
    Development:  $DEV_DIR   db=$DEV_DB    ports 4000/3000

    Next:
      bash "$PROD_DIR/deploy/launchdaemons.sh"
      sudo cp "$PROD_DIR/deploy/generated/"*.plist /Library/LaunchDaemons/
      sudo chown root:wheel /Library/LaunchDaemons/com.sumanexport.*.plist
      for f in /Library/LaunchDaemons/com.sumanexport.*.plist; do sudo launchctl load -w "\$f"; done

NEXT
