# How this runs: deployment, alerts, and working from another machine

Status: the monitoring dashboard and the shared tunnel are built. Deployment
automation is specified but not yet made.

**Live now**
| | |
|---|---|
| IPM dashboard | `https://f2vxka-xhb8.indianspiceexporter.com` |
| Status dashboard (Uptime Kuma) | `https://ops-smd7vyqx5u.indianspiceexporter.com` |

Both served by **one** cloudflared process from one config, which is the pattern
every further app should follow — a tunnel per app is what produced five of them,
most unused.

---

## 0. The shape of it

```
   your laptop                GitHub                    Mac Mini (office)
   ───────────                ──────                    ─────────────────
   git push ──────────────▶ CI on GitHub runners
                            (typecheck, test, build,
                             migration-drift check)
                                   │ pass
                            PR ──▶ merge to main
                                   │
                                   ▼
                            deploy job queued
                                   │
                                   │  ┌── the runner polls OUT to GitHub.
                                   └─▶│   Nothing connects IN to the Mini.
                                      └── self-hosted runner (LaunchDaemon)
                                                 │
                                                 ▼
                                          ./deploy.sh
                                          backup → migrate → build → restart
                                                 │
                        Cloudflare ◀── tunnel ───┘
                             ▲
                             │ watches from outside
                      Uptime Kuma (Hostinger VPS)
```

Two rules the whole design follows:

1. **Nothing connects inbound to the Mini.** Not GitHub, not you, not the
   monitor. Everything the Mini does is outbound. That is why there is no port
   to scan and no firewall rule to get wrong.
2. **The thing that watches must not live on the thing being watched.** A
   monitor on the Mini cannot report that the Mini is off — which, with
   FileVault on, is the most likely outage.

---

## 1. Deployment — what happens when you push

### Today

`deploy.yml` SSHes into a server. **That cannot work here**: the Mini has no
inbound ports, which is the entire point of the tunnel. The workflow is a
leftover from the VPS plan and has never run.

### The fix: a self-hosted runner

A small GitHub agent on the Mini that **polls outward** for jobs. Standard,
supported, and needs no inbound access. It runs as a LaunchDaemon, so it
survives reboots like everything else.

```
runs-on: self-hosted        # instead of ubuntu-latest
```

### The flow, end to end

| Step | Where | What happens |
|---|---|---|
| `git push` on a branch | GitHub cloud | CI: typecheck, tests, build, **schema-vs-migrations drift** — both apps |
| Open a PR | GitHub | Checks must be green to merge |
| Merge to `main` | GitHub | Deploy job queued |
| Deploy runs | **On the Mini** | `deploy.sh`: pg_dump → `prisma migrate deploy` → build → restart daemons |
| Health check | GitHub | Polls the public URL; fails loudly if it does not return 200 |

**If the Mini is off or at the FileVault screen when you merge, the job simply
queues** until the runner comes back, then deploys. Nothing is lost. That is a
real advantage of pull-based deployment over SSH.

### Three things this needs

**Branch protection on `main`** — require CI to pass. The deploy job trusts that
gate rather than re-running the tests; without protection, a broken merge
deploys itself.

**A narrow sudoers rule.** Restarting system daemons needs root, but the runner
must not have general sudo. One file, one line:

```
# /etc/sudoers.d/ipm-deploy
jitenagarwal ALL=(root) NOPASSWD: /bin/launchctl kickstart -k system/com.sumanexport.*
```

That is the whole privilege the deploy has. It cannot install packages, read
other users' files, or change settings.

**The build-time environment gotcha.** Next bakes rewrite destinations at build
time, so `BACKEND_URL` must be set for `next build`, not for `next start`.
`deploy.sh` reads the port from `backend/.env` and
`scripts/verify-rewrites.mjs` fails the build if it did not stick. This has
already caused one silent outage; the check exists so it cannot cause another.

### Rolling back

```bash
./deploy.sh <previous-sha>
```

Deliberately manual. Reverting code while a new schema is live is a judgement
call — `prisma migrate deploy` does not un-apply. `deploy.sh` prints the exact
command after every deploy and takes a `pg_dump` before every migration.

---

## 2. Alerts — what you get, and when

Three independent sources, because each can see things the others cannot.

| What goes wrong | Who tells you | How fast |
|---|---|---|
| Tests or build fail on a PR | GitHub | ~2 min, email + PR check |
| Deploy fails | GitHub Actions | immediately, email |
| Deploy succeeded but the site does not answer | GitHub Actions health check | ~1 min |
| API, web, worker, tunnel, Postgres or Redis stops | **Local watchdog** | ≤ 60 s, email |
| …and when it comes back | Local watchdog | ≤ 60 s, email |
| The Mini rebooted and everything restarted | Local watchdog | ≤ 60 s, email |
| The Mini rebooted and something did **not** | Local watchdog | ≤ 60 s, email |
| **The Mini is off, stuck at FileVault, or the internet is down** | **Uptime Kuma on the VPS** | ~2–3 min, email |
| Someone signs in to the dashboard | The app | immediate, email |

