# BRT Bus Station — Requirements (POC)

Bus ticketing for Cavite bus lines (Philippines). Proof of concept for a client demo; architecture is production-shaped (mirrors the TaxTrail ESP skeleton) so it can grow without a rewrite.

**Demo story:** a passenger opens a map of 20 stations, picks where they board and get off, buys a ticket, gets a QR code, watches simulated buses move along the route in real time, and a konduktor scans the QR on boarding.

**Priority:** `P0` = needed for the demo story · `P1` = needed for a credible demo · `P2` = optional / stretch.

## 0. Global rules

| ID | Rule |
|---|---|
| GEN-01 | **No capacity tracking.** No seats, no passenger count per bus, no "sold out", no reservations, no boarded / not-boarded list. Allowed (decision 16 Oct): **station ticket counts** (valid tickets, sold today, split by destination) as demand data. They are counts per station, never tied to a bus or to a named passenger. |
| GEN-02 | Times are stored in UTC and displayed in Asia/Manila. |
| GEN-03 | Money is PHP stored as integer centavos; never floats. |
| GEN-04 | Single tenant, single route (20 stations, one line). |
| GEN-05 | Role comes from the authenticated session on the server, never from the request body. Konduktor identity and bus on a scan come from the session / assignment, not from the client. |
| GEN-06 | Never log request bodies, cookies, passwords, tokens, webhook payloads or QR tokens. |
| GEN-07 | Every response uses the envelope `{ success, data, timestamp }` / `{ success: false, error }` and carries `X-Request-Id`. |
| GEN-08 | Relative `/api` URLs from the browser. No CORS layer, no second backend. |

## 1. Authentication & roles — module `auth`

| ID | Requirement | Pri |
|---|---|---|
| AUTH-01 | Passenger self-registration with email + password (POC). Passwords hashed (bcrypt). | P0 |
| AUTH-02 | Login / logout / "who am I". Session is an httpOnly, SameSite=Lax cookie holding a signed JWT. | P0 |
| AUTH-03 | Roles: `passenger`, `konduktor`, `admin`. Exactly one role per user. | P0 |
| AUTH-04 | Role-based authorization in middleware (`requireRole(...)`) and re-checked in services for ownership (e.g. a passenger sees only their own tickets). | P0 |
| AUTH-05 | Admin creates konduktor accounts (konduktors cannot self-register). `bootstrap-admin` script creates the first admin. | P0 |
| AUTH-06 | State-changing requests are protected against cross-site requests (Origin check). Login is rate-limited. | P1 |
| AUTH-07 | Deactivated users cannot log in and existing sessions are rejected. | P1 |

## 2. Stations — module `stations`

| ID | Requirement | Pri |
|---|---|---|
| STN-01 | 20 stations (client bus shelters S1–S20), each with name, `sequence` (1..20 order along the line), latitude, longitude. | P0 |
| STN-02 | Public list endpoint returns stations in order (used by the passenger map). | P0 |
| STN-03 | Admin CRUD for stations, including placing / moving a station on the map. Sequence is unique and contiguous; reordering is one operation. | P1 |
| STN-04 | Route geometry is derived from stations in sequence (straight segments between consecutive stations); cumulative distance per station is computed server-side. | P0 |
| STN-05 | Deactivating a station hides it from new purchases but does not affect existing tickets. | P2 |
| STN-06 | **Station demand counts** (admin only): per station, the number of **valid tickets** bought there (paid, not used, not expired), **tickets sold today** (Asia/Manila), and the valid tickets split by destination. Shown as red badges on the admin Live map and in the dispatch card to help choose a bus run. Counts only; no passenger identities. | P1 |
| STN-07 | **Buses waiting at a station** are shown to everyone: on the passenger map a station with an available bus has a green ring, and choosing a boarding station lists the buses waiting there with their konduktor and expected departure ("Departs about 10:20 AM", "No departure time set yet", "Departing any moment"). `GET /api/tracking/availability` lists them per station. The departure time is what the konduktor entered; **computed arrival ETAs for buses on the road are P7** (ETA-01/02, PAS-05). | P0 |

## 3. Fares — module `fares`

