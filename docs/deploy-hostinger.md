# Deployment — plan

> **Superseded for production by [deploy-mac-mini.md](deploy-mac-mini.md).** The
> Mac Mini already runs 24/7, already holds the database, and `sumanexport.in` is
> already on Cloudflare — so a tunnel from the Mini is cheaper, keeps compliance
> data on hardware we own, and opens *zero* inbound ports. This document is kept
> for the Hostinger analysis in §2 (PostgreSQL is VPS-only) and because the app
> hardening in §4 applies to any host.

Status: the app side is done and pushed. The VPS side is written but unused.

---

## 0. Status

The blockers that used to sit here are **done**. What shipped:

| Was | Now |
|---|---|
| No authentication, 39 open mutating endpoints | Email one-time-code login; every route default-deny |
| No Prisma migrations (`db push` only) | Baseline migration; production uses `migrate deploy` |
| `backend/dist` tracked in git and stale | Untracked; built on the server |
| Uploads pinned to `process.cwd()` | `UPLOADS_DIR`, set outside the checkout |
| No deploy process | Merge to main → CI → SSH deploy → health check |

Still open, and listed honestly in §7: choosing the VPS, the domain, and whether
Postgres lives on the box or on Supabase.

---

## 1. What actually has to run

Not a website. Four long-lived pieces:

| Piece | What it is | Needs |
|---|---|---|
| API | Express + Prisma, `src/index.ts` | Node, always-on, port 4000 |
| Worker | BullMQ, `src/worker.ts` — polls Gmail every 30s | Node, always-on, **Redis** |
| Frontend | Next.js 14 | Node, always-on, port 3000 |
| Database | PostgreSQL | 18 MB today |

Plus **21 MB / 159 files** of lab-report PDFs in `backend/uploads`, served from
local disk via `express.static`. That needs a persistent volume and a backup —
they are the evidence behind compliance decisions.

The worker is a **separate process**. `index.ts` does not start it. Anything
that can only run one process will silently give you an app where Gmail ingest
never happens.

---

## 2. Which Hostinger product

**A VPS. Not the managed Node.js hosting.**

Hostinger offers managed Node.js on Business/Cloud web hosting (deploy from a
GitHub repo), and VPS with full root. The managed option is built for a single
web process; the docs do not commit to background workers, Redis, or persistent
process counts. This app needs two always-on Node processes plus Redis plus
Postgres, so managed hosting is the wrong shape and you would discover that
after the migration, not before.

**Recommended plan: KVM 2** — 2 vCPU, 8 GB RAM, 100 GB NVMe, around $8.99/mo on
a long cycle. KVM 1 (1 vCPU / 4 GB) will run the app fine but `next build` is
memory-hungry and will be unpleasant on one core; the $4/mo saving is not worth
it. Data volume is trivial either way — storage is not the constraint.

OS: **Ubuntu 24.04 LTS**. Runtime: **Node 22 LTS**, not 24 — Prisma 5.22 is
tested against 18/20/22, and the deploy is not the place to find out about 24.

---

## 3. Architecture

**Recommended: everything on the one VPS, behind a single Nginx origin.**

```
                    ┌─────────────────── Hostinger VPS ──────────────────┐
                    │                                                    │
  ipm.yourdomain ──▶│  Nginx  ── /      ──▶ Next.js  :3000   (PM2)       │
     (Certbot TLS)  │         └─ /api   ──▶ Express  :4000   (PM2)       │
                    │                                                    │
                    │            Worker (PM2) ──▶ Redis :6379            │
                    │            Postgres :5432   (localhost only)       │
                    │            /var/ipm/uploads  (persistent)          │
                    └────────────────────────────────────────────────────┘
```

Why one box rather than the Vercel + Hostinger + Supabase split your git history
started (`Document FRONTEND_URL for Vercel production CORS`, `Add Supabase
client helper`, `Gmail: support credentials via env vars for Hostinger deploy`):

