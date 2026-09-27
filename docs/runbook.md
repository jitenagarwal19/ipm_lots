# IPM production — how to get at it

Everything runs on the Mac Mini. Cloudflare only relays; it holds no code and no
data.

---

## The app

| From | Where |
|---|---|
| Anywhere | `https://f2vxka-xhb8.indianspiceexporter.com` |
| On the Mini | `http://localhost:3100` |

Sign in with a work email; a 6-digit code arrives by mail. Allowed today:

```
spices@sumanexport.in   connect@sumanexport.in
export@sumanexport.in   operations@sumanexport.in
```

Change that list in `~/ipm-production/backend/.env` (`AUTH_ALLOWED_EMAILS`), then
restart the API. Removing an address takes effect on the next request, not when
the session expires.

**If no code arrives**, it is written to the log instead so you cannot be locked
out:

```bash
grep AUTH ~/ipm-production/logs/ipm-api.log | tail -5
```

## Status of everything

`https://ops-smd7vyqx5u.indianspiceexporter.com` — every app, up or down,
response time, history.

---

## The files

```bash
open ~/ipm-production          # Finder
cd ~/ipm-production            # Terminal
```

Two checkouts, and the difference matters:

| | Path | |
|---|---|---|
| **Production** | `~/ipm-production` | what actually serves — don't edit here |
| Development | `~/Documents/In-house tooling/IPM Lots` | where you work |

Production runs the **compiled** output (`backend/dist`, `frontend/.next`), so
editing a `.ts` file there changes nothing until a rebuild. Use `deploy.sh`.

---

## The database

`psql` is keg-only, so it is not on PATH:

```bash
/opt/homebrew/Cellar/postgresql@16/*/bin/psql ipm_lots_prod
```

Worth an alias in `~/.zshrc`:

```bash
alias pg='/opt/homebrew/Cellar/postgresql@16/16.10_1/bin/psql'
```

Then `pg ipm_lots_prod`. **`ipm_lots` (no suffix) is the development database** —
check which one you are in before writing anything.

A GUI tool (TablePlus, DBeaver) connects to `localhost:5432`, database
`ipm_lots_prod`, user `jitenagarwal`, no password — see the warning below.

```sql
-- sanity check you are in the right place
select count(*) from "ComplianceLimit";   -- 5937 in production
```

---

## Logs

```bash
tail -f ~/ipm-production/logs/*.log        # everything
tail -f ~/ipm-production/logs/ipm-api.log  # just the API
tail -f ~/ipm-production/logs/watchdog.log # what the monitor sees
```

---

## Services

Once installed as daemons:

```bash
sudo launchctl list | grep sumanexport                       # what is loaded
sudo launchctl kickstart -k system/com.sumanexport.ipm-api   # restart one
```

The six: `ipm-api`, `ipm-worker`, `ipm-web`, `ipm-tunnel`, `ipm-watchdog`,
`ipm-ops-kuma`.

---

## Deploying a change

```bash
cd ~/ipm-production && ./deploy.sh origin/main
```

Backs up the database, pulls, migrates, rebuilds, restarts. Prints the rollback
command when it finishes.

---

## Remotely

Today: the two URLs above. Anything more — reading logs, restarting a service —
needs a shell, which is not set up yet. The plan is SSH through the existing
tunnel behind Cloudflare Access, including a browser terminal that works from a
phone. See `operations-plan.md`.

**Nothing can unlock FileVault remotely.** That happens before macOS boots, so
after a power cut the Mini needs someone physically present.

---

## Two things to know before touching anything

**PostgreSQL has no password.** `pg_hba.conf` is set to `trust`, so any process
on this Mac connects to any database as any user. Safe only because it listens on
localhost alone. It means a command typed in the wrong terminal can write to
production with nothing in the way — check `current_database()` first, and fix
this before any remote access is enabled.

**Nothing is backed up off this machine.** `deploy.sh` snapshots the database
before each migration, but those land in `~/ipm-data/backups` on the same disk.
The 159 lab-report PDFs in `~/ipm-data/uploads` have no copy at all.