| ID | Requirement | Pri |
|---|---|---|
| FARE-01 | Fare rule: `base_fare + per_station_rate × |stations travelled|`, defaults ₱15.00 + ₱2.00/station (configurable). | P0 |
| FARE-02 | Admin-editable **fare overrides** per ordered/unordered station pair that replace the computed fare. Fare A→B equals fare B→A. | P1 |
| FARE-03 | Fare quote endpoint: `origin`, `destination` → fare in centavos. Origin ≠ destination. | P0 |
| FARE-04 | The fare is computed on the server at purchase time and frozen on the ticket (`fare_centavos`); later fare changes never change an existing ticket. | P0 |
| FARE-05 | Admin fare matrix screen (20×20 grid showing computed vs overridden fares). | P2 |

## 4. Buses & konduktors — modules `buses`, `konduktors`

| ID | Requirement | Pri |
|---|---|---|
| BUS-01 | Bus record: plate number (unique), name, status (`active` / `inactive` / `maintenance`), assigned konduktor (nullable). | P0 |
| BUS-02 | Admin CRUD for buses. | P0 |
| BUS-03 | Admin assigns / unassigns a konduktor to a bus. A konduktor is assigned to at most one bus; a bus has at most one konduktor. | P0 |
| KON-01 | Konduktor profile (full name, employee no., phone) linked 1:1 to an auth user with role `konduktor`. | P0 |
| KON-02 | Admin CRUD for konduktors (creates the auth user + profile together). | P0 |
| KON-03 | A konduktor sees their own profile and assigned bus. | P1 |
| KON-04 | A konduktor controls **their own bus**: it is either **Available** (parked at a station, with an optional expected departure time they set: in 5 / 10 / 15 / 30 minutes, or cleared) or **On the road**. The bus is always the one assigned to them, taken from the session and the assignment; no request can name another bus (GEN-05). | P0 |
| KON-05 | A konduktor **dispatches** an available bus: one tap sends it to the far end of the line, or they pick a nearer station. It leaves at once, drives non-stop, and becomes Available again **by itself** at the destination. Once on the road it cannot be dispatched, re-timed or called back. Two taps (or two devices) dispatch once. | P0 |
| KON-06 | While a konduktor chooses where to dispatch (or while the bus is on the road), a **map** shows the route: where their bus is (green), where it is headed (red), the route segment between them, and "N stations · about X km". Tapping a station on the map chooses it as the destination; the list and the map stay in step; tapping the station the bus is already at does nothing. | P0 |
| KON-07 | **A konduktor sees only their own bus**: on their map, in the list of buses, in the list of waiting buses and in the live stream. Other crews' buses and the automatic buses are never sent to them (enforced on the server, not just hidden in the UI). A konduktor has no link to the all-buses passenger map, and `/` sends them to their own page. Passengers, admins and signed-out visitors still see every bus. | P0 |

## 5. Tickets — module `tickets`

| ID | Requirement | Pri |
|---|---|---|
| TKT-01 | A passenger creates a ticket from an origin station to a destination station. Status starts `pending_payment`. | P0 |
| TKT-02 | Statuses: `pending_payment → paid → used`, or `expired` / `cancelled`. Allowed transitions are enforced in one place and by conditional SQL updates. | P0 |
| TKT-03 | **(Changed 19 Oct.)** A ticket is bought **on a bus that is waiting at a shelter** (`POST /tickets {busId}`): it boards at that shelter, goes where the bus is headed (the destination its konduktor announced, else the far end of the line) and is for **that bus only**. The old two-station form still exists and makes a ticket with no bus (checked by shelter alone). | P0 |
| TKT-09 | One purchase can cover 1 to 10 passengers riding the same bus (`quantity`): one account, one payment of fare x quantity, one QR code that admits the whole group once when scanned. The fare is per person; the server multiplies it. | P0 |
| SCN-09 | A paid ticket is accepted only by the konduktor of the bus it was bought on (`wrong_bus` otherwise), and only while that bus waits at the shelter it was bought at (`wrong_station`, `bus_not_at_station`). A refused attempt does not use the ticket up. Once passengers hold tickets on a bus for its current wait, the bus cannot be sent or announced anywhere other than where those tickets go. | P0 |
| TKT-04 | A paid ticket is valid until the end of the Manila day on which the **payment was confirmed** (23:59:59 Asia/Manila), stored as `valid_until` (UTC) and recomputed at that moment, so a ticket paid at 23:58 is valid for two minutes rather than keeping a stale value from creation. After that it is `expired` (set by the worker; scan time checks validity itself, P6). | P0 |
| TKT-05 | "My Tickets": list of the passenger's tickets with origin, destination, fare, status, QR (for `paid`), purchase time. | P0 |
| TKT-06 | Passenger can cancel their own `pending_payment` ticket. No refunds (out of scope). | P1 |
| TKT-07 | `expire-tickets` worker moves `pending_payment` tickets older than `TICKET_PENDING_TTL_MINUTES` (default 15) to `expired`. Idempotent; safe to run concurrently. | P0 |
| TKT-08 | Public ticket reference code (short, human-readable, unique) shown alongside the QR. | P1 |
| TKT-09 | A passenger can hold at most **5** tickets awaiting payment at once (cap enforced in the insert statement); paying for or cancelling one frees a slot. | P1 |