- **Same origin deletes an entire bug class.** No CORS, no mixed content, no
  `NEXT_PUBLIC_BACKEND_URL` to keep in sync. We hit exactly this during the
  Cloudflare tunnel — the frontend could not reach the backend until both were
  tunnelled and the env var repointed. That problem disappears here.
- This is internal business tooling for one company. A global CDN buys nothing.
- One set of secrets, one place to back up, one thing to debug.
- The split is already half-abandoned — `backend/db.js` is deleted in the working
  tree and `.env` points back at local Postgres.

Postgres and Redis via the existing `docker-compose.yml` (change the password —
it is currently `admin`/`password`), or installed natively. Docker matches dev
and is the lower-risk choice.

**Alternative worth considering:** managed Postgres (Supabase) instead of
Postgres on the VPS. It costs more but you get point-in-time recovery without
building it. For 18 MB of data that is decidable either way; the VPS is fine if
§6 backups actually get set up.

---

## 4. What was done

### 4.1 Authentication — email one-time code

Modelled on the Phyto Trade dashboard, so it behaves the way the team already
expects. A person enters their work email, receives a 6-digit code, and is signed
in for 30 days.

- **Allowlist, not registration.** `AUTH_ALLOWED_EMAILS` decides who may sign in.
  Removing an address revokes it on the *next request*, not whenever a session
  happens to expire.
- **Code**: 6 digits from a CSPRNG, stored only as a scrypt hash, valid 10
  minutes, single-use, 60-second resend gap, dead after 5 wrong guesses. The
  attempt ceiling is what makes six digits defensible — without it a million
  guesses wins.
- **Session**: 256-bit random token in an httpOnly SameSite=Lax cookie; only its
  SHA-256 is stored, so a database leak yields nothing replayable.
- **Enumeration-safe**: `request-code` answers identically for allowed and
  unknown addresses. Anything else turns the endpoint into a staff directory.
- **Notification**: every sign-in emails `AUTH_NOTIFY_EMAIL` with time, IP and
  device.
- **First-run escape hatch**: if Gmail is unreachable the code is written to the
  server log, so a mail misconfiguration cannot lock everyone out permanently.

Enforcement is **default-deny** (`backend/src/middleware/requireAuth.ts`): every
route is protected unless explicitly listed as public. A route added tomorrow is
protected without anyone remembering to do it. `/uploads` is behind the gate too
— lab reports are evidence, not public files.

The Next.js middleware that redirects to `/login` is **UX only**; it runs at the
edge with no database and can only see that a cookie exists. Express does the
real check.

Still worth doing later: per-user roles (Ops / QC / Admin per the PRD). The
allowlist is one trust level for everyone.

### 4.2 Prisma migrations

Baselined. `prisma/migrations/00000000000000_baseline/` describes all 26 tables
and is marked applied against the existing database. Production runs
`prisma migrate deploy` only; `db push` is never used there. CI fails the build
if `schema.prisma` drifts from the migrations.

### 4.3 `backend/dist` untracked

Removed from git and added to `.gitignore`. It was stale — it did not contain the
compliance-engine or MRL-lookup changes, so a deploy from it would have shipped
code that did not match `src`. It is now built on the server from the exact
checkout being deployed.

### 4.4 Secrets

`backend/.env` holds a live OpenAI key and is correctly gitignored — keep it
that way. On the server, `.env` should be `chmod 600` and owned by the app user.
Rotate the OpenAI key as part of go-live, since it has been sitting in a local
file on a laptop.

Gmail already supports `GMAIL_CREDENTIALS_JSON` / `GMAIL_TOKEN_JSON` env vars
(commit `964e671`), so no JSON files need to be copied up. Note the OAuth refresh
token is long-lived but not eternal — when Gmail ingest silently stops, this is
the first thing to check.

---

## 5. Deploy steps

Assumes §4 is done.

