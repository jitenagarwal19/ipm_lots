#!/usr/bin/env bash
#
# One-time VPS setup for the IPM dashboard. Ubuntu 22.04 / 24.04.
# Idempotent — safe to re-run.
#
#   sudo bash deploy/provision-vps.sh
#
# Installs Node 22, Postgres, Redis, Nginx and PM2; creates the app user,
# directories and firewall rules. It does NOT deploy the app — deploy.sh does
# that, and the GitHub Actions workflow calls deploy.sh on every merge to main.

set -euo pipefail

APP_USER="${APP_USER:-ipm}"
APP_DIR="${APP_DIR:-/var/www/ipm}"
DATA_DIR="${DATA_DIR:-/var/ipm}"
DB_NAME="${DB_NAME:-ipm_lots}"
DB_USER="${DB_USER:-ipm}"
REPO="${REPO:-git@github.com:jitenagarwal19/ipm_lots.git}"

if [[ $EUID -ne 0 ]]; then echo "Run with sudo."; exit 1; fi

echo "==> Packages"
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg git nginx ufw postgresql postgresql-contrib redis-server

echo "==> Node 22 LTS"
# Prisma 5.22 is tested against Node 18/20/22. Not 24 — a deploy is the wrong
# place to discover an incompatibility.
if ! node -v 2>/dev/null | grep -q '^v22'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi
node -v

echo "==> PM2"
npm install -g pm2@latest >/dev/null

echo "==> App user and directories"
id -u "$APP_USER" &>/dev/null || adduser --system --group --home "$APP_DIR" --shell /bin/bash "$APP_USER"
mkdir -p "$APP_DIR" "$DATA_DIR/uploads" "$DATA_DIR/backups" /var/log/ipm
chown -R "$APP_USER:$APP_USER" "$APP_DIR" "$DATA_DIR" /var/log/ipm

echo "==> PostgreSQL"
# Bind to localhost only. The database must never be reachable from the internet.
systemctl enable --now postgresql
sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1 || {
  DB_PASS="$(openssl rand -base64 24 | tr -d '/+=' | head -c 24)"
  sudo -u postgres psql -qc "CREATE ROLE $DB_USER LOGIN PASSWORD '$DB_PASS';"
  sudo -u postgres psql -qc "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
  echo
  echo "  ******************************************************************"
  echo "  DATABASE_URL=\"postgresql://$DB_USER:$DB_PASS@localhost:5432/$DB_NAME\""
  echo "  Put this in $APP_DIR/backend/.env — it is not shown again."
  echo "  ******************************************************************"
  echo
}

echo "==> Redis"
# Localhost only, for the BullMQ worker.
sed -i 's/^# *bind .*/bind 127.0.0.1 ::1/' /etc/redis/redis.conf || true
systemctl enable --now redis-server

echo "==> Firewall"
# Only SSH and web. Postgres (5432) and Redis (6379) stay closed; the app
# reaches them over localhost.
ufw allow OpenSSH >/dev/null
ufw allow 'Nginx Full' >/dev/null
ufw --force enable >/dev/null
ufw status numbered | sed 's/^/    /'

echo "==> Nginx"
if [[ -f "$APP_DIR/deploy/nginx-ipm.conf" ]]; then
  cp "$APP_DIR/deploy/nginx-ipm.conf" /etc/nginx/sites-available/ipm
  ln -sf /etc/nginx/sites-available/ipm /etc/nginx/sites-enabled/ipm
  rm -f /etc/nginx/sites-enabled/default
  nginx -t && systemctl reload nginx
else
  echo "    (clone the repo to $APP_DIR first, then re-run to install the nginx site)"
fi

cat <<NEXT

==> Provisioned.

Next, as $APP_USER:

  1. Clone the repo (needs a deploy key on GitHub):
       sudo -u $APP_USER git clone $REPO $APP_DIR

  2. Create $APP_DIR/backend/.env from backend/.env.example.
     For IP-only UAT you need at minimum:
       DATABASE_URL=...            (printed above)
       NODE_ENV=production
       COOKIE_SECURE=false         # no TLS yet — remove once certbot has run
       UPLOADS_DIR=$DATA_DIR/uploads
       AUTH_ALLOWED_EMAILS=...
       OPENAI_API_KEY=...
       GMAIL_CREDENTIALS_JSON=...  # single-line JSON
       GMAIL_TOKEN_JSON=...
       REDIS_HOST=127.0.0.1
     chmod 600 $APP_DIR/backend/.env

  3. First deploy:
       sudo -u $APP_USER bash -c "cd $APP_DIR && ./deploy.sh origin/main"

  4. Start under PM2 and make it survive reboots:
       sudo -u $APP_USER pm2 start $APP_DIR/ecosystem.config.js
       sudo -u $APP_USER pm2 save
       pm2 startup systemd -u $APP_USER --hp $APP_DIR

  5. Migrate the existing data from the laptop (18 MB database, 21 MB uploads).

NEXT