## 6. Payments — module `payments`

| ID | Requirement | Pri |
|---|---|---|
| PAY-01 | Payment gateway adapter interface (`createCheckout`, `verifyWebhook`, `parseEvent`) in `src/server/integrations/payment/` with providers `mock` (default, works offline) and `pisopay` (GCash, Maya, QR Ph; test mode). | P0 |
| PAY-02 | Starting payment creates a checkout session for a `pending_payment` ticket and returns a redirect URL. | P0 |
| PAY-03 | A ticket becomes `paid` **only** from a verified webhook (signature checked). The client redirect / return page never marks a ticket paid; it only polls ticket status. | P0 |
| PAY-04 | Webhook handling is idempotent: events are stored with a unique `(provider, event_id)`; replays are acknowledged with 200 and change nothing. | P0 |
| PAY-05 | Payment records (amount, provider, method, provider reference, status, timestamps) are insert-only evidence plus status transitions via conditional updates; amounts are never edited. | P1 |
| PAY-06 | Webhook amount must equal the ticket's `fare_centavos`; mismatch is recorded and does not mark the ticket paid. | P0 |
| PAY-07 | A webhook arriving for an already `expired` ticket records the payment and flags it for admin attention (no refund flow in POC). | P1 |
| PAY-08 | Mock provider includes a demo "payment page" with Pay / Fail buttons that call the signed webhook path server-side, so the whole flow is testable offline. `APP_MODE=demo` never calls a real provider unless `PAYMENT_PROVIDER=paymongo` is set. | P0 |
| PAY-09 | Admin **Payments** page lists recent payments and highlights those with status `needs_review` (wrong amount, money for a cancelled / expired / already-paid ticket, or paid after its checkout was closed), each with a plain-language reason. No refund flow in the POC. | P1 |
| PAY-10 | The mock provider cannot run in production: the app refuses to start with `APP_ENV=prod` and `PAYMENT_PROVIDER=mock`. Only the configured provider accepts webhooks; others are 404. A signed event older than 5 minutes is refused (replay window). | P0 |
| PAY-11 | A payment that fails returns the passenger to the ticket with a clear "did not go through" message and **Pay again**; the return page waits for confirmation only after a successful payment. | P1 |

## 7. QR ticket

| ID | Requirement | Pri |
|---|---|---|
| QR-01 | One QR per ticket. Payload is a signed token (HMAC-SHA256) containing the ticket ID, versioned, e.g. `v1.<ticketId>.<signature>`. | P0 |
| QR-02 | The token is never trusted without verifying the signature server-side; verification uses constant-time comparison. | P0 |
| QR-03 | QR is shown in "My Tickets" with origin, destination, fare and status, and downloadable as PNG. | P0 |
| QR-04 | QR is only revealed for `paid` tickets; used / expired tickets show their status instead. | P1 |

## 8. Scanning — module `scans`

