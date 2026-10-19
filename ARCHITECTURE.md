# Architecture

Short operational map. Requirements: [`plan/requirements.md`](plan/requirements.md); design and decisions: [`plan/dev-plan.md`](plan/dev-plan.md); progress: [`plan/roadmap.md`](plan/roadmap.md).

## Request flow

```text
Browser
  -> src/app/[[...slug]]/page.tsx        Next catch-all, loads the SPA (ssr: false)
  -> src/client/App.tsx                  React Router SPA, shadcn/ui, Leaflet
  -> fetch /api/*   |  EventSource /api/tracking/stream     same origin, no CORS
  -> src/app/api/[[...route]]/route.ts   Next -> Hono bridge (strips /api)
  -> src/server/index.ts                 Hono app
  -> controller -> service -> repository
  -> PostgreSQL

Payment provider  --webhook-->  /api/payments/webhook/:provider  (signature verified)

Bun workers (same codebase, separate processes):
  scripts/bus-simulator-worker.ts   -> bus_positions + NOTIFY bus_positions
  scripts/expire-tickets-worker.ts  -> pending_payment tickets past TTL -> expired
```

One deployable app plus workers. Do not add a second backend, a separate API host, or Next.js App Router pages for application screens.

## Live bus feed (SSE)

```text
simulator worker --UPSERT bus_positions + NOTIFY--> PostgreSQL
Next process: one LISTEN connection (globalThis singleton) --> in-memory subscribers --> SSE streams --> EventSource in the map
```

**Why SSE, not WebSocket:** the map only needs server → client updates; SSE is a plain HTTP response that Hono's `streamSSE` serves from a normal route handler in Next's Node runtime, `EventSource` reconnects by itself, and there is no upgrade handling or extra server to run inside Next. A client that must send high-frequency data (future konduktor GPS) uses an ordinary `POST /tracking/position` into the same table. If LISTEN/NOTIFY is unavailable, the stream falls back to a 1 s poll. On connect the stream sends a full snapshot, then incremental `bus` events. The client interpolates between updates for smooth movement.

**Position sources:** `BusPositionSource` (`src/server/integrations/positions/`) has a `simulator` implementation now and a `konduktor-gps` one later. Everything downstream (SSE, ETA, maps) reads `bus_positions` only.

## Directory ownership

| Path | Purpose |
|---|---|
| `src/app` | Thin Next entry: catch-all page, `/api` bridge, root layout. Keep it small. |
| `src/client` | React SPA: `app/` (router, config, providers), `pages/<area>/` (thin route pages: `passenger`, `konduktor`, `admin`, `auth`), `features/<domain>/`, `components/` (`ui/` = shadcn, `layout/`, `map/`), `lib/` |
| `src/server/modules/<domain>` | `*.controller.ts` → `*.service.ts` → `*.repository.ts` (+ `*.schema.ts`, `*.types.ts`, `*.test.ts`) for `auth`, `stations`, `fares`, `buses`, `konduktors`, `tickets`, `payments`, `scans`, `tracking`, `eta`, `notifications`, `admin`, `system` |
| `src/server/core` | Database pool and transactions (`pg`), request context, session/role helpers |
| `src/server/config` | Validated environment (`env.ts`) — add every new variable here and to `.env.example` |
| `src/server/middleware` | Request ID, logging, errors, session auth + Origin check, `requireRole` |
| `src/server/lib` | OpenAPI factory, response envelopes, QR token signing, rate limiting |
| `src/server/integrations` | Adapters: `payment/` (mock, pisopay), `mail/` (console, smtp), `positions/` (simulator, later GPS), `routing/` (OSRM road geometry between shelters) |
| `src/server/integration` | Cross-module integration tests (real Postgres) |
| `src/shared` | Browser-safe contracts used by both sides: roles/permissions, ticket status machine, money, Manila time, route geometry, ETA, fare rule |
| `database/schema`, `database/updates`, `database/seeds` | Fresh-install schema per domain, additive updates, seed data (see `database/README.md`) |
| `scripts` | `migrate`, `seed`, `bootstrap-admin`, workers (`*-worker.ts`) |
| `plan` | requirements, dev plan, roadmap |

## Server module convention

```text
*.controller.ts -> *.service.ts -> *.repository.ts -> PostgreSQL
       |                 |
  *.schema.ts       *.types.ts
```

- **Controller**: OpenAPI route (`createRoute` with `z` from `@hono/zod-openapi`), validation, role guard, status, response envelope.
- **Service**: business rules, transactions, ownership checks. Throws `ApiError`.
- **Repository**: SQL only (`pg` parameterized queries), always receives a `SQLExecutor`.
- Register each controller in `src/server/index.ts`.

## Responses

`{ success: true, data, timestamp }` or `{ success: false, error: { code, message, details? }, timestamp }`.
Throw `ApiError` from services; the error middleware formats it. Every response carries `X-Request-Id`. The SSE stream and the QR PNG endpoint are the only non-envelope responses.

## Roles and routes

One SPA, three roles (`passenger`, `konduktor`, `admin`). The server enforces roles with `requireRole(...)` and re-checks ownership in services; the client uses `RequireRole` route guards and a role-driven menu (`app/config/nav.config.ts`) for convenience only — the UI never decides.

## Domain rules baked into the code

- **No capacity** anywhere (no seats, counts, sold-out).
- **Ticket status machine** (`src/shared/tickets/status.ts`): `pending_payment → paid → used`; `pending_payment → expired | cancelled`; `paid → expired`. Persisted only via conditional updates.
- **Paid only via verified webhook**; webhook idempotency through `payment_events UNIQUE(provider, event_id)`.
- **QR token**: `v1.<ticketId>.<HMAC-SHA256>`; verified before lookup; ticket validity (`valid_until`, end of purchase day in Asia/Manila) is also checked at scan time.
- **Scan** = verify → atomic `UPDATE … WHERE status='paid' AND valid_until >= now()` → insert scan row, one transaction.
- **Insert-only evidence**: `scans`, `payment_events` (trigger `forbid_update_delete()`).
- **Money** in integer centavos; **times** UTC in DB, Asia/Manila in UI.