**1. Provision** — KVM 2, Ubuntu 24.04, add your SSH key. Then harden: disable
password login and root SSH, enable `ufw` allowing only 22/80/443. Postgres and
Redis must **not** be exposed — bind them to `127.0.0.1`.

**2. Base software**

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs nginx certbot python3-certbot-nginx git
sudo npm install -g pm2
```

**3. Postgres + Redis** — `docker compose up -d` with a real password, or native
packages. Create the `ipm_lots` database and an app role that is not superuser.

**4. Move the data.** From your Mac:

```bash
pg_dump "postgresql://jitenagarwal@localhost:5432/ipm_lots" -Fc -f ipm.dump
scp ipm.dump ipm-uploads.tar.gz user@vps:/tmp/
```

then `pg_restore` on the server and unpack uploads to `/var/ipm/uploads`.
Point `uploadsPath` there (currently `process.cwd()/uploads` — make it an env
var, otherwise a deploy that changes the working directory loses the files).

**5. Build and start**

```bash
git clone <repo> /var/www/ipm && cd /var/www/ipm
(cd backend  && npm ci && npx prisma migrate deploy && npx prisma generate && npm run build)
(cd frontend && npm ci && npm run build)
pm2 start backend/dist/index.js  --name ipm-api
pm2 start backend/dist/worker.js --name ipm-worker
pm2 start npm --name ipm-web -- --prefix frontend start
pm2 save && pm2 startup
```

`NODE_ENV=production` matters: CORS reflects any origin when it is unset
(`index.ts:38`), which is fine in dev and wrong on the internet.

**6. Nginx + TLS** — reverse proxy `/` → 3000 and `/api` → 4000 on one
server block, then `certbot --nginx`. Raise `client_max_body_size` to ~25 MB;
lab report PDFs are the largest thing that moves through it.

**7. Verify** — not just "the page loads":

- `curl https://host/api/limits/resolve?molecule=chlorpyrifos&product=Coriander%20Seed%20Whole&standard=UK`
  returns 0.01 mg/kg / AT_LOD / Commission Regulation 1085/2020
- MRL Lookup returns 5,811 UK rows across 9 products
- A review page computes country compliance
- The worker log shows Gmail polling
- **An unauthenticated request is refused** — the whole point of §4.1

---

## 5b. Continuous deployment

Merge to `main` → deploy. Three pieces:

| File | Does |
|---|---|
| `.github/workflows/ci.yml` | On every PR: typecheck, tests, build, and a **schema-vs-migrations drift check** for both apps |
| `.github/workflows/deploy.yml` | On merge to `main`: SSH to the VPS, run `deploy.sh`, then poll `/health` |
| `deploy.sh` | On the server: back up the DB, fetch, `migrate deploy`, build, `pm2 reload` |
| `ecosystem.config.js` | The three PM2 processes — api, **worker**, web |

**Repository secrets** (Settings → Secrets → Actions):

| Secret | Notes |
|---|---|
| `SSH_HOST` | VPS address |
| `SSH_USER` | A deploy user, **not root** |
| `SSH_PRIVATE_KEY` | Its public half goes in the VPS `authorized_keys` |
| `SSH_PORT` | Optional, defaults to 22 |
| `DEPLOY_PATH` | Optional, defaults to `/var/www/ipm` |
| `HEALTH_URL` | Optional, e.g. `https://ipm.example.com/health` |

Also set **main as a protected branch with CI as a required check** — the deploy
workflow trusts that gate rather than re-running the tests.

Three deliberate choices:

- **The build happens on the server**, from the checkout being deployed. Building
  in CI and shipping an artefact reintroduces exactly the `dist`-drift problem
  §4.3 removed.
- **`deploy.sh` takes a `pg_dump` before migrating.** A migration that goes wrong
  is only recoverable if that ran, and "we'll add backups later" is how it never
  runs.
- **Rollback is not automatic.** `deploy.sh` prints the one-line command, but
  reverting code while a new schema is live is a decision a person should make.
  `concurrency: cancel-in-progress: false` likewise means an in-flight deploy is
  never killed half-way through a migration.