| ID | Requirement | Pri |
|---|---|---|
| SCN-01 | Camera-based QR scanner in the browser, usable on a phone; the SPA is an installable PWA (manifest + service worker for the app shell; no offline scanning). | P0 |
| SCN-02 | Scan flow: verify signature → ticket exists → status `paid` → not past `valid_until` → mark `used` atomically (`UPDATE … SET status='used', used_at=now() WHERE id=$1 AND status='paid' AND valid_until >= now() RETURNING …`). | P0 |
| SCN-03 | A second scan fails with a clear message ("Already used at 08:42", Manila time). | P0 |
| SCN-04 | Every scan attempt is recorded: ticket (if identifiable), konduktor, bus, timestamp, result (`valid` / `already_used` / `expired` / `invalid`). Scan records are insert-only. | P0 |
| SCN-05 | Result screen: full-screen green (valid) or red (failed) showing origin and destination (so the konduktor knows where the passenger gets off) and the failure reason. | P0 |
| SCN-06 | Konduktor personal history: scans grouped by day with a count per day; today first. A konduktor sees only their own scans. | P0 |
| SCN-07 | Scanning is allowed only for users with role `konduktor`; the bus is taken from the konduktor's assignment. A konduktor without an assigned bus can still scan, with `bus_id` null. | P1 |
| SCN-08 | Manual fallback: enter the ticket reference code if the camera fails. | P2 |

## 9. Bus tracking — module `tracking`

| ID | Requirement | Pri |
|---|---|---|
| TRK-01 | `scripts/bus-simulator-worker.ts` runs, automatically from the moment it starts, every bus that has **no active konduktor** (up to `SIM_BUS_COUNT`, default 4, by name) back and forth along the whole line, pausing `SIM_DWELL_SECONDS` at each station and turning around at each end. Buses **with** a konduktor are crewed (TRK-08). Speed and tick rate are env-configurable. | P0 |
| TRK-02 | Position input is behind a `BusPositionSource` interface (`simulator` now; `konduktor-gps` later) so real GPS can replace the simulator without touching consumers. | P0 |
| TRK-03 | Latest position per bus is persisted (lat, lng, heading, speed, along-route distance, direction, next station, at-station flag, updated_at). | P0 |
| TRK-04 | Live feed to clients via Server-Sent Events (`GET /api/tracking/stream`); an initial snapshot is sent on connect, then updates. Clients reconnect automatically. | P0 |
| TRK-05 | Passenger map and admin map render buses moving smoothly (client-side interpolation between updates). | P0 |
| TRK-06 | ~~Start / stop / reset from the admin panel.~~ **Removed (decision 16 Oct).** The simulator has no on/off switch: restart the worker to reset the buses. The admin Live map shows whether the worker is online (it checks in through `simulator_state`) and tells the admin how to start it. | P0 |
| TRK-07 | Tracking reads (`GET /api/tracking/buses`, `/availability`, the SSE stream) are **public**, like the station list, for passengers, admins and visitors: bus positions are not sensitive to them. **Exception (KON-07): a signed-in konduktor gets only their own bus.** Simulator control no longer exists; position history is not kept in the POC. | P1 |
| TRK-08 | **Crewed buses** (active konduktor assigned) wait **parked** at a station until their konduktor dispatches them (KON-05). On the first run the simulator spreads them along the line. A dispatch is a trip stored in `bus_trips` (who sent it is recorded); the worker runs it non-stop and then parks the bus at the destination as available. Assigning or removing a konduktor changes a bus between crewed and automatic within a tick. **Admins cannot dispatch** (decision 16 Oct): they monitor. | P0 |
| TRK-09 | ~~Recall of a dispatched bus by an admin.~~ **Removed with admin dispatch.** If a bus loses its konduktor or a station on its trip leaves service, the trip is cancelled and the bus is parked again at its origin; a clean worker shutdown cancels open trips and leaves buses available. | P1 |
| TRK-10 | **Bus details** (click a bus in the list or on the map): for a bus on the road, where it **came from**, where it is **going**, status / speed, progress, its konduktor and when it was dispatched; for a line bus also its next stop; for a **parked** bus, where it waits, its konduktor and the expected departure. Available to everyone. Never a passenger count (GEN-01). | P0 |

## 10. ETA — module `eta`

