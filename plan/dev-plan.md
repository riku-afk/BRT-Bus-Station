# BRT Bus Station — Development Plan (POC)

Requirement IDs refer to [`requirements.md`](requirements.md); progress is tracked in [`roadmap.md`](roadmap.md).

## 1. Principles

1. **Demo first, production-shaped.** Each phase ends with something demoable; nothing is built in a way that must be rewritten to grow (adapters, interfaces, module boundaries, SQL migrations).
2. **Mirror the TaxTrail ESP skeleton.** Same zones, aliases, module pattern, envelope, middleware, DB layout and scripts. See [`ARCHITECTURE.md`](../ARCHITECTURE.md).
3. **Correctness where it is cheap to be correct:** conditional SQL updates for ticket transitions, signed QR tokens, verified + idempotent webhooks, server-side fares, server-derived identity.
4. **No capacity concept anywhere** (GEN-01): no columns, endpoints or UI for it.

## 2. Stack

Bun · TypeScript (strict) · Next.js 16 (Node runtime) · React 19 · React Router 7 · TanStack Query · Tailwind 4 · shadcn/ui · Leaflet + OpenStreetMap · Hono + `@hono/zod-openapi` · Zod 4 · PostgreSQL via `pg` (raw SQL) · `jose` (JWT) · `bcryptjs` · `qrcode` (PNG) · `html5-qrcode` or `@zxing/browser` (scanner) · Vitest.

## 3. Key design decisions

