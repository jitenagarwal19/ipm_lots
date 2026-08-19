#!/usr/bin/env bash
#
# Turn this Mac Mini into the server for the IPM dashboard.
# Idempotent — safe to re-run. Prints what it would change before changing it.
#
#   bash deploy/setup-mac-server.sh              # check only, changes nothing
#   bash deploy/setup-mac-server.sh --apply      # do it
#
# What it does NOT do: create the Cloudflare tunnel or its DNS record. That
# publishes a hostname to the internet, so it stays a deliberate manual step —
# the exact commands are printed at the end.

set -euo pipefail

APPLY=false
[[ "${1:-}" == "--apply" ]] && APPLY=true

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BREW="${BREW:-/opt/homebrew/bin/brew}"
ok()   { printf "  \033[32m✓\033[0m %s\n" "$1"; }
warn() { printf "  \033[33m!\033[0m %s\n" "$1"; }
todo() { printf "  \033[36m→\033[0m %s\n" "$1"; }

run() {
  if $APPLY; then eval "$1"; else todo "would run: $1"; fi
}

echo
echo "IPM Mac Mini server setup  ($($APPLY && echo APPLYING || echo 'check only — pass --apply to change things'))"
echo "────────────────────────────────────────────────────────────────────"

# ── 1. Power. A server that does not come back after a power cut is not a server.
echo
echo "Power"
if [[ "$(pmset -g | awk '/ sleep /{print $2}')" == "0" ]]; then
  ok "sleep is disabled"
else
  warn "the Mac sleeps — the dashboard would go offline"
  todo "sudo pmset -a sleep 0 disablesleep 1"
fi
if [[ "$(pmset -g | awk '/autorestart/{print $2}')" == "1" ]]; then
  ok "auto-restart after power failure is on"
else
  warn "autorestart is off — after a power cut this stays down until someone presses the button"
  todo "sudo pmset -a autorestart 1"
fi

# ── 2. Auto-login. LaunchAgents (postgres, pm2, the tunnel) only start at login.
echo
echo "Unattended reboot"
if sudo -n defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser &>/dev/null; then
  ok "auto-login is configured — LaunchAgents will start after a reboot"
else
  warn "auto-login not detected. Postgres, pm2 and the tunnel are LaunchAgents,"
  warn "so after an unattended reboot NOTHING starts until someone logs in."
  todo "System Settings → Users & Groups → Automatic login → jitenagarwal"
  todo "(the Mac must then be physically secure — anyone with access gets a desktop)"
fi

# ── 3. Services the app depends on.
echo
echo "Services"
# postgresql@16 is keg-only, so its binaries are not on PATH. Find them rather
# than reporting a running database as down.
PG_ISREADY="$(ls /opt/homebrew/Cellar/postgresql@16/*/bin/pg_isready 2>/dev/null | head -1)"
if [[ -n "$PG_ISREADY" ]] && "$PG_ISREADY" -q 2>/dev/null; then
  ok "PostgreSQL is accepting connections"
else
  warn "PostgreSQL is not running"; run "$BREW services start postgresql@16"
fi
if /opt/homebrew/bin/redis-cli ping &>/dev/null; then
  ok "Redis is running"
else
  warn "Redis is not running — the Gmail worker polls through it, so email ingest would silently never happen"
  run "$BREW services start redis"
fi
command -v pm2 &>/dev/null && ok "pm2 installed" || run "npm install -g pm2"
command -v cloudflared &>/dev/null && ok "cloudflared installed ($(cloudflared --version 2>&1 | awk '{print $3}'))" \
  || run "$BREW install cloudflared"

# ── 4. Bind the databases to localhost only. They are reachable through the
#       tunnel only if we route them, and we never do — but defence in depth.
echo
echo "Exposure"
# Nothing here should be reachable from the LAN, let alone the internet. The
# tunnel only forwards what its ingress rules name, and it never names these.
for svc in "PostgreSQL:5432" "Redis:6379"; do
  name="${svc%%:*}"; port="${svc##*:}"
  listening="$(netstat -an 2>/dev/null | grep "\.${port} " | grep LISTEN || true)"
  if [[ -z "$listening" ]]; then
    ok "$name not listening (service stopped)"
  elif echo "$listening" | grep -qv "127\.0\.0\.1\|::1\|\*\.\*"; then
    warn "$name may be listening beyond localhost — check its bind address:"
    echo "$listening" | sed 's/^/      /'
  else
    ok "$name listens on localhost only"
  fi
done

# ── 5. Directories.
echo
echo "Directories"
for d in "$APP_DIR/logs" "$HOME/ipm-data/uploads" "$HOME/ipm-data/backups"; do
  [[ -d "$d" ]] && ok "$d" || run "mkdir -p '$d'"
done

# ── 6. Tunnel config.
echo
echo "Cloudflare tunnel"
if [[ -f "$HOME/.cloudflared/cert.pem" ]]; then
  ok "cloudflared is authenticated to your Cloudflare account"
else
  warn "not authenticated"; todo "cloudflared tunnel login"
fi
if [[ -f "$HOME/.cloudflared/config.yml" ]]; then
  ok "tunnel config present"
else
  warn "no ~/.cloudflared/config.yml — see the manual steps below"
fi

cat <<'NEXT'

────────────────────────────────────────────────────────────────────
Manual steps — these publish to the internet, so they are yours to run
────────────────────────────────────────────────────────────────────

1. Create the tunnel and point the hostname at it:

     cloudflared tunnel create ipm-dashboard
     cloudflared tunnel route dns ipm-dashboard f2vxka-xhb8.indianspiceexporter.com

   Note the tunnel ID it prints.

2. Install the tunnel config, substituting that ID and the hostname:

     sed -e "s/REPLACE_WITH_TUNNEL_ID/<id>/g" \
         -e "s/REPLACE_WITH_HOSTNAME/f2vxka-xhb8.indianspiceexporter.com/g" \
         deploy/cloudflared-ipm.yml > ~/.cloudflared/config.yml

3. Run the tunnel under launchd:

     cp deploy/com.sumanexport.ipm-tunnel.plist ~/Library/LaunchAgents/
     launchctl load -w ~/Library/LaunchAgents/com.sumanexport.ipm-tunnel.plist

4. Cloudflare Zero Trust → Access → Applications → Add:
     Type: Self-hosted
     Domain: f2vxka-xhb8.indianspiceexporter.com
     Policy: Allow → Emails → your allowlist
   Nothing reaches this Mac until Cloudflare has checked that email.

5. Build and start the app:

     (cd backend  && npm ci && npx prisma migrate deploy && npm run build)
     (cd frontend && npm ci && npm run build)
     pm2 start ecosystem.config.js && pm2 save
     pm2 startup            # run the command it prints

NEXT
