# BRT Bus Station — agent instructions

Working contract for Claude Code, Cursor and other coding agents. Read [ARCHITECTURE.md](ARCHITECTURE.md) before adding a feature.

## What this repository is

**BRT Bus Station**: a bus ticketing proof of concept for Cavite bus lines (Philippines). A passenger picks stations on a map, buys a ticket, gets a signed QR, watches simulated buses move live; a konduktor scans the QR; an admin manages stations, buses, konduktors and watches the map. Single **Next.js 16** process: React SPA in `src/client` + embedded **Hono** API in `src/server`. Same skeleton as TaxTrail ESP (`D:\PROJECTS\esp-system`).

Next.js 16 has breaking changes versus older versions. Check `node_modules/next/dist/docs/` before using Next APIs.

## Stack (do not substitute)

- Runtime: Bun 1.3+ for scripts/workers; Next.js 16 Node runtime for the app
- UI: React 19, React Router 7, TanStack Query, React Hook Form, Zod 4, Tailwind 4, shadcn/ui (`src/client/components/ui`), Leaflet + OpenStreetMap
- API: Hono + `@hono/zod-openapi` (use that package's `z` in route schemas)
- Data: PostgreSQL via `pg` with raw SQL (no ORM). No Redis / S3 in the POC.
- Live feed: Server-Sent Events (see ARCHITECTURE.md)
- Tests: Vitest beside the source

## Path aliases

| Alias | Resolves to |
|---|---|
| `@/*` | `src/client/*` |
| `@modules/*` `@core/*` `@lib/*` `@middleware/*` `@config/*` `@integrations/*` | `src/server/...` |
| `@shared/*` | `src/shared/*` |

Server code must not import `@/*`; client code must not import server aliases (enforced by ESLint).

## Adding a feature

1. Find the requirement ID (e.g. `TKT-04`) in `plan/requirements.md` and the task in `plan/roadmap.md`.
2. Persistence: edit `database/schema/<domain>/` **and** add `database/updates/NNN-name.sql`.
3. Server: repository → service → schema → controller; register the controller in `src/server/index.ts`.
4. Client: API function + query hook in `features/<domain>/`, page in `pages/`, route in `app/router.tsx`, menu in `app/config/nav.config.ts`.
5. Tests beside the source; run `bun run check`, then `bun run build`.
6. Update the task status in `plan/roadmap.md`.

## Non-negotiables

- **Konduktors dispatch their own bus; admins only monitor.** A konduktor's bus always comes from the session and the assignment, never from the request (GEN-05). Buses with no konduktor run the line by themselves.
- **A konduktor only ever receives their own bus** (list, waiting-buses list and live stream are filtered on the server, KON-07); never rely on hiding it in the UI.
- **Lock order is ticket, then payment**, in every code path that touches both (deadlock otherwise).
- **No capacity concept.** Never add seats, a passenger count per bus, "sold out", reservations or boarded/not-boarded lists (GEN-01). A ticket is not tied to a bus or direction. Station ticket **counts** (valid, sold today, by destination) are allowed as demand data; never a list of passengers.
- **A ticket becomes `paid` only from a verified webhook** (signature checked, idempotent on `(provider, event_id)`, amount equal to the ticket fare). Never from the client redirect or any browser call.
- **Ticket status changes use conditional SQL** (`UPDATE … WHERE id=$1 AND status='<expected>' RETURNING …`); a scan marks `used` atomically in the same transaction as its scan row.
- **QR tokens are signed** (HMAC) and verified before any database lookup; compare in constant time; never log tokens.
- **`scans` and `payment_events` are insert-only** (trigger-enforced). Corrections are new rows.
- **Identity and role come from the authenticated session on the server**, never from the request body. A scan's konduktor and bus come from the session and assignment.
- **Fare is computed on the server** and frozen on the ticket; the client never sends a fare.
- **Money is integer centavos (PHP). Times are UTC in the database, Asia/Manila in the UI.** Never floats for money.
- Never log request bodies, headers, cookies, passwords, tokens or webhook payloads.
- Vehicle position input stays behind `BusPositionSource`; consumers never know whether it is the simulator or real GPS.
- External providers (payment, mail) are adapters behind an interface with a `mock` / `console` default so the demo works offline.
- Use relative `/api` URLs from the browser. No CORS layer, no second backend.

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory) before writing any code. Heed deprecation notices.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
