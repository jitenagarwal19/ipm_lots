#!/usr/bin/env bash
#
# Make the dashboard survive a reboot, with nobody logged in.
#
#   sudo bash deploy/install-daemons.sh
#
# Why this exists: everything currently runs as LaunchAgents, which start at
# LOGIN. On a Mac that reboots unpredictably and sits at the login window, that
# means nothing comes back — which is exactly what happened. LaunchDaemons start
# at BOOT, before any login, with no desktop session and no auto-login needed.
#
# Idempotent. Safe to re-run after every deploy or OS update.

set -euo pipefail

PROD_DIR="${PROD_DIR:-/Users/jitenagarwal/ipm-production}"
PROD_USER="${PROD_USER:-jitenagarwal}"
BREW=/opt/homebrew/bin/brew

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo:  sudo bash deploy/install-daemons.sh" >&2
  exit 1
fi

step() { printf "\n\033[1m==> %s\033[0m\n" "$1"; }
ok()   { printf "    \033[32mok\033[0m  %s\n" "$1"; }
bad()  { printf "    \033[31m!!\033[0m  %s\n" "$1"; }

step "Stopping anything started by hand or at login"
# Both must go, or launchd's copies fight them for the ports.
for port in 4100 3100; do
  pids=$(lsof -ti:$port 2>/dev/null || true)
  [[ -n "$pids" ]] && kill $pids 2>/dev/null && ok "freed port $port" || ok "port $port already free"
done
pkill -f "cloudflared tunnel --config" 2>/dev/null && ok "stopped hand-run tunnel" || true
sudo -u "$PROD_USER" $BREW services stop postgresql@16 >/dev/null 2>&1 || true
sudo -u "$PROD_USER" $BREW services stop redis        >/dev/null 2>&1 || true
ok "stopped login-scoped postgres/redis agents"

step "PostgreSQL and Redis as SYSTEM services"
# Without sudo these install as LaunchAgents — the very problem being fixed.
$BREW services start postgresql@16 >/dev/null 2>&1 && ok "postgresql@16" || bad "postgresql@16 failed — check: brew services list"
$BREW services start redis         >/dev/null 2>&1 && ok "redis"         || bad "redis failed"

step "Generating the app daemons"
sudo -u "$PROD_USER" bash "$PROD_DIR/deploy/launchdaemons.sh" >/dev/null
ok "plists written to $PROD_DIR/deploy/generated"

step "Installing and loading"
for f in "$PROD_DIR"/deploy/generated/com.sumanexport.*.plist; do
  label="$(basename "$f" .plist)"
  # Unload an older copy first so a changed plist actually takes effect.
  launchctl bootout "system/$label" 2>/dev/null || true
  install -m 644 -o root -g wheel "$f" "/Library/LaunchDaemons/$(basename "$f")"
  if launchctl bootstrap system "/Library/LaunchDaemons/$(basename "$f")" 2>/dev/null; then
    ok "$label"
  else
    # bootstrap fails if it is somehow already loaded; kickstart covers that.
    launchctl kickstart -k "system/$label" 2>/dev/null && ok "$label (restarted)" || bad "$label did not load"
  fi
done

step "Waiting for services to come up"
for i in $(seq 1 20); do
  api=$(curl -s -m 3 -o /dev/null -w '%{http_code}' http://127.0.0.1:4100/health 2>/dev/null || echo 000)
  web=$(curl -s -m 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/login 2>/dev/null || echo 000)
  [[ "$api" == "200" && "$web" == "200" ]] && break
  sleep 3
done

step "Result"
printf "    %-14s %s\n" "PostgreSQL" "$(pg_isready -q 2>/dev/null && echo up || (ls /opt/homebrew/Cellar/postgresql@16/*/bin/pg_isready >/dev/null 2>&1 && /opt/homebrew/Cellar/postgresql@16/*/bin/pg_isready -q && echo up || echo DOWN))"
printf "    %-14s %s\n" "Redis"      "$(/opt/homebrew/bin/redis-cli ping >/dev/null 2>&1 && echo up || echo DOWN)"
printf "    %-14s %s\n" "API :4100"  "$(curl -s -m 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:4100/health 2>/dev/null)"
printf "    %-14s %s\n" "Web :3100"  "$(curl -s -m 8 -o /dev/null -w '%{http_code}' http://127.0.0.1:3100/login 2>/dev/null)"
printf "    %-14s %s\n" "Tunnel"     "$(pgrep -f 'cloudflared tunnel --config' >/dev/null && echo up || echo DOWN)"
printf "    %-14s %s\n" "Public URL" "$(curl -s -m 20 -o /dev/null -w '%{http_code}' https://f2vxka-xhb8.indianspiceexporter.com/health 2>/dev/null)"

cat <<'NEXT'

    All of the above now start at boot, with nobody logged in.
    Test it properly:  sudo reboot     (then wait ~90s and reload the site)

    Check any time:    sudo launchctl list | grep sumanexport
    Logs:              tail -f /Users/jitenagarwal/ipm-production/logs/*.log

NEXT
