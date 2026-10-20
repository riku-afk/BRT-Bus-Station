# BRT Bus Station — Roadmap & Tracker (POC)

Tracks the phases in [`dev-plan.md`](dev-plan.md). Requirement IDs refer to [`requirements.md`](requirements.md).

| | |
|---|---|
| **Last updated** | 16 Oct 2026 |
| **Overall status** | 🟩 P0–P9 built (PisoPay QR Ph awaiting credentials and a public address to try live)|

**Status legend:** ⬜ Not started · 🟨 In progress · ✅ Done · ⛔ Blocked · ⏸️ Deferred

> **How to update:** change a task's status, update the dashboard count, add a Change Log line.

## 1. Dashboard

| Phase | Name | Tasks done | Status |
|---|---|---|---|
| P0 | Skeleton | 9 / 9 | ✅ |
| P1 | Auth | 6 / 6 | ✅ |
| P2 | Stations + map | 7 / 7 | ✅ |
| P3 | Buses / konduktors CRUD | 6 / 6 | ✅ |
| P4 | Simulator + live map | 8 / 8 | ✅ |
| P4b | Simulator enhancement: dispatch, station counts, bus details | 8 / 8 | ✅ |
| P5 | Tickets + mock payment | 8 / 8 | ✅ |
| P5b | Konduktor-controlled buses, station availability | 8 / 8 | ✅ |
| P5c | Konduktor map and own-bus-only view | 4 / 4 | ✅ |
| P6 | QR + scanning | 8 / 8 | ✅ |
| P7 | ETA | 3 / 3 | ✅ |
| P8 | Real payment gateway (PisoPay) | 3 / 3 | ✅ |
| P9 | Email + dashboards + polish | 5 / 5 | ✅ |
| | **Total** | **64 / 83** | |

## 2. Tasks

### P0 — Skeleton
| ID | Task | Req | Status |
|---|---|---|---|
| P0-01 | Repo, `package.json`, Next 16, tsconfigs (root / client / server), path aliases | PLT-01,02 | ✅ |
| P0-02 | ESLint boundary rules (server ↛ `@/*`, client ↛ server aliases) | PLT-02 | ✅ |
| P0-03 | Next shell: catch-all page (`ssr:false`), `/api` bridge, layout | PLT-01 | ✅ |
| P0-04 | Hono app, OpenAPI factory, envelope + `ApiError`, request-id / logger / error middleware | GEN-07 | ✅ |
| P0-05 | Env validation (`env.ts`) + `.env.example` | PLT-04 | ✅ |
| P0-06 | DB layer (`pg` pool, `SQLExecutor`, transactions) + `migrate`, `seed` scripts + `docker-compose.yml` | PLT-05,08 | ✅ |
| P0-07 | `system` module end-to-end (controller / service / schema / test) | PLT-03 | ✅ |
| P0-08 | SPA shell: router, providers (Query), layout, nav config, shadcn base | PLT-01 | ✅ |
| P0-09 | Vitest + `bun run check` green; `AGENTS.md` / `ARCHITECTURE.md` verified against code | PLT-07 | ✅ |

### P1 — Auth
| ID | Task | Req | Status |
|---|---|---|---|
| P1-01 | `users` schema + update + `bootstrap-admin` script | AUTH-05 | ✅ |
| P1-02 | Register / login / logout / me (bcrypt, JWT cookie) | AUTH-01,02 | ✅ |
| P1-03 | `sessionMiddleware`, `requireRole`, Origin check, login rate limit | AUTH-03,04,06 | ✅ |
| P1-04 | Deactivated-user handling | AUTH-07 | ✅ |
| P1-05 | Login / register pages, `RequireRole` guard, role-based menu | AUTH-03 | ✅ |
| P1-06 | Auth integration tests | AUTH-* | ✅ |