### Why two monitors

The local watchdog runs every 60 seconds and checks each service plus the public
URL. It knows *which piece* broke, which is what you need to fix it.

But it dies with the machine. With FileVault on, an unexpected restart leaves the
Mini at the unlock screen with nothing running — and the watchdog is one of the
things not running. **Uptime Kuma on the Hostinger VPS** covers exactly that
blind spot: it watches the public URL from outside and emails when it stops
answering, whatever the reason.

Local watchdog answers *what broke*. External monitor answers *is it there at
all*. You need both, and neither substitutes.

### No alert fatigue

The watchdog emails **only on a change of state** — went down, came back,
rebooted. A monitor that mails every minute during an outage gets filtered within
a day, and then it is not a monitor.

### Uptime Kuma — installed

`~/ipm-ops/uptime-kuma`, port 3001, its own hostname on the shared tunnel, and a
LaunchDaemon so it starts at boot with everything else.

One page showing every app — IPM, phyto, stock management — up or down, response
time and history. Add a monitor per app; HTTP checks against each public URL are
enough to start.

**It is on the Mini, which is the compromise to understand.** It can watch every
app and tell you which one died. It cannot tell you the Mini itself is off or
stuck at the FileVault unlock screen, because it is not running either. Two ways
to close that gap, and one of them is needed:

- Put a second Uptime Kuma on the Hostinger VPS watching the public URLs, or
- Set `HEARTBEAT_URL` in `~/ipm-production/backend/.env` to a healthchecks.io
  check. The watchdog already pings it on every all-clear; when the pings stop,
  they email you.

---

## 3. Development from another machine

### The separation that already exists

| | Development | Production |
|---|---|---|
| Machine | your laptop | Mac Mini |
| Folder | wherever you clone | `~/ipm-production` |
| Database | your own local Postgres | `ipm_lots_prod` on the Mini |
| Ports | 3000 / 4000 | 3100 / 4100 |
| Started by | `npm run dev` | launchd, at boot |

Ports differ deliberately: `npm run dev` on the Mini itself still cannot collide
with production.

### First-time setup on a new machine

```bash
git clone git@github.com:jitenagarwal19/ipm_lots.git
cd ipm_lots
(cd backend  && npm ci && cp .env.example .env)   # then fill it in
(cd frontend && npm ci)
createdb ipm_lots
(cd backend && npx prisma migrate deploy && npx prisma generate)
```

Two rules for `.env`:

- `DATABASE_URL` points at **your** Postgres. Never at `ipm_lots_prod`.
- Leave Gmail unset. Sign-in codes are written to the server log instead of
  emailed, so you can log in without touching the real mailbox — which also
  means you cannot accidentally send mail to staff while testing.

### Getting real data to work against

The register and lab reports make the app meaningful. Copy production down:

```bash
# from the Mini, or over Tailscale
pg_dump "$PROD_URL" -Fc -f prod.dump
pg_restore -d ipm_lots --clean --if-exists --no-owner prod.dump
```

One-way only. There is never a reason to push a development database up.

### Day-to-day

```bash
git checkout -b some-change
# work; npm run dev on 3000/4000
(cd backend && npm test && npx tsc --noEmit)
git push -u origin some-change
gh pr create
# CI runs → review → merge → deploys itself
```

**Schema changes** are the one thing to get right:

```bash
cd backend
npx prisma migrate dev --name what_changed    # creates the migration file
```

Commit the generated file. CI fails if `schema.prisma` drifts from
`prisma/migrations`, because that mistake otherwise surfaces on the server where
it is expensive. Production only ever runs `migrate deploy`; `db push` is never
used there.

### If you need the production database directly

Tailscale plus an SSH tunnel, so Postgres stays bound to localhost and never
listens on a network interface. Every GUI tool supports this natively.

Before that is used by anyone: `pg_hba.conf` is currently `trust`, meaning **any
local connection is accepted with no password**. Safe only while nothing but
localhost can reach it. It must become `scram-sha-256` with a real password, and
a read-only role is worth creating for query work.

---

## 4. Order of work

1. **Install the IPM daemons** — production is down until this runs, and every
   reboot repeats it. `sudo bash deploy/install-daemons.sh`
2. **Uptime Kuma on the VPS** — the only thing that can tell you the Mini is
   gone. Also the multi-app dashboard.
3. **Self-hosted runner + rewrite `deploy.yml`** — merge-to-deploy. Until then,
   deployment is `./deploy.sh` by hand.
4. **Protect `main`** — require CI. Cheap, and step 3 depends on it.
5. **Fix `pg_hba` `trust`** — before any remote database access.
6. **Consolidate the tunnels** — one tunnel, one hostname per app, retire the
   quick tunnel that keeps changing phyto's URL.
7. **Service accounts** — last, once the pattern is settled.

Steps 1 and 2 are the ones that stop outages going unnoticed. The rest is
convenience.
