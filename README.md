# BRT Bus Station

Bus ticketing proof of concept for Cavite bus lines: passengers see the buses waiting at each shelter on a live map and buy a ticket on one, konduktors dispatch their own bus and scan tickets, admins monitor everything. See [ARCHITECTURE.md](ARCHITECTURE.md), [AGENTS.md](AGENTS.md), [plan/](plan/) and the [demo script](plan/demo-script.md).

## Run locally

```bash
bun install
cp .env.example .env          # set DATABASE_URL to a Postgres you can log in to
docker compose up -d          # optional: Postgres from docker-compose.yml
bun run db:create && bun run db:migrate && bun run db:seed
bun run routes:build          # once: fetch the real road between the shelters (needs internet)
bun run dev                   # http://localhost:3000
bun run workers               # second terminal: bus simulator + ticket expiry (or run them separately:
                              #   bun run worker:simulator   bun run worker:expire)
bun run smoke                 # is the running system fit to demo? (signs in as each role, reads, changes nothing)
bun run check                 # typecheck + lint + test
```

Demo logins (password `Demo1234!`): `admin@brt.test`, `konduktor1@brt.test` to `konduktor3@brt.test`, `passenger1@brt.test`, `passenger2@brt.test`.
Restart `bun run dev` and `bun run workers` after changing `.env` or server code.

## What to set in `.env`

| Setting | What it does |
|---|---|
| `DATABASE_URL` | The PostgreSQL database. Tests use a separate `<name>_test` database they create themselves. |
| `PAYMENT_PROVIDER` | `mock` (default, offline demo gateway) or `pisopay` (QR Ph, see [plan/pisopay-setup.md](plan/pisopay-setup.md)). With `pisopay` also set `PISOPAY_API_USERNAME`, `PISOPAY_API_PASSWORD` and an `APP_BASE_URL` PisoPay can reach. |
| `MAIL_PROVIDER` | `console` (default: nothing is sent, the app notes it would have) or `smtp` (with `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`): paid tickets are emailed to their owner. |
| `ROUTING_PROVIDER` | `osrm` (default: buses follow real roads) or `none` (straight lines). `OSRM_BASE_URL` defaults to the public demo server, which is for development only. |
| `SIM_*` | Simulator speed, dwell time and number of automatic buses. |

Every variable is validated at start-up (`src/server/config/env.ts`); a missing required value stops the app with a clear message.

## The pieces

- **Passengers** tap a shelter on the map, pick a waiting bus, choose how many are riding, and pay (QR Ph). The ticket is for that bus: its QR is scanned once by that bus's konduktor at the shelter it was bought at, and admits the whole group.
- **Konduktors** announce where their waiting bus is headed and when it leaves, dispatch it, and scan tickets with the phone camera (or type the reference code).
- **Admins** monitor: live map, sales and scan dashboard, payments (including any that could not be applied), scan log, fleet, shelters and fares.
- **Money rules**: a ticket becomes paid only from a verified payment notice (webhook) or PisoPay's own answer to our status check; the amount must equal the fare; evidence (payments, scans) is never changed or deleted.

## Docs

[plan/demo-script.md](plan/demo-script.md) (a 15-minute walkthrough), [plan/demo-checklist.md](plan/demo-checklist.md) (before you present), [plan/pisopay-setup.md](plan/pisopay-setup.md), [plan/roadmap.md](plan/roadmap.md) (progress and change log), [plan/requirements.md](plan/requirements.md), [HANDOFF.md](HANDOFF.md).