### P2 — Stations + map
| ID | Task | Req | Status |
|---|---|---|---|
| P2-01 | `stations` schema + update + seed (20 client shelters S1–S20) | STN-01 | ✅ |
| P2-02 | Stations list API + route geometry / cumulative distance (shared) | STN-02,04 | ✅ |
| P2-03 | Fare calculation + quote API (`fares`) | FARE-01,03 | ✅ |
| P2-04 | Leaflet map: markers, route line | PAS-01 | ✅ |
| P2-05 | Origin / destination picker (tap + dropdown), fare display | PAS-02,03 | ✅ |
| P2-06 | Admin station CRUD with map placement / reorder | STN-03 | ✅ |
| P2-07 | Tests (fare, geometry, stations API) | — | ✅ |

### P3 — Buses / konduktors CRUD
| ID | Task | Req | Status |
|---|---|---|---|
| P3-01 | `konduktors` + `buses` schema + update | BUS-01, KON-01 | ✅ |
| P3-02 | Konduktors CRUD (creates auth user + profile) | KON-02 | ✅ |
| P3-03 | Buses CRUD + assign / unassign konduktor | BUS-02,03 | ✅ |
| P3-04 | Admin screens for buses and konduktors | ADM-01 | ✅ |
| P3-05 | Fare settings + overrides API and admin screen | FARE-02,04 | ✅ |
| P3-06 | Tests (assignment uniqueness, role guards) | — | ✅ |

### P4 — Simulator + live map
| ID | Task | Req | Status |
|---|---|---|---|
| P4-01 | SSE spike through the Next → Hono bridge (confirm no buffering) | TRK-04 | ✅ |
| P4-02 | `bus_positions` + `simulator_state` schema + update | TRK-03,06 | ✅ |
| P4-03 | `BusPositionSource` interface + simulator implementation (pure movement logic, tested) | TRK-01,02 | ✅ |
| P4-04 | `bus-simulator-worker.ts` (writes + NOTIFY, follows `simulator_state`) | TRK-01 | ✅ |
| P4-05 | LISTEN singleton + SSE endpoint (snapshot then updates, poll fallback) | TRK-04 | ✅ |
| P4-06 | Passenger live map with smooth interpolation | TRK-05 | ✅ |
| P4-07 | Admin live map + start / stop / reset | ADM-02,05, TRK-06 | ✅ |
| P4-08 | Tests (movement, turnaround, dwell) | — | ✅ |

### P4b — Simulator enhancement (requested 16 Oct)
| ID | Task | Req | Status |
|---|---|---|---|
| P4b-01 | Line buses run automatically with the worker; start / stop / reset removed (`simulator_state` = heartbeat only) | TRK-01, TRK-06 | ✅ |
| P4b-02 | Dispatch: `bus_trips`, reserve-bus rules, `POST /tracking/dispatch`, worker runs trips non-stop and completes them | TRK-08 | ✅ |
| P4b-03 | Recall a dispatched bus; clean worker shutdown cancels open trips | TRK-09 | ✅ |
| P4b-04 | `tickets` table (schema part of P5-01) + `GET /stations/demand` (valid, sold today, by destination) | STN-06 | ✅ |
| P4b-05 | Seed: 2 reserve buses and demo tickets so the counts show data | PLT-09 | ✅ |
| P4b-06 | Bus details on click (list and map): came from, going to, next stop, progress; no passenger count | TRK-10 | ✅ |
| P4b-07 | Admin Live map rebuilt: dispatch card, station ticket badges, details with recall | ADM-02, ADM-05 | ✅ |
| P4b-08 | Tests: movement / trip logic, simulator, dispatch rules and races, demand counts, details UI (139 total) | — | ✅ |

