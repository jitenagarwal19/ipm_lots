#!/usr/bin/env bash
#
# Generate the LaunchDaemon plists for production, into ./deploy/generated/.
#
# LaunchDaemons, not LaunchAgents. A LaunchAgent starts when a user logs in, so
# with auto-login off nothing comes back when the Mini is powered on — which is
# the one thing that has to work. Daemons start at boot, before any login.
#
# They run as $PROD_USER rather than root: the processes need that user's
# Homebrew node, the production checkout, and ~/.cloudflared credentials, and
# nothing here needs root.

set -euo pipefail

PROD_USER="${PROD_USER:-jitenagarwal}"
PROD_DIR="${PROD_DIR:-/Users/jitenagarwal/ipm-production}"
NODE="${NODE:-/opt/homebrew/bin/node}"
CLOUDFLARED="${CLOUDFLARED:-/opt/homebrew/bin/cloudflared}"
LOG_DIR="$PROD_DIR/logs"
OUT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/generated"

mkdir -p "$OUT"

# $1 label  $2 program-args-xml  $3 working-dir  $4 extra-xml
emit() {
  local label="$1" args="$2" wd="$3" extra="${4:-}"
  cat > "$OUT/com.sumanexport.${label}.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.sumanexport.${label}</string>

  <key>ProgramArguments</key>
  <array>
${args}
  </array>

  <key>WorkingDirectory</key><string>${wd}</string>
  <key>UserName</key><string>${PROD_USER}</string>

  <!-- Start at boot, keep running, and back off instead of spinning if it
       crashes on startup (e.g. the network is not up yet after a reboot). -->
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>15</integer>

  <key>StandardOutPath</key><string>${LOG_DIR}/${label}.log</string>
  <key>StandardErrorPath</key><string>${LOG_DIR}/${label}.log</string>

  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>NODE_ENV</key><string>production</string>
${extra}
  </dict>
</dict>
</plist>
PLIST
  echo "  wrote $OUT/com.sumanexport.${label}.plist"
}

emit "ipm-api" \
"    <string>${NODE}</string>
    <string>${PROD_DIR}/backend/dist/index.js</string>" \
"${PROD_DIR}/backend"

emit "ipm-worker" \
"    <string>${NODE}</string>
    <string>${PROD_DIR}/backend/dist/worker.js</string>" \
"${PROD_DIR}/backend"

# `next start` is launched through node directly so the daemon supervises the
# real process rather than an npm wrapper it cannot signal cleanly.
emit "ipm-web" \
"    <string>${NODE}</string>
    <string>${PROD_DIR}/frontend/node_modules/next/dist/bin/next</string>
    <string>start</string>
    <string>-p</string>
    <string>3100</string>" \
"${PROD_DIR}/frontend" \
"    <key>BACKEND_URL</key><string>http://127.0.0.1:4100</string>"

emit "ipm-tunnel" \
"    <string>${CLOUDFLARED}</string>
    <string>tunnel</string>
    <string>--config</string>
    <string>/Users/${PROD_USER}/.cloudflared/config.yml</string>
    <string>run</string>" \
"${PROD_DIR}"

# The watchdog is a daemon too, on a timer rather than KeepAlive.
cat > "$OUT/com.sumanexport.ipm-watchdog.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.sumanexport.ipm-watchdog</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE}</string>
    <string>${PROD_DIR}/deploy/watchdog.js</string>
  </array>
  <key>WorkingDirectory</key><string>${PROD_DIR}</string>
  <key>UserName</key><string>${PROD_USER}</string>

  <!-- Every 60s. RunAtLoad so a reboot is noticed immediately rather than a
       minute later. -->
  <key>RunAtLoad</key><true/>
  <key>StartInterval</key><integer>60</integer>

  <key>StandardOutPath</key><string>${LOG_DIR}/watchdog.log</string>
  <key>StandardErrorPath</key><string>${LOG_DIR}/watchdog.log</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/opt/homebrew/bin:/usr/bin:/bin</string>
  </dict>
</dict>
</plist>
PLIST
echo "  wrote $OUT/com.sumanexport.ipm-watchdog.plist"

echo
echo "Install with:"
echo "  sudo cp $OUT/*.plist /Library/LaunchDaemons/"
echo "  sudo chown root:wheel /Library/LaunchDaemons/com.sumanexport.*.plist"
echo "  for f in /Library/LaunchDaemons/com.sumanexport.*.plist; do sudo launchctl load -w \"\$f\"; done"