| ID | Requirement | Pri |
|---|---|---|
| ETA-01 | For each bus, ETA to each **upcoming** station on its current direction, from remaining along-route distance, simulated speed and dwell time at intermediate stations. | P0 |
| ETA-02 | Passenger taps a station to see the next buses arriving there, ordered by ETA, with direction and minutes away. | P0 |
| ETA-03 | ETA is a pure function in `src/shared` (distance, speed, dwell → seconds) so server and client share it and it is unit tested. | P1 |

## 11. Notifications — module `notifications`

| ID | Requirement | Pri |
|---|---|---|
| NTF-01 | (Built P9.) Optional email of the ticket (details + QR image) when a ticket becomes `paid`. Adapter interface with `console` (default) and `smtp` providers in `src/server/integrations/mail/`. | P2 |
| NTF-02 | Email failure never blocks or rolls back the payment confirmation. | P2 |

## 12. Admin — module `admin` (reporting) + CRUD screens above

| ID | Requirement | Pri |
|---|---|---|
| ADM-01 | Admin CRUD screens: stations (map placement), fares, buses, konduktors, with konduktor ↔ bus assignment. | P0 |
| ADM-02 | Live map with all buses and stations. | P0 |
| ADM-03 | Dashboard: tickets sold per day, sales total per day (PHP), tickets by status. | P1 |
| ADM-04 | Scan log filterable by konduktor, bus and date, with result. | P1 |
| ADM-05 | The admin **Live map is monitoring only**: every bus (parked, on the road, automatic) with details and its konduktor, tickets bought at each station, buses waiting at the selected station, and a warning with the start command if the simulator worker is not running. No dispatch or recall controls. | P0 |

## 13. Passenger experience

| ID | Requirement | Pri |
|---|---|---|
| PAS-01 | Home screen is an interactive Leaflet + OpenStreetMap map: 20 station markers, route line, live buses. | P0 |
| PAS-02 | Tap a marker to set the origin, tap another to set the destination; both are also selectable from dropdowns (accessibility). Selection is clearable. | P0 |
| PAS-03 | Computed fare is shown as soon as both stations are chosen. | P0 |
| PAS-04 | Buy → payment (provider page or mock page) → return page that polls until `paid` → QR shown. | P0 |
| PAS-05 | Station detail: tap a station to see upcoming buses and ETA (ETA-02). | P0 |
| PAS-06 | Mobile-first layout; works at phone width. | P1 |

## 14. Platform / architecture

| ID | Requirement | Pri |
|---|---|---|
| PLT-01 | Single Next.js 16 process: React Router SPA via catch-all page (`ssr: false`) + embedded Hono API via `/api` bridge. | P0 |
| PLT-02 | Code zones `src/client`, `src/server`, `src/shared` with ESLint boundary rules; server aliases defined once in tsconfig. | P0 |
| PLT-03 | Server modules follow controller → service → repository (+ `*.schema.ts`, `*.types.ts`, `*.test.ts`). | P0 |
| PLT-04 | Validated environment (`src/server/config/env.ts`, Zod); every variable listed in `.env.example`. | P0 |
| PLT-05 | SQL-first PostgreSQL (`pg`, no ORM): `database/schema/<domain>/NNN-*.sql`, `database/updates/NNN-*.sql`, `database/seeds/`; Bun scripts `migrate`, `seed`, `bootstrap-admin`. | P0 |
| PLT-06 | Workers are `scripts/*-worker.ts` under Bun and reuse server code (`bus-simulator-worker`, `expire-tickets-worker`). | P0 |
| PLT-07 | `bun run check` = typecheck (client + server) + lint + test. | P0 |
| PLT-08 | `docker-compose.yml` provides Postgres only (no Redis / S3 in the POC). | P0 |
| PLT-09 | Seed data: the 20 client-provided bus shelters (S1–S20, from the client spreadsheet), fare settings, 4 buses, 3 konduktors, 1 admin, 2 demo passengers, sample paid and used tickets and scans. | P0 |
| PLT-10 | OpenAPI docs served from the Hono app (Swagger UI) in non-production. | P1 |

## 15. Out of scope (see roadmap "Beyond the POC")

Real GPS tracking · seat or capacity management · refunds · discounts (student / senior / PWD) · multiple routes · native mobile apps · offline scanning.
