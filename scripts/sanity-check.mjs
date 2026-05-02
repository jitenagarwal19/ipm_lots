#!/usr/bin/env node
/**
 * End-to-end smoke / sanity checks for the IPM Lots stack.
 *
 * Usage (from repo root):
 *   node scripts/sanity-check.mjs
 *
 * Environment (optional):
 *   BACKEND_URL          default http://127.0.0.1:4000
 *   FRONTEND_URL         default http://127.0.0.1:3000
 *   SERVICE_API_KEY      if the API requires bearer auth, set this (same as backend)
 */

const BACKEND = (process.env.BACKEND_URL || "http://127.0.0.1:4000").replace(/\/+$/, "");
const FRONTEND = (process.env.FRONTEND_URL || "http://127.0.0.1:3000").replace(/\/+$/, "");
const TOKEN = (process.env.SERVICE_API_KEY || process.env.BACKEND_SERVICE_TOKEN || "").trim();

const authHeaders = () =>
  TOKEN ? { Authorization: `Bearer ${TOKEN}` } : {};

async function getJson(url) {
  const res = await fetch(url, { headers: { ...authHeaders() } });
  let body;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { res, body };
}

async function getText(url) {
  const res = await fetch(url);
  const text = await res.text();
  return { res, text };
}

const failures = [];

function fail(name, detail) {
  failures.push({ name, detail });
  console.error(`FAIL: ${name}${detail != null ? ` — ${detail}` : ""}`);
}

function pass(name) {
  console.log(`ok: ${name}`);
}

/** @param {{ name: string, url: string, minStatus?: number, maxStatus?: number, htmlIncludes?: string | string[] }} c */
async function checkHttp(c) {
  const min = c.minStatus ?? 200;
  const max = c.maxStatus ?? 299;
  try {
    const { res, text } = await getText(c.url);
    if (res.status < min || res.status > max) {
      fail(c.name, `HTTP ${res.status} (expected ${min}-${max})`);
      return;
    }
    if (c.htmlIncludes) {
      const needles = Array.isArray(c.htmlIncludes) ? c.htmlIncludes : [c.htmlIncludes];
      for (const n of needles) {
        if (!text.includes(n)) {
          fail(c.name, `response body missing expected snippet: ${JSON.stringify(n).slice(0, 80)}`);
          return;
        }
      }
    }
    pass(c.name);
  } catch (e) {
    fail(c.name, e instanceof Error ? e.message : String(e));
  }
}

/** @param {{ name: string, url: string, test: (j: any) => boolean, allow401?: boolean }} c */
async function checkJson(c) {
  try {
    const { res, body } = await getJson(c.url);
    if (res.status === 401 && c.allow401) {
      pass(`${c.name} — skipped (401; set SERVICE_API_KEY to assert body)`);
      return;
    }
    if (!res.ok) {
      fail(c.name, `HTTP ${res.status}`);
      return;
    }
    if (!c.test(body)) {
      fail(c.name, "JSON assertion failed");
      return;
    }
    pass(c.name);
  } catch (e) {
    fail(c.name, e instanceof Error ? e.message : String(e));
  }
}

async function main() {
  console.log(`Sanity check BACKEND=${BACKEND} FRONTEND=${FRONTEND}`);
  if (!TOKEN) {
    console.log("(no SERVICE_API_KEY — expecting dev/open API or checks may fail in production)\n");
  }

  await checkJson({
    name: "Backend GET /health",
    url: `${BACKEND}/health`,
    test: (j) => j?.status === "ok",
  });

  await checkJson({
    name: "Backend GET /api/debug/ready",
    url: `${BACKEND}/api/debug/ready`,
    test: (j) => j?.checks && typeof j.checks.database === "boolean",
    allow401: true,
  });

  await checkJson({
    name: "Backend GET /api/tests",
    url: `${BACKEND}/api/tests`,
    test: (j) => Array.isArray(j),
    allow401: true,
  });

  await checkJson({
    name: "Backend GET /api/settings/labs",
    url: `${BACKEND}/api/settings/labs`,
    test: (j) => Array.isArray(j),
    allow401: true,
  });

  await checkJson({
    name: "Backend GET /api/reviews (pending)",
    url: `${BACKEND}/api/reviews?status=PENDING_REVIEW`,
    test: (j) => Array.isArray(j),
    allow401: true,
  });

  await checkJson({
    name: "Backend GET /api/emails",
    url: `${BACKEND}/api/emails`,
    test: (j) => Array.isArray(j),
    allow401: true,
  });

  await checkJson({
    name: "Frontend proxy GET /api/backend/tests",
    url: `${FRONTEND}/api/backend/tests`,
    test: (j) => Array.isArray(j),
    allow401: true,
  });

  const pages = [
    { path: "/", includes: ["IPM", "Traceability"] },
    { path: "/tests", includes: ["Tests", "Lots"] },
    { path: "/settings", includes: "Settings" },
    { path: "/email-logs", includes: "Email Logs" },
    { path: "/tracked-emails", includes: "Tracked Inbox" },
    { path: "/reviews", includes: "Review" },
    { path: "/ai-logs", includes: "AI Logs" },
    { path: "/mapping", includes: "Mapping" },
  ];

  for (const p of pages) {
    await checkHttp({
      name: `Frontend GET ${p.path}`,
      url: `${FRONTEND}${p.path}`,
      htmlIncludes: p.includes,
    });
  }

  console.log("");
  if (failures.length > 0) {
    console.error(`Sanity check finished with ${failures.length} failure(s).`);
    process.exitCode = 1;
    return;
  }
  console.log("All sanity checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