**Untested until the VPS exists.** The YAML is valid and `deploy.sh` passes
`bash -n`, but no run has touched a real server.

---

## 5c. Deploying today, on the raw IP

Hostinger confirms PostgreSQL is **VPS-only** — Shared and Cloud plans are
MySQL-only, and this app is Postgres-bound (provider, Postgres-dialect
migrations, and `mode: 'insensitive'` in four queries, which MySQL rejects). So
the VPS is not a preference here, it is the requirement.

On the server, once:

```bash
sudo bash deploy/provision-vps.sh
```

Installs Node 22, PostgreSQL, Redis, Nginx, PM2; creates the app user,
`/var/ipm/{uploads,backups}`, a database role with a generated password, and a
firewall that allows only SSH and web. Postgres and Redis stay bound to
localhost. The script prints the `DATABASE_URL` once — capture it.

Then follow the steps it prints: clone, write `backend/.env`, `./deploy.sh`,
`pm2 start ecosystem.config.js`.

### The one trap with no TLS

`NODE_ENV=production` marks the session cookie `Secure`, and a browser silently
discards a Secure cookie over plain `http://`. The symptom is nasty: the code is
accepted, the server sets a cookie the browser throws away, and the user lands
back on `/login` with no error in any log.

For IP-only UAT, set **`COOKIE_SECURE=false`** in `backend/.env`. The API logs a
warning on every boot while it is set, so it cannot quietly become permanent.
Remove it the moment `certbot` has run.

Until then the session cookie travels in clear text — acceptable on a trusted
network for UAT, not acceptable once real people use it from outside.

### Moving the existing data

```bash
# on the laptop
pg_dump "postgresql://jitenagarwal@localhost:5432/ipm_lots" -Fc -f ipm.dump
tar czf uploads.tar.gz -C backend uploads
scp ipm.dump uploads.tar.gz ipm@<VPS_IP>:/tmp/

# on the VPS
pg_restore -d "$DATABASE_URL" --no-owner --clean --if-exists /tmp/ipm.dump
tar xzf /tmp/uploads.tar.gz -C /var/ipm --strip-components=1
```

Then confirm the restore actually landed — 5,937 compliance limits and 649
molecules — before trusting it.

---

## 6. Once it is live

**Backups.** Nightly `pg_dump -Fc` plus an uploads rsync, off the VPS. Untested
backups do not count — restore one into a scratch database and check the row
count is 5,811 before you rely on it.

**MRL re-imports.** The register changes. `npm run import:gb-mrls` (dry run
first) is the path; two of the current files are Feb 2025 exports and already
eight months behind the rest.

**Monitoring.** `pm2 monit` is not monitoring. An uptime check on `/health` and
an alert when the worker restart count climbs is the minimum.

**Deploys.** `git pull && npm ci && prisma migrate deploy && npm run build &&
pm2 reload all`. Worth a `deploy.sh` so it is never done by hand.

---

## 7. Decisions needed

1. **Auth approach** — Cloudflare Access, or Nginx basic auth + API key?
   Determines whether the domain moves to Cloudflare.
2. **Frontend on the VPS or Vercel?** Recommending the VPS above; Vercel is
   defensible if you want preview deploys.
3. **Postgres on the VPS or Supabase?** VPS is fine and cheaper if backups get
   set up; Supabase buys point-in-time recovery.
4. **Domain** — what hostname, and is it already with Hostinger?
5. **Who else needs access?** Changes auth from "a shared secret" to "accounts".

---

## Sources

- [Node.js hosting options at Hostinger](https://www.hostinger.com/support/node-js-hosting-options-at-hostinger/)
- [How to deploy a Node.js application — Hostinger](https://www.hostinger.com/tutorials/deploy-node-js-application)
- [Hostinger VPS pricing 2026](https://smarthostfinder.com/hostinger-vps-pricing/)