### P5 — Tickets + mock payment
| ID | Task | Req | Status |
|---|---|---|---|
| P5-01 | `tickets`, `payments`, `payment_events` schema + update (+ insert-only guards) | TKT-02, PAY-05 | ✅ |
| P5-02 | Create / list / get / cancel ticket; Manila end-of-day `valid_until` | TKT-01,04,05,06 | ✅ |
| P5-03 | Payment adapter interface + `mock` provider (+ mock payment page) | PAY-01,08 | ✅ |
| P5-04 | Checkout endpoint | PAY-02 | ✅ |
| P5-05 | Webhook: signature verification, idempotency, amount check | PAY-03,04,06,07 | ✅ |
| P5-06 | `expire-tickets-worker.ts` | TKT-07 | ✅ |
| P5-07 | Purchase UI: buy → pay → return page polling status | PAS-04 | ✅ |
| P5-08 | Tests (transitions, replayed webhook, bad signature, amount mismatch, expiry) | — | ✅ |

### P5b — Konduktor-controlled buses (requested 16 Oct)
| ID | Task | Req | Status |
|---|---|---|---|
| P5b-01 | Crewed vs automatic buses; `bus_availability` (available at a station + expected departure, or on the road) | TRK-08, KON-04 | ✅ |
| P5b-02 | Simulator: crewed buses parked and spread along the line; konduktor trips run non-stop; arrival parks the bus (available); un-crewed buses run the line by themselves | TRK-01, TRK-08 | ✅ |
| P5b-03 | Konduktor API (own bus only, atomic): `my-bus`, expected departure, dispatch to the far end or a chosen station | KON-04, KON-05 | ✅ |
| P5b-04 | Konduktor page: status, departure buttons, dispatch with confirm, progress while on the road | KON-04, KON-05 | ✅ |
| P5b-05 | Buses waiting at stations: green ring on the map, "Buses at your station" panel, `/tracking/availability` | STN-07 | ✅ |
| P5b-06 | Admin Live map is monitoring only (dispatch and recall removed); station card shows tickets and waiting buses | ADM-05 | ✅ |
| P5b-07 | Fixed a real deadlock between the payment webhook and the expiry worker (inconsistent lock order) + stress test | D-23 | ✅ |
| P5b-08 | Tests: simulator (crewed / automatic / trips), konduktor rules, races, availability list, konduktor and station-panel UI (248 total) | — | ✅ |

### P5c — Konduktor map and own-bus-only view (requested 16 Oct)
| ID | Task | Req | Status |
|---|---|---|---|
| P5c-01 | Map on the konduktor page: tap a station to choose the destination, route and distance summary, in sync with the list; on the road it shows where the bus is headed | KON-06 | ✅ |
| P5c-02 | The on-the-road trip carries station ids (`my-bus`) so the map can mark them | KON-06 | ✅ |
| P5c-03 | A konduktor only ever receives their own bus: buses list, waiting-buses list and the live stream filtered on the server; no link to the all-buses map and `/` redirects them | KON-07 | ✅ |
| P5c-04 | Tests: konduktor map behaviour (8), visibility per role incl. the SSE stream (5), menu and redirect (6); 269 total | — | ✅ |

### P6 — QR + scanning
| ID | Task | Req | Status |
|---|---|---|---|
| P6-01 | QR token sign / verify (shared secret, constant-time) + QR PNG endpoint | QR-01,02,03 | ✅ |
| P6-02 | My Tickets page with QR + PNG download | TKT-05, QR-03,04 | ✅ |
| P6-03 | `scans` schema + update (insert-only) | SCN-04 | ✅ |
| P6-04 | Atomic scan service (valid / already_used / expired / invalid) | SCN-02,03,07 | ✅ |
| P6-05 | Scanner page (camera) + green / red result screen | SCN-01,05 | ✅ |
| P6-06 | Konduktor history (per day, counts) | SCN-06 | ✅ |
| P6-07 | PWA manifest + app-shell service worker | SCN-01 | ✅ |
| P6-08 | Tests (concurrent double scan, expired, forged token, own-scans-only) + admin scan log | ADM-04 | ✅ |

