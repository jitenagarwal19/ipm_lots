# Serving the dashboard from the Mac Mini

The Mini runs 24/7, already holds the database, and `sumanexport.in` is already
on Cloudflare. That makes it a better production host than a VPS for this app —
not a compromise.

```
                  https://f2vxka-xhb8.sumanexport.in
  Internet ─────────────────▶ Cloudflare edge
                               │  · real TLS, renewed automatically
                               │  · Access policy checks the email FIRST
                               ▼
                        outbound-only tunnel
                     ┌──────────────────────────┐
                     │  no inbound ports open   │
                     └──────────────────────────┘
                               ▼
                  cloudflared (launchd, KeepAlive)
                               │
          /api /uploads /health ┴ everything else
                   │                    │
           Express :4000          Next.js :3000     ← pm2
                   │                                  (+ Gmail worker)
     PostgreSQL :5432 · Redis :6379   ← localhost only
```

## Why this beats the VPS

| | Mac Mini + tunnel | Hostinger VPS |
|---|---|---|
| Inbound ports | **none** | 22/80/443 public, scanned constantly |
| Cost | £0 | ~$9/mo |
| Where the compliance data lives | hardware you own | someone else's |
| TLS | Cloudflare, automatic | certbot, yours to renew |
| Public IP tied to the office | no | n/a |

The security argument is the strong one. A VPS has a public IP with listening
services. The tunnel dials *out* — there is no port to scan and no firewall rule
to get wrong.

## Why not Docker

Docker Desktop on macOS needs a logged-in GUI session. After a reboot — a macOS
update, a power cut — nothing starts until someone physically logs in. That is
disqualifying for a 24/7 server. Colima runs headless but adds a Linux VM with
slower disk I/O, wrapping a PostgreSQL that already runs natively and already
holds the data. Native processes under launchd and pm2 are simpler and more
reliable here.

## Layers of protection

Four, and they are independent:

1. **Obscure hostname.** `f2vxka-xhb8` is ~2^50 — not findable by guessing.
   Cloudflare's `*.sumanexport.in` wildcard certificate covers it, so unlike a
   normal subdomain it does **not** appear in Certificate Transparency logs.
   This is obscurity, not security; it just removes drive-by traffic.
2. **Cloudflare Access.** An allowlisted email must authenticate at the edge
   before a single byte reaches the Mini.
3. **The app's own email one-time-code login**, with default-deny on every route.
4. **PostgreSQL and Redis bound to localhost**, never named in the tunnel's
   ingress rules.

Because Cloudflare terminates real TLS, `COOKIE_SECURE` stays **true** — none of
the plain-HTTP compromise the raw-IP plan needed.

## Files

| File | Purpose |
|---|---|
| `deploy/setup-mac-server.sh` | Idempotent check/fix for power, services, exposure, directories. Run without flags first — it changes nothing and tells you what it would do |
| `deploy/cloudflared-ipm.yml` | Tunnel ingress. Path-splits `/api` to Express and everything else to Next **on one hostname**, so the browser sees one origin and CORS never engages |
| `deploy/com.sumanexport.ipm-tunnel.plist` | launchd agent keeping the tunnel up |
| `ecosystem.config.js` | The three pm2 processes — api, **worker**, web |

## Setup

```bash
bash deploy/setup-mac-server.sh            # check
bash deploy/setup-mac-server.sh --apply    # fix what it found
```

Then the manual steps it prints: create the tunnel, route DNS, install the
config, load the launchd agent, add the Access policy, build and start.

## The reliability gaps that matter

Found on the current machine, both real:

- **`autorestart` is off.** After a power cut the Mini stays down until someone
  presses the button. `sudo pmset -a autorestart 1`.
- **Auto-login is not enabled**, and PostgreSQL, pm2 and the tunnel are all
  *LaunchAgents* — they start at login, not at boot. After an unattended reboot
  nothing comes back. Either enable auto-login (and keep the Mini physically
  secure, since anyone with access then gets a desktop) or move the services to
  LaunchDaemons.

Also: **Redis is not running.** The Gmail worker polls through it, so without it
email ingest silently never happens while the app looks perfectly healthy.

## Deploys

Manual for now:

```bash
git pull && ./deploy.sh origin/main
```

`deploy.sh` backs up the database, migrates, builds, and `pm2 reload`s.

Auto-deploy on merge would need a **GitHub self-hosted runner** on the Mini —
the runner connects outbound to GitHub, so it works without inbound ports. The
existing `.github/workflows/deploy.yml` SSHes to a host and will not work here;
switching it to `runs-on: self-hosted` is the change when you want it.

## What this setup does not solve

- **Your office internet and power are now the uptime.** Cloudflare stays up;
  the Mini is the single point of failure.
- **Backups are still yours.** `deploy.sh` snapshots before each migration, but
  those live on the same disk. Get them off the machine.
- **Dev and production share a box.** A `npm run dev` that grabs port 3000 or a
  stray migration against `ipm_lots` hits production directly.
- **macOS updates reboot the machine.** Combined with the auto-login gap above,
  that is the most likely cause of an unexplained outage.