| # | Decision | Rationale |
|---|---|---|
| D-01 | **SSE** (not WebSocket) for the live feed. | One-way server→client is all the map needs; works as a normal Hono/Next Node route handler (`streamSSE`); auto-reconnect and `Last-Event-ID` built into `EventSource`; no extra server, no upgrade handling inside Next. Revisit WebSocket only if clients must send high-frequency data (real GPS can still use a plain POST). |
| D-02 | Simulator is a **separate Bun process**; it writes positions to Postgres and calls `NOTIFY bus_positions`. The Next process holds one `LISTEN` connection and fans events out to open SSE streams. Fallback: 1 s poll if LISTEN is unavailable. | Workers can't push to Next's in-memory streams; no Redis in the POC; the DB is already the source of truth. |
| D-03 | Positions are persisted as **latest row per bus** (upsert), no history. | Enough for the demo; history is a roadmap item. |
| D-04 | `BusPositionSource` interface: `simulator` now, `konduktor-gps` later (a `POST /tracking/position` from the konduktor's phone writing to the same table). | Requirement TRK-02. |
| D-05 | Route model: stations in sequence, straight segments, cumulative distance (haversine) per station. Bus state = `(distanceAlongRoute, direction)`. Position = interpolation on the segment. | Simple, deterministic, and ETA falls out of it (remaining distance ÷ speed + dwell). |
| D-06 | ETA formula lives in `src/shared/eta/` and is pure. | Shared by server and client; unit-testable. |
| D-07 | Auth: JWT (HS256, `jose`) in an httpOnly SameSite=Lax cookie; `sessionMiddleware` loads the user; `requireRole` guards routes; services re-check ownership. Origin check on mutating requests instead of a CSRF token. | Same-origin SPA with no CORS; simple and safe. |
| D-08 | Fare = `base + per_station × n`, plus `fare_overrides(station_a, station_b)` (stored with a < b). Settings in a single-row `fare_settings`. Fare is frozen on the ticket. | Meets "flat / per-station / matrix" with one model. |
| D-09 | A ticket is created with a placeholder `valid_until` (end of that Manila day). When the verified webhook marks it paid, `valid_until` is **recomputed to the end of the day of payment** in the same conditional UPDATE. Expiry is also checked at scan time (P6), not only by the worker. | A worker lag can never let an expired ticket be used, and a ticket bought just before midnight is not born already expired. |
| D-10 | QR token `v1.<ticketId>.<base64url(HMAC-SHA256(secret, "v1."+ticketId))>`; scan endpoint verifies signature before any DB lookup. Secret from env, ≥ 32 chars. | Unforgeable, short enough for a QR, versioned for key rotation. |
| D-11 | Payment: provider interface; ticket → `paid` only inside the webhook transaction: insert `payment_events` (unique `(provider,event_id)`) → on conflict return 200 → verify amount → conditional `UPDATE tickets … WHERE status='pending_payment'`. | Idempotent and race-safe. |
| D-12 | Mock provider mimics a hosted gateway's shape and signs its own webhooks with `PAYMENT_WEBHOOK_SECRET`; its demo page triggers the webhook server-side. | Full flow offline with the same code path as the real provider. |
| D-13 | Scans are insert-only; ticket `used` transition is the only ticket update on scan, in the same transaction as the scan row. | Audit-friendly and atomic. |
| D-14 | One SPA, role-based routes (`RequireRole`) and a role-driven menu from `app/config/systems.config.ts` (named `nav.config.ts` here). | Requirement from brief. |
| D-15 | PWA: web manifest + minimal service worker caching the app shell only; scanner requires HTTPS (or localhost) for camera access. | Installable without offline scanning (out of scope). |
| D-16 | DB driver `pg` (brief) rather than `postgres` (TaxTrail). A thin `SQLExecutor` wrapper (`query<T>(sql, params)`) keeps repositories driver-agnostic. | Follows the brief; repositories look the same as TaxTrail's. |
| D-17 | **Crewed vs automatic buses.** A bus with an **active konduktor** is crewed: it waits parked at a station until that konduktor dispatches it. A bus without one runs the line by itself (the first `SIM_BUS_COUNT`). No role column: the assignment decides, so assigning / removing a konduktor changes the bus within a tick. `simulator_state` only holds the worker heartbeat. | Keeps a live-looking map with no one logged in (automatic buses) while konduktors really control their own buses. |
| D-18 | **Dispatch = a row in `bus_trips`** (`en_route` → `completed` / `cancelled`, `dispatched_by` = the konduktor). `bus_availability` holds a crewed bus's state (`available` at a station with an optional expected departure, or `on_road`). The konduktor's dispatch locks that row, inserts the trip and flips it to `on_road` in one transaction (a partial unique index on active trips is the backstop). The worker runs the trip non-stop with the same movement code on a two-station mini-route, then in one transaction completes it and parks the bus at the destination. | Cross-process with no extra infrastructure; double taps and two devices cannot both dispatch; a worker restart re-parks a bus whose trip vanished. |
| D-19 | **Station demand** is computed on request from `tickets` (valid = `paid` and `valid_until > now()`; sold today = `paid_at` on the Manila calendar day). The `tickets` table was created early (schema part of P5-01). | No counters to keep in sync; a scan or expiry changes the numbers automatically. |
| D-20 | **Webhook processing** in one transaction per event: verify signature on the raw body → lock the payment row (`FOR UPDATE`) → if the event id is already stored, acknowledge and stop → lock the ticket → apply (amount must equal the frozen fare; `markPaid` is a conditional UPDATE) → insert the event with its outcome (insert-only, unique `(provider, event_id)` as the backstop). Money that cannot be applied is kept as `payments.status = needs_review` with a reason. Payments are evidence (a trigger forbids deleting them or changing amount / ticket / provider reference). | Idempotent and race-safe with no extra infrastructure; nothing is lost or silently applied. |
| D-21 | The mock gateway is a real app route (`/pay/mock/:ref`, outside the app shell). Its Pay / Fail buttons call a server endpoint that **builds an event, signs it and sends it through the same webhook handler** a provider would, so signature checking, idempotency and the amount check all run offline. | The demo exercises the production code path instead of a shortcut. |
| D-22 | `bun run workers` runs the simulator and the ticket-expiry worker together with labelled output. The expiry worker uses `FOR UPDATE SKIP LOCKED` so it never fights a payment being applied. | One terminal for the demo; safe to run more than one copy. |
| D-23 | **Lock order: ticket first, then payment**, in every path (cancel, checkout, the expiry worker and the webhook). The webhook used to lock the payment first and could deadlock against the expiry worker; found by a flaky race test, fixed, and pinned by a 20-round stress test (which fails every time on the old order). | Opposite lock orders deadlock; one agreed order cannot. |
| D-24 | **Departure time vs ETA.** The expected departure of a parked bus is entered by its konduktor (minutes from now, 1–480) and shown as-is. Computing when a bus still on the road will arrive at a station (distance, speed, dwell) is P7 and will be merged with this into one "next buses here" view. | The first is data someone types; the second needs the ETA calculation. |

## 4. Data model (first cut)

```text
users(id, email unique, password_hash, full_name, role, is_active, created_at)
konduktors(id, user_id unique → users, employee_no unique, phone, created_at)
stations(id, name, sequence unique, latitude, longitude, is_active)
fare_settings(id=1, base_fare_centavos, per_station_centavos, updated_at)
fare_overrides(station_a_id, station_b_id, fare_centavos, PK(a,b), CHECK a<b)
buses(id, plate_number unique, name, status, konduktor_id unique nullable → konduktors)
tickets(id, reference_code unique, passenger_id → users, origin_station_id, destination_station_id,
        fare_centavos, status, valid_until, paid_at, used_at, created_at)
payments(id, ticket_id → tickets, provider, provider_ref, method, amount_centavos, status, created_at)
payment_events(id, provider, event_id, payload_hash, received_at, UNIQUE(provider,event_id))
scans(id, ticket_id nullable, konduktor_id, bus_id nullable, result, scanned_at)   -- insert-only
bus_positions(bus_id PK, lat, lng, heading, speed_kmh, distance_m, direction, next_station_seq, at_station, updated_at)
simulator_state(id=1, status, started_at, updated_at)
```

Insert-only guard: a `forbid_update_delete()` trigger on `scans` and `payment_events` (carried over from TaxTrail's evidence-table idea).

## 5. API surface (all under `/api`)

| Area | Endpoints |
|---|---|
| auth | `POST /auth/register`, `/auth/login`, `/auth/logout`, `GET /auth/me` |
| stations | `GET /stations` (public), `POST/PATCH/DELETE /stations/:id` (admin), `POST /stations/reorder`, `GET /stations/demand` (admin) |
| fares | `GET /fares/quote?origin&destination`, `GET/PUT /fares/settings`, `GET/PUT/DELETE /fares/overrides` (admin) |
| buses / konduktors | CRUD (admin), `PUT /buses/:id/konduktor` |
| tickets | `POST /tickets`, `GET /tickets/mine`, `GET /tickets/:id`, `GET /tickets/:id/qr.png`, `POST /tickets/:id/cancel` |
| payments | `POST /tickets/:id/checkout`, `POST /payments/webhook/:provider` (public, signature-verified), mock `GET /payments/mock/:sessionId` |
| scans | `POST /scans` (konduktor), `GET /scans/mine` (konduktor), `GET /scans` (admin) |
| tracking | `GET /tracking/buses`, `GET /tracking/stream` (SSE), `GET /tracking/availability`, `GET /tracking/status` (all public); konduktor only: `GET /tracking/my-bus`, `PUT /tracking/my-bus/departure`, `POST /tracking/my-bus/dispatch` |
| eta | `GET /eta/stations/:id` |
| admin | `GET /admin/stats/sales`, `GET /admin/stats/tickets` |
| system | `GET /system/info`, `GET /health` |

## 6. Phases

Each phase ends with: tests pass → `bun run check` passes → roadmap updated → short summary of what to demo. Feature workflow per task: requirement → schema + update → server (repository → service → schema → controller, register in `src/server/index.ts`) → client (API fn + hook in `features/<domain>/`, page in `pages/`, route in `app/router.tsx`, menu) → tests → check → roadmap.

| Phase | Scope | Requirements | Demo |
|---|---|---|---|
| **P0 Skeleton** | Repo, zones, aliases, ESLint boundaries, two tsconfigs, envelope, error / request-id / logger / auth middleware shells, env validation, DB scripts (`migrate`, `seed`, `bootstrap-admin`), `system` module end-to-end as the example, SPA shell (router, providers, layout, nav), Vitest, docker-compose. | PLT-01..08, GEN-07 | `/api/system/info` shown on a page; `bun run check` green. |
| **P1 Auth** | users table, register / login / logout / me, session + `requireRole`, role-based routes and menus, login & register pages, bootstrap-admin. | AUTH-01..07 | Log in as each role; menu changes. |
| **P2 Stations + map** | stations schema + seed (20 client shelters S1–S20), list API, route geometry, Leaflet map with markers and route line, origin / destination selection + dropdowns, fare quote, admin station CRUD with map placement. | STN-01..05, FARE-01,03, PAS-01..03 | Pick two stations, see the fare. |
| **P3 Buses / konduktors CRUD** | buses + konduktors schema, CRUD, assignment, admin screens, fare settings / overrides UI. | BUS-*, KON-*, ADM-01, FARE-02 | Admin creates a konduktor and assigns a bus. |
| **P4 Simulator + live map** | `BusPositionSource`, simulator worker, `bus_positions`, `simulator_state`, LISTEN/NOTIFY → SSE, passenger + admin live maps with smooth interpolation, admin start / stop / reset. | TRK-*, ADM-02, ADM-05 | Buses driving the route live. |
| **P5 Tickets + mock payment** | tickets schema, create / list / cancel, payment adapter + mock provider, checkout + mock payment page, verified idempotent webhook, return page polling, expire-tickets worker. | TKT-*, PAY-01..08, PAS-04 | Buy a ticket end to end offline. |
| **P6 QR + scanning** | signed token, QR PNG, My Tickets, scanner page (camera), atomic scan, scan log, konduktor history, PWA manifest + SW, admin scan log. | QR-*, SCN-*, ADM-04 | Passenger shows QR, konduktor scans green; second scan red. |
| **P7 ETA** | shared ETA function, `/eta/stations/:id`, station detail panel on the map. | ETA-*, PAS-05 | Tap a station: next buses and minutes. |
| **P8 Real payment gateway** | PisoPay adapter (redirect checkout: session + token, `hd` webhook signature, webhook parsing; ported from the e-Notary system), env switch, setup doc. | PAY-01 (pisopay) | Pay on PisoPay's page, ticket turns paid via the webhook. |
| **P9 Email + dashboards + polish** | mail adapter (console, smtp), email ticket on paid, admin sales / ticket stats, demo script and seed polish. | NTF-*, ADM-03 | Admin dashboard with seeded data; ticket email. |

## 7. Testing strategy

- **Unit** (beside source): fare calculation, QR sign / verify, ticket status transitions, ETA, route geometry / interpolation, Manila day-end calculation, webhook signature verification.
- **Integration** (`src/server/integration/*.integration.test.ts`, real Postgres, skipped when `DATABASE_URL` is absent): auth + roles, purchase → webhook → paid, **replayed webhook is a no-op**, **double scan** (including two concurrent scans → exactly one `valid`), expired ticket scan, pending-ticket expiry, konduktor sees only own scans.
- **Client**: component tests only for the logic-heavy pieces (station picker, scan result screen); the rest is verified by running the app.
- Manual demo checklist kept in `plan/roadmap.md` per phase.

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| LISTEN/NOTIFY inside Next dev (HMR creates duplicate listeners). | Singleton on `globalThis`; poll fallback. |
| SSE through Next's route bridge buffering. | **Spike passed (P4-01):** one event per second arrives live through `next start`, with and without `Accept-Encoding: gzip`. Headers `X-Accel-Buffering: no`; Hono sets `Cache-Control: no-cache`. |
| Phone camera needs HTTPS. | Document `next dev --experimental-https` / tunnel for the demo; scanner has a manual-code fallback (SCN-08). |
| Generated station coordinates are not real. | Seed from a single `stations.seed.json` the client can replace with the real list. |
| Payment provider sandbox availability / account approval. | Mock is the default; PisoPay is a late phase behind the same interface. |
| Next 16 API differences. | Read `node_modules/next/dist/docs/` before writing any Next-specific code. |

## 9. Open questions (defaults assumed)

| # | Question | Default used in this plan |
|---|---|---|
| Q1 | Fare rule | ₱15.00 base + ₱2.00 per station, admin overrides |
| Q2 | Ticket validity | End of purchase day, Asia/Manila |
| Q3 | Pending expiry | 15 minutes |
| Q4 | Real payment provider | PisoPay (the team's existing gateway, as used by e-Notary) in P8; mock by default |
| Q5 | Email adapter | `console` default, SMTP available |
| Q6 | Bus count | 4 |
| Q7 | Stations | **Client data**: the 20 bus shelters S1–S20 from `Cavite_BRT_P2P_and_APMS_Locations_Updated.xlsx` (real coordinates, used as given). Terminals (Imus, General Trias, Tanza), Kawit and Trece Martires have no coordinates in the file, so they are not stations until the client supplies them. |
| Q8 | Scanner library | `html5-qrcode` (simplest; swap for `@zxing/browser` if scan reliability is poor) |
| Q9 | Is there one line with two directions (buses turn around)? | Yes: one route, bidirectional; tickets carry no direction |