### P7 — ETA
| ID | Task | Req | Status |
|---|---|---|---|
| P7-01 | Shared ETA function + tests | ETA-01,03 | ✅ |
| P7-02 | `GET /eta/stations/:id` | ETA-02 | ✅ |
| P7-03 | Station detail panel: next buses + minutes | PAS-05 | ✅ |

### P8 — Real payment sandbox
| ID | Task | Req | Status |
|---|---|---|---|
| P8-01 | PisoPay adapter (session + token checkout, `hd` signature verify, event parsing), ported from e-Notary | PAY-01 | ✅ |
| P8-02 | Provider switch via env; setup doc for test mode / webhook tunnel | PAY-08 | ✅ |
| P8-03 | Contract tests with recorded payloads | — | ✅ |

### P9 — Email, dashboards, polish
| ID | Task | Req | Status |
|---|---|---|---|
| P9-01 | Mail adapter (`console`, `smtp`) | NTF-01 | ✅ |
| P9-02 | Email ticket on `paid` (non-blocking) | NTF-01,02 | ✅ |
| P9-03 | Admin dashboard: sales, tickets, passengers and scans per day, status breakdown, busiest trips | ADM-03 | ✅ |
| P9-04 | Seed polish (ten days of paid and used tickets, payments, scans), demo script | PLT-09 | ✅ |
| P9-05 | Final pass: README, demo checklist, `bun run smoke` | — | ✅ |

## 3. Beyond the POC

| Item | Notes |
|---|---|
| Real GPS from konduktor phones | Implement `konduktor-gps` `BusPositionSource` (`POST /tracking/position`); the simulator becomes dev-only. |
| Position history & replay | Time-series table or partitioning; analytics. |
| Multiple routes / route-aware tickets | Route table; stations belong to routes; ticket carries route; fare per route. |
| Discounts (student / senior / PWD) | Discount types, ID verification, fare rules per type. |
| Refunds | Provider refund API, ticket `refunded` status, finance reporting. |
| Offline scanning | Signed manifest cached on the device; reconcile on reconnect. |
| Native mobile apps | Reuse the `/api`; push notifications. |
| Seat / capacity management | Explicitly excluded now (GEN-01); only revisit if the business model changes. |
| Redis / S3 | Rate limiting, cache, ticket PDF storage when scale requires it. |
| Multi-tenant (several bus lines) | Tenant scope from the authenticated user, as in TaxTrail. |

## 4. Change Log

