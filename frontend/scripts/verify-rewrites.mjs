/**
 * Fail the build if the /api rewrite was baked pointing somewhere unexpected.
 *
 * Next resolves rewrite destinations at build time. If BACKEND_URL is not set
 * for `next build`, production silently proxies to the development backend —
 * requests never arrive, and neither side logs anything. That surfaced once as
 * an unexplained "Could not send a code." on the login screen. This makes it loud.
 *
 *   node scripts/verify-rewrites.mjs http://127.0.0.1:4100
 */
import { readFileSync } from 'node:fs';

const expected = process.argv[2];
if (!expected) {
  console.error('usage: verify-rewrites.mjs <expected-backend-origin>');
  process.exit(2);
}

const manifest = JSON.parse(readFileSync('.next/routes-manifest.json', 'utf8'));
const rw = manifest.rewrites;
const rules = Array.isArray(rw)
  ? rw
  : [...(rw.beforeFiles ?? []), ...(rw.afterFiles ?? []), ...(rw.fallback ?? [])];

const api = rules.find((r) => r.source?.startsWith('/api'));
if (!api) {
  console.error('FAIL: no /api rewrite in the build — the API would be unreachable.');
  process.exit(1);
}
if (!api.destination.startsWith(expected)) {
  console.error(`FAIL: /api rewrite points at ${api.destination}`);
  console.error(`      expected a destination starting ${expected}`);
  console.error('      Set BACKEND_URL (or BACKEND_PORT) before running `next build`.');
  process.exit(1);
}
console.log(`    /api rewrite -> ${api.destination}  OK`);
