#!/usr/bin/env node
/**
 * Uptime watchdog for the production stack.
 *
 * Runs every 60s from com.sumanexport.ipm-watchdog. Checks each piece, and
 * emails only when a check CHANGES state — down, or recovered. A monitor that
 * emails every minute while something is broken gets filtered within a day, and
 * then it is not a monitor any more.
 *
 * What this cannot do
 * -------------------
 * It cannot tell you the Mac is off. A watchdog on the machine dies with the
 * machine, which is the outage you most want to hear about. That is what
 * HEARTBEAT_URL is for: on every all-clear it pings an external dead-man's
 * switch (healthchecks.io or similar). Stop pinging — because the Mini is off,
 * the power is out, or the internet is down — and *they* email you.
 *
 * Deliberately does not restart anything. You asked to be told so you can
 * decide; a watchdog that silently restarts a crash-looping service hides the
 * fault it should be reporting.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { execFileSync } = require('node:child_process');

const PROD_DIR = process.env.PROD_DIR || '/Users/jitenagarwal/ipm-production';
const STATE_FILE = path.join(PROD_DIR, 'logs', 'watchdog-state.json');
const ENV_FILE = path.join(PROD_DIR, 'backend', '.env');

// ── config from the production .env, so there is one place for secrets
function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = { ...loadEnv(ENV_FILE), ...process.env };

const ALERT_TO = env.WATCHDOG_ALERT_EMAIL || env.AUTH_NOTIFY_EMAIL || 'spices@sumanexport.in';
const PUBLIC_URL = env.PUBLIC_URL || '';
const HEARTBEAT_URL = env.HEARTBEAT_URL || '';
const API_PORT = Number(env.PORT || 4100);
const WEB_PORT = Number(env.WEB_PORT || 3100);

// ── checks
const timeout = (ms) => new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out after ${ms}ms`)), ms));

function tcp(port, host = '127.0.0.1', ms = 3000) {
  return Promise.race([
    new Promise((resolve, reject) => {
      const s = net.connect({ port, host }, () => { s.end(); resolve(true); });
      s.on('error', reject);
    }),
    timeout(ms),
  ]);
}

async function http(url, ms = 8000) {
  const res = await Promise.race([fetch(url, { redirect: 'manual' }), timeout(ms)]);
  // 2xx and 3xx both mean "the process answered". A redirect to /login is a
  // perfectly healthy Next.js.
  if (res.status >= 400) throw new Error(`HTTP ${res.status}`);
  return true;
}

const CHECKS = [
  { name: 'PostgreSQL', run: () => tcp(5432) },
  { name: 'Redis', run: () => tcp(6379) },
  { name: 'API', run: () => http(`http://127.0.0.1:${API_PORT}/health`) },
  { name: 'Web', run: () => http(`http://127.0.0.1:${WEB_PORT}/login`) },
  {
    name: 'Tunnel process',
    run: async () => {
      const out = execFileSync('/bin/ps', ['-Ao', 'command'], { encoding: 'utf8' });
      if (!/cloudflared\s+tunnel/.test(out)) throw new Error('cloudflared is not running');
      return true;
    },
  },
];

// Reaching the public URL proves the whole chain — tunnel, Cloudflare, and the
// app. Skipped when unset, and treated as informational: Cloudflare Access will
// answer 302 to an unauthenticated probe, which is a healthy answer.
if (PUBLIC_URL) {
  CHECKS.push({ name: 'Public URL', run: () => http(`${PUBLIC_URL.replace(/\/$/, '')}/health`, 12000) });
}

// ── email, through the same Gmail account the app uses
async function sendAlert(subject, body) {
  try {
    const { google } = require(path.join(PROD_DIR, 'backend', 'node_modules', 'googleapis'));
    const creds = JSON.parse(env.GMAIL_CREDENTIALS_JSON || fs.readFileSync(path.join(PROD_DIR, 'backend', 'credentials.json'), 'utf8'));
    const token = JSON.parse(env.GMAIL_TOKEN_JSON || fs.readFileSync(path.join(PROD_DIR, 'backend', 'token.json'), 'utf8'));
    const { client_id, client_secret, redirect_uris } = creds.installed || creds.web;
    const auth = new google.auth.OAuth2(client_id, client_secret, (redirect_uris || ['http://localhost'])[0]);
    auth.setCredentials(token);
    const gmail = google.gmail({ version: 'v1', auth });
    const profile = await gmail.users.getProfile({ userId: 'me' });
    const from = profile.data.emailAddress || 'me';
    const raw = Buffer.from(
      [`to: ${ALERT_TO}`, `from: ${from}`, `subject: ${subject}`, 'Content-Type: text/plain; charset="UTF-8"', '', body].join('\n')
    ).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } });
    return true;
  } catch (e) {
    // Log and carry on. A failing mailer must not stop the heartbeat, which is
    // the backstop that catches this very situation.
    console.error(`[watchdog] could not send alert: ${e.message}`);
    return false;
  }
}

async function heartbeat(ok) {
  if (!HEARTBEAT_URL) return;
  try {
    await fetch(ok ? HEARTBEAT_URL : `${HEARTBEAT_URL}/fail`, { method: 'POST' });
  } catch {
    /* the dead-man's switch will fire on its own if we cannot reach it */
  }
}

// ── state, so we only speak on change
function readState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); } catch { return {}; }
}
function writeState(s) {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2));
}

(async () => {
  const previous = readState();
  const now = new Date().toISOString();
  const results = {};
  const newlyDown = [];
  const recovered = [];

  for (const check of CHECKS) {
    let ok = true, detail = '';
    try { await check.run(); } catch (e) { ok = false; detail = e.message; }
    results[check.name] = { ok, detail, at: now };

    const was = previous[check.name]?.ok;
    if (was === true && !ok) newlyDown.push(`${check.name} — ${detail}`);
    if (was === false && ok) recovered.push(check.name);
  }

  const allOk = Object.values(results).every((r) => r.ok);
  const summary = Object.entries(results)
    .map(([n, r]) => `  ${r.ok ? 'UP  ' : 'DOWN'}  ${n}${r.detail ? ` — ${r.detail}` : ''}`)
    .join('\n');

  if (newlyDown.length) {
    await sendAlert(
      `IPM dashboard DOWN — ${newlyDown.length} check${newlyDown.length > 1 ? 's' : ''} failing`,
      `The following stopped responding at ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' })} IST:\n\n` +
        newlyDown.map((d) => `  - ${d}`).join('\n') +
        `\n\nFull status:\n${summary}\n\n` +
        `On the Mac Mini:\n` +
        `  sudo launchctl list | grep sumanexport\n` +
        `  tail -50 ${PROD_DIR}/logs/*.log\n` +
        `  sudo launchctl kickstart -k system/com.sumanexport.ipm-api\n`
    );
  }
  if (recovered.length && !newlyDown.length) {
    await sendAlert(
      'IPM dashboard recovered',
      `Back up at ${new Date().toLocaleString('en-GB', { timeZone: 'Asia/Kolkata' })} IST: ` +
        `${recovered.join(', ')}.\n\nFull status:\n${summary}\n`
    );
  }

  await heartbeat(allOk);
  writeState(results);

  console.log(`[${now}] ${allOk ? 'all ok' : 'DEGRADED'}\n${summary}`);
  process.exit(0);
})().catch((e) => {
  console.error('[watchdog] fatal:', e);
  process.exit(1);
});