| Date | Change |
|---|---|
| 15 Oct 2026 | Plan documents drafted; awaiting approval before any code. |
| 15 Oct 2026 | P0 skeleton built: zones, aliases, ESLint boundaries, envelope + middleware, `system` module, SPA shell, DB scripts. `bun run check` and `bun run build` pass; API verified on `next start`. P0-06 stays 🟨 until `db:create` / `db:migrate` / `db:seed` are run against a real Postgres (local login pending). Tests run on `happy-dom` (jsdom 29 needs Node ≥ 20.19). |
| 15 Oct 2026 | P0 closed: `db:create`, `db:migrate:fresh`, `db:migrate`, `db:seed` verified against local PostgreSQL 16. Station scope changed from 26 generated stops to the **20 client shelters S1–S20** (real coordinates from the client spreadsheet); terminals have no coordinates in the file. |
| 15 Oct 2026 | P1 Auth done: users schema + update, register / login / logout / me, signed session cookie, `requireRole`, Origin check, login rate limit, deactivated-user handling, login / register pages, role guards and menus, `bootstrap-admin` + demo users in `db:seed`. 18 tests (incl. integration against a separate `<db>_test` database). DB password moved out of tracked files into `.env`. |
| 15 Oct 2026 | P2 Stations + map done: `stations` / `fare_*` schema + update, 20 client shelters seeded from `database/seeds/stations.seed.json` (only into an empty table), public station list with route distances (15.76 km S1→S20), fare quote API (₱15 + ₱2/station, override-aware), Leaflet map with numbered markers + route line, tap-or-dropdown trip picker with server fare, admin station page (drag to move, add on map, rename, reorder, activate, delete). 40 tests. Admin page verified by typecheck + API tests only (no browser click-through yet); passenger map verified with a headless screenshot. Fare override/settings admin UI stays in P3-05. |
| 15 Oct 2026 | P3 Buses / konduktors CRUD done: `konduktors` + `buses` schema + update (one bus per konduktor, one konduktor per bus enforced by UNIQUE), konduktor create/edit/deactivate/reset-password/delete (account + profile in one transaction), bus CRUD, assign/unassign with clear conflict messages, deactivating a konduktor frees their bus, konduktor `/me`, fare settings + fixed-fare overrides API and admin screens, demo fleet in `db:seed` (3 konduktors, 4 buses, 1 unassigned). 55 tests. UI driven end to end in headless Chrome (sign in as admin / konduktor, every admin page, no console errors). |
| 16 Oct 2026 | P4 Simulator + live map done. SSE spike passed first: events stream live through `next start` (also with `Accept-Encoding: gzip`), no buffering. Pure movement logic in `src/shared/tracking` (dwell, turnaround, multi-station steps), `BusPositionSource` interface + `SimulatorSource` (dependencies injected), `bus_positions` / `simulator_state`, `scripts/bus-simulator-worker.ts` (`bun run worker:simulator`), LISTEN/NOTIFY hub with poll fallback feeding `GET /api/tracking/stream`, admin Start / Stop / Reset with a "worker offline" warning, live buses on the passenger and admin maps with smooth gliding (measured: ~58 distinct drawn positions per 4 s vs ~4 if jumping), per-bus list. 99 tests. Decision: tracking reads are public (TRK-07 relaxed, see requirements). |
| 16 Oct 2026 | P4b done (requested enhancement): the simulator no longer has Start / Stop / Reset; the 4 line buses run by themselves with the worker. Admins dispatch a reserve bus between two stations (non-stop, then it leaves the map; recall supported). Admin Live map shows red per-station counts of valid tickets, sold-today and most-requested destination (counts only). Clicking a bus shows where it came from, where it is going, next stop and progress. Passenger count per bus deliberately not built (GEN-01 reworded to allow station counts only). `tickets` table created early. 139 tests; verified end to end in headless Chrome. |
| 16 Oct 2026 | P5 Tickets + mock payment done. Passengers buy from the map (server-computed, frozen fare; max 5 unpaid tickets) and pay on a demo gateway whose Pay / Fail buttons send a **signed webhook through the real webhook path**. A ticket becomes paid only from a verified, idempotent, amount-checked webhook (forged / tampered / stale / replayed events change nothing; five simultaneous copies apply once); money that cannot be applied is kept and flagged for admin review. Return page waits for confirmation and only reads; failed payments return with a clear message. Expiry worker (`bun run worker:expire`, or `bun run workers` with the simulator) expires unpaid tickets after 15 min and lapsed paid ones, closing open checkouts. Admin Payments page. Reference codes `BRT-XXXXXX`. 216 tests; verified end to end in headless Chrome (buy → pay → paid, fail → pay again, cancel, forged webhooks 401, live expiry). |
| 16 Oct 2026 | P5b done (requested): konduktors now control their own bus. A bus with a konduktor waits parked at a station (Available, with an expected departure time the konduktor sets) until the konduktor dispatches it to the far end of the line or a station they pick; it drives non-stop and becomes Available again at the destination by itself. Buses with no konduktor still run the line automatically. Passengers see which buses wait at each station (green ring, "Buses at your station", konduktor and departure time). Admin Live map is monitoring only; admin dispatch and recall are gone. Arrival ETAs stay in P7 (departure time is konduktor-entered and done now). Found and fixed a webhook-vs-expiry-worker deadlock (lock order) with a stress test. 248 tests; verified end to end in headless Chrome (passenger / konduktor / admin). |
| 16 Oct 2026 | P5c done (requested): the konduktor's "Dispatch to" now has a map (tap a station to choose, green = where the bus is, red = where it is headed, route and distance summary; on the road it shows the destination). Konduktors only ever see their own bus: filtered on the server for the buses list, the waiting-buses list and the live stream, and they no longer have a link to the all-buses map (`/` sends them to their own page). Verified on a phone-sized browser and against the raw API. 269 tests. |
| 16 Oct 2026 | P6 QR + scanning done. Each paid ticket has a signed QR (`v1.<ticketId>.<HMAC-SHA256>`, constant-time verified before any DB lookup) served as a private, no-store PNG to its owner only while paid; shown with Download PNG on the ticket page. Konduktors scan with the back camera (html5-qrcode) or type the reference code; a full-screen green / red result shows where the passenger gets off (never who they are). One conditional UPDATE under a row lock decides validity: 8 simultaneous scans give exactly one valid; used / expired / unpaid / cancelled / forged / unknown tickets are refused with a reason, and every attempt is stored in the insert-only `scans` table (the scanned token is never stored or logged). Konduktor history grouped per Manila day with counts; admin scan log with konduktor / bus / day / result filters. PWA: manifest, icons, app-shell service worker (production only, never touches /api). 315 tests; verified in headless Chrome with a fake camera feeding a ticket's real QR (valid → already used → history), plus the ticket page QR and admin log. Scanning needs https or localhost for the camera. |
| 16 Oct 2026 | Passenger station sheet + in-page dialogs (before P7). Tapping a shelter on the passenger map opens a sheet over the map: buses available there, where each is likely headed (the end of the line, which the konduktor can override at dispatch), expected departure, and buses on the way in; counts only, no konduktor name or passenger count. Every browser pop-up (`window.confirm`) is replaced by an accessible in-page dialog (`useConfirm`): the dispatch confirmation shows the route, distance and a no-recall warning; delete / cancel confirmations use the same dialog. 324 tests; verified in headless Chrome. Note: restart `next dev` after changing tracking code (the hot-reloaded hub can keep serving an old snapshot shape). |
| 16 Oct 2026 | P7 ETA done. Pure `src/shared/eta` (distance ÷ speed, plus a dwell at each intermediate stop for line buses; dispatched buses are non-stop; only stations ahead in the current direction) with unit tests. `GET /api/eta/stations/:id` (buses that will reach a station, soonest first) and `GET /api/eta/buses` (next station and end-of-run ETA per bus on the road); speed and dwell come from the simulator settings; a konduktor only gets their own bus. Passenger shelter sheet now has "Arriving soon" with minutes ("Arriving now" under 45 s); bus details show "Arrives at X" and "Reaches next stop". The progress bars (konduktor dispatch screen and bus details) are removed in favour of ETA. 347 tests; verified in headless Chrome (dispatch → 19 min to S20 on the konduktor screen, same bus listed on S20 sheet). |
| 16 Oct 2026 | P8 switched from PayMongo to **PisoPay** (what the team's senior asked for), ported from e-Notary's `PaymentService.php` / `PisoPayService.php`: redirect checkout (`GET /api/v1/session`, `POST /api/v1/token` with the frozen fare, trace number, customer, webhook + return URL, pay-by expiry), `hd` webhook signature (HMAC-SHA256 keyed by the timestamp over an `auth` prefix from the API credentials), only status 0 acted on. Same money rules as the mock (idempotent, amount-checked, review queue, webhook is the only way to paid). PayMongo code, script and doc removed; provider list is mock + pisopay (update 010). Deliberate differences from e-Notary: TLS verified, no request/response bodies logged, no verify/poll endpoints. 17 contract tests + 9 integration tests through the real webhook route with PisoPay's API stubbed. NOT yet run against PisoPay: needs credentials, a public https address, and answers to the open questions in `plan/pisopay-setup.md` (processor name, phone requirement, whether webhook amount includes fees). Embedded (OTC / QR reference) checkout not built.|
| 19 Oct 2026 | Two fixes from hands-on testing. (1) **Scanning is tied to the boarding shelter** (SCN-09): a paid ticket is accepted only by a konduktor whose bus is waiting (available) at the shelter where the ticket was bought; at another shelter the scan is refused as `wrong_station` ("Wrong shelter: this ticket boards at X, and your bus is at Y"), and while the bus is on the road, not on the map, or the konduktor has no bus, as `bus_not_at_station`. The ticket is not used up by a refused attempt, every attempt is still recorded, expired / used / unpaid tickets keep their own answers, and the bus's shelter is read under a lock so a dispatch cannot slip in between the check and the ticket being used. The scan page shows which shelter the bus is at; the result screen has WRONG SHELTER / BUS NOT AT A SHELTER headlines. (2) **Passenger map: where the bus is headed.** The konduktor's destination choice is saved at once as the bus's announced destination (update 012, `PUT /api/tracking/my-bus/destination`), so the shelter sheet says "Headed to X" (or "Likely headed to X" when not announced), with departure time and buses arriving; dispatch with no explicit station goes to the announced one; the announcement clears when the bus leaves or is parked again. Shelter names stay "Bus Shelter S1..S20": the client's workbook has no generic names for the shelters (only S1 to S20 plus hub assignments). 445 tests. |
| 19 Oct 2026 | **Shelter pop-up and tickets bought on a bus.** "Plan your trip" is gone: tapping a shelter opens a pop-up (sheet on a phone) listing the buses waiting there, each with where it is headed, when it leaves and (tap it) its trip, fare and a **Buy ticket** button, plus the buses arriving with when they arrive and when they leave again. A ticket is bought on a bus: its shelter and destination are the bus's (`headingTo`: announced destination, else far end), the fare is the server's, and it is for that bus only (update 013: `tickets.bus_id`/`bus_name`). Payment (QR Ph) then the ticket QR, which only that bus's konduktor can scan, only while the bus waits at the shelter it was bought at (`wrong_bus`). The bus cannot be sent or announced elsewhere once passengers hold tickets for its wait (tickets are counted from when it parked, `parked_at`). A konduktor can now time the departure from the shelter the bus is driving to (kept on arrival unless it has passed), so passengers see "arrives in 4 min, leaves about 10:40". 466 tests; verified in headless Chrome (tap shelter, pick bus, Buy, pay, ticket; another bus's konduktor refused, the right one accepted). |
| 19 Oct 2026 | **Real roads instead of straight lines.** The route between shelters is now the actual road (OSRM routing, stored per pair of neighbouring shelters in `route_segments`, update 014; fetched with `bun run routes:build`, or in the background by the simulator worker and after a shelter is added / moved / removed). One path along the road (`buildRoutePath`) drives everything that measures distance: the map line and the amber trip highlight, where each simulated bus is, ETAs and the shelter distances (the line is 27.09 km by road, was 15.76 km straight). A pair with no stored road, or whose shelter has moved since, falls back to a straight line, so nothing breaks while roads load. `GET /api/route` serves the path. The public OSRM demo server is development only. Also: shelter markers have a 44 px tap area, shelters sit above buses, and tapping a bus stopped at a shelter opens that shelter's pop-up. 500 tests. |
| 19 Oct 2026 | **Tickets for a group** (update 015, `tickets.quantity`): in a bus's offer the passenger sets how many are riding with a - / + stepper (1 to 10), sees the fare each and the total, and buys once on one account. One payment (fare x passengers, the amount check holds the group to the total), one QR code. Scanning admits the whole group once and the konduktor's green screen says "Admit 5 passengers"; the scan history, admin log, ticket list and ticket page show the party size. A group counts as one ticket towards the limit of unpaid tickets. Station demand counts are still tickets, not people. 520 tests; verified in headless Chrome (5 passengers, paid, other bus refused, owner admitted 5). |
| 19 Oct 2026 | **P9 done: email, dashboard, polish.** (1) Mail adapter (`console` default: sends nothing, logs one masked line, never the body or QR; `smtp` via nodemailer). (2) A paid ticket is emailed to its owner (trip, bus, passengers, total, valid until, the QR in the message and attached), sent in the background after the payment is committed, so a mail failure or hang can never touch the confirmation; the ticket page has **Email me this ticket** (own paid tickets, once a minute). (3) Admin dashboard: sales, tickets, passengers and scans today and over 7 / 14 / 30 days, a bar chart by day (sales / tickets / passengers, with a table view), where tickets ended up, busiest trips, and an alert when payments need review (`GET /api/admin/stats`; a ticket counts on the Manila day it was paid; sales are the money received). (4) `db:seed` adds ten days of paid and used tickets with payments and scans. (5) README rewritten, `plan/demo-script.md`, `plan/demo-checklist.md`, and `bun run smoke` (signs in as each role against a running system and checks the chain; changes nothing). 571 tests. |
| 19 Oct 2026 | **Admin pagination and the admin redesign.** (1) Admin lists (Buses, Konduktors, Payments, Scans) are paged on the server, 10 a page (max 50 a request; a page past the end returns the last page), with `/buses/options` and `/konduktors/options` for drop-downs; the konduktor scan history is 5 a page with per-day counts over the whole window; the Live map's bus list pages client-side. (2) The admin area follows `public/brt-design-handoff`: design tokens and Plus Jakarta Sans in `globals.css` (the shadcn names alias them, so light and dark follow), a new `AdminShell` (navy sidebar with Operations and Revenue groups, header with breadcrumb, theme toggle, user chip, Log out; a drawer on a phone), and Overview, Live map, Stations, Buses, Konduktors, Fares, Payments and Scans restyled with the real data, actions and Leaflet map kept. The sidebar's support line is generic until the client gives a contact (`[SUPPORT EMAIL]` in the handoff). Konduktor and passenger pages are still to be restyled (handoff in `konduktor/` and `passenger/`). |
| 20 Oct 2026 | **Passenger and konduktor redesign, and `/` goes to sign-in.** (1) `/` sends anyone not signed in straight to the sign-in page (which links to register); a konduktor still goes to their bus. (2) New frame for passengers and konduktors (`MemberShell`): navy side bar with the app's own subtitle on a wide screen; on a phone an app bar (avatar, name, role badge, theme toggle, log out) and a fixed bottom tab bar, with an amber count of unpaid tickets on My tickets. (3) Passenger: map page (full-screen map with floating hint and the unpaid-ticket shortcut on a phone, how-to-ride and key beside it on a wide screen), shelter pop-up (bottom sheet on a phone), bus cards, My tickets as ticket stubs with All / To pay / Ready / Past filters, the ticket view with the QR, the demo payment page. (4) Konduktor: My bus (orange hero, departure chips, profile, today's scan counts), a phone-only Dispatch screen at `/konduktor/dispatch` with a footer button (wide screens dispatch inline), Scan (viewfinder, bottom-sheet result), History (day summary, All / Valid / Rejected filter done on the server with `?result=`, paging). (5) Sign-in and register in the same look. Tests 597.
| 20 Oct 2026 | **Passenger count and Complete ride** (update 017, `ride_completions`, insert-only). A konduktor sees how many passengers are on their bus: the people on the valid scans since the last completed ride (a group ticket counts all its people), on My bus and above the camera on Scan. **Complete ride** (once the bus has arrived at a shelter, with passengers on board) records the ride and the count starts again from zero; scans are never deleted. `GET /api/scans/ride`, `POST /api/scans/ride/complete`. Tests 635.
