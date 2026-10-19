# BRT Bus Station: handoff (written Fri 16 Oct 2026, to continue Mon 19 Oct)

Nothing is committed (standing rule: the user commits when they say so). `bun run check` passed with **412 tests** at the last run; `bun run build` passed earlier in the day.

## Where the project stands

| Phase | State |
|---|---|
| P0 to P5c | done (skeleton, auth, stations + map, fleet, simulator + live map, tickets + mock payment, konduktor-controlled buses, own-bus-only view) |
| P6 QR + scanning | done: signed ticket QR, camera scanner, green/red result, history, admin scan log, PWA. Browser-verified with a fake camera. |
| Passenger shelter sheet, in-page confirm dialogs, custom departure time | done |
| P7 ETA | done: shared ETA function, `/api/eta/*`, progress bars replaced by ETA |
| P8 payments | **PisoPay QR Ph built and tested with stubs; NOT yet verified in a browser and NOT run against real PisoPay** (see below) |
| P9 email, dashboards, polish | not started |

## What we were in the middle of: PisoPay QR Ph (embedded flow)

The senior wants **PisoPay** (not PayMongo, which was removed). Latest request: do not redirect to PisoPay's page. When a passenger buys a ticket, show a **QR Ph code in our app**, with the amount already in it and the **QR Ph logo in the middle**; check payment status with PisoPay's inquire endpoint. Use channel **QR1** first, **QR2 / QR3 as fallbacks**.

### Built (all in the repo)

- `src/server/integrations/payment/pisopay.provider.ts`: session -> token -> transaction (`payment_channel_code` QR1/QR2/QR3, with the `hd`/`hd2` pair), returns `referenceNo` and the EMV `qr` string. A channel that just failed is tried last for 5 minutes. `inquire()` uses `GET /api/v1/transaction/reference/{referenceNo}` (by trace number as a fallback). Transaction status: 0 paid, 1 pending, 2 cancelled, 3 failed/expired. The webhook (`hd` signature, as in e-Notary) still works too.
- The webhook and the status check use the **same event id** for one payment, so whichever arrives second is a harmless `duplicate`. Both go through `settleEvent` in `payments.service.ts` (ticket locked before payment, idempotent, amount must equal the fare). Paid amount = `amount - fees`.
- `src/server/lib/qrph-image.ts`: QR PNG at error correction H with the logo composited in the centre (tested: still scans). Logo: the official QR Ph mark at `public/logo/qr-ph_logo.png` (supplied by the user 19 Oct).
- DB: `database/updates/010-pisopay.sql` (provider list = mock, pisopay) and `011-payment-qr.sql` (payments get `qr_payload`, `provider_reference_no`, `channel_code`, write-once via the guard trigger). Both applied to the dev DB; schema file mirrored.
- API: `GET /api/tickets/:id/payment` (status; also asks PisoPay, at most every 2.5 s per payment) and `GET /api/tickets/:id/payment-qr.png` (owner only, only while awaiting payment). `POST /api/tickets/:id/checkout` now returns `hasQr` and `checkoutUrl = /tickets/:id`.
- Client: `features/payments/pay-with-qr.tsx` (the "Pay with QR Ph" card on the ticket page: QR, amount, reference, countdown, download, polls every 3 s). The ticket page shows it while the ticket is pending and a QR exists.
- Env: `PAYMENT_PROVIDER`, `PISOPAY_BASE_URL`, `PISOPAY_API_USERNAME`, `PISOPAY_API_PASSWORD`, `PISOPAY_PROCESSOR_NAME` (default `BRTBusStation`), `PISOPAY_QR_CHANNELS` (default `QR1,QR2,QR3`). The app refuses to start with `pisopay` and no username/password.
- Tests: 31 provider contract tests, 22 integration tests (checkout, fallback, QR image decodes to the payload, owner-only, status check, webhook + status check = one payment, fees, forged/tampered webhooks), QR image tests, client component test. `setupTestApp()` now forces `PAYMENT_PROVIDER=mock` so tests never depend on the developer's `.env`.

### Not done yet (start here Monday)

1. **Browser check of the QR flow** (the step I was about to run when we stopped). Tools are saved in `plan/handoff-tools/`:
   - `fake-pisopay.mjs`: a stand-in PisoPay on :3300 (session, token, transaction with a valid-looking EMV QR for the real amount, inquire; `POST /fake/pay?ref=<referenceNo>` marks it paid). `FAKE_DOWN=QR1` makes a channel refuse, to see the fallback.
   - `qrph-e2e.mjs`: headless Chrome script (CDP): login as passenger1, pick shelters 3 and 9, Buy, screenshot the QR page, mark paid on the fake, wait for "Payment received". Copy both to a scratch folder, adjust the paths at the top, run with `bun`.
   - Run a **second** dev server for it so the normal one is untouched: `PAYMENT_PROVIDER=pisopay PISOPAY_BASE_URL=http://localhost:3300 PISOPAY_API_USERNAME=fake PISOPAY_API_PASSWORD=fake APP_BASE_URL=http://localhost:3200 NEXT_DIST_DIR=.next-e2e bunx next dev -p 3200`. **Afterwards** remove `.next-e2e` and check `tsconfig.json` / `next-env.d.ts` for `.next-e2e` lines (Next adds them; I cleaned them once already).
   - Things to look at: the QR renders with the logo and is scannable, the amount shown is right, the page flips to paid on its own, no console errors, phone-size layout, and what happens when the QR expires or the ticket is cancelled.
2. **Stale docs** (they still describe the earlier *redirect* design): `plan/pisopay-setup.md` (rewrite for the QR flow: embedded steps, channels, inquire, the questions below), the `P8` change-log row and `P8-01` task text in `plan/roadmap.md`, `PAY-01` wording in `plan/requirements.md`, `ARCHITECTURE.md` line on payment adapters. README does not mention payments.
3. **Tidy `.env`**: it has `PAYMENT_PROVIDER=pisopay` twice (lines 17 and 24) and `PAYMENT_WEBHOOK_SECRET` (only the mock uses it). Because it selects `pisopay`, the dev server needs the PisoPay username/password set (they are) and will call the real PisoPay when a ticket is bought. Use `PAYMENT_PROVIDER=mock` for offline work.
4. Optional polish noticed: the ticket page still has the old "Confirming your payment..." return-page logic (harmless, used by other providers); no UI yet for PisoPay's other channel (PPC / over the counter).

### Questions for the senior / PisoPay (none answered yet)

- **IP whitelisting**: PisoPay's guide says our server's IP must be whitelisted for the test and live URLs. A local dev machine or tunnel will not work until that is done. Ask for the **test** base URL and credentials.
- `processor_name`: e-Notary hardcodes `eNotary`. What should this system send? (Default `BRTBusStation` is a guess.)
- Are **QR1, QR2, QR3 all activated** on the merchant account? ("Codes are issued by PisoPay and subject to activation.")
- Is `customer_phone` required? Passengers have no phone on file; we send an empty string.
- Does the webhook/inquiry `amount` include `fees`/`otherFeesTotal`? We treat fare = amount - fees; the sample showed fees 0.00.
- Minimum amount; expiry timezone (we send Manila time `YYYY-MM-DD HH:mm:ss`); a captured sandbox webhook and inquire response to replace the sample payloads in the tests.
- The user wrote the inquire path as `/pisopay/inquire/reference/{reference_number}`; PisoPay's guide documents `/api/v1/transaction/reference/{reference_no}` (same as e-Notary), which is what we call. Confirm with the senior if theirs is a different proxy.
- Webhook payload format and signature are only known from e-Notary's PHP, not from PisoPay's published guide (its "Webhooks" page was not reachable).

## Changes made Mon 19 Oct (after the handoff above was written)

- Official QR Ph logo from `public/logo/qr-ph_logo.png` is now embedded in the payment QR (placeholder removed).
- 15-minute payment window enforced on the server as well as the worker; the ticket page sends the passenger back when it runs out.
- **Scanning is tied to the boarding shelter** (a ticket bought at shelter 2 only scans on a bus waiting at shelter 2; reasons `wrong_station`, `bus_not_at_station`; see roadmap row 19 Oct).
- **Konduktor announces where the waiting bus is headed** (update 012, `PUT /api/tracking/my-bus/destination`); the passenger shelter sheet shows "Headed to X".
- Shelter names unchanged: the workbook has no generic names for S1 to S20 (decision pending with the user: optionally add a "near Imus Terminal" subtitle from the hub-assignment sheet).
- Tests: 445 passing. The scans integration fixtures now park two crewed buses at shelter A; a konduktor without a bus (kond3) cannot validate tickets.

## Changes made Mon 19 Oct, second batch

- **Passenger map redesigned**: no "Plan your trip" card. Tapping a shelter opens a pop-up (`features/tracking/shelter-dialog.tsx`): waiting buses (headed to, leaves, tap for fare + **Buy ticket**), arriving buses (ETA, from/to, when they leave again).
- **Tickets are bought on a bus** (`POST /tickets {busId}`, update 013). The ticket is for that bus only (`wrong_bus`), at the shelter it was bought at. The old two-station form still works and makes a bus-less ticket.
- **Destination lock**: once passengers hold tickets on a bus for its current wait, its konduktor cannot announce/dispatch anywhere else.
- **Konduktors can time the departure from the shelter the bus is driving to** (shown to passengers there).
- Lines buses (no konduktor) appear only in "Arriving soon" and cannot be bought on.
- Open question for the user: tickets bought on a bus that is dispatched before they are scanned stay paid but unusable unless that bus parks at the same shelter again; there is no refund flow yet.

## Changes made Mon 19 Oct, third batch

- **Roads, not straight lines**: `route_segments` (update 014) holds the OSRM road between each pair of neighbouring shelters; `routeService.path()` stitches them into one path used by the map, the simulator, ETA and shelter distances. `bun run routes:build` (`-- --force` to refetch). `ROUTING_PROVIDER=osrm|none`, `OSRM_BASE_URL`. **The public OSRM demo server is development only**: use your own OSRM or another routing service in production. The simulator worker must be **restarted** to drive along the roads.
- The road follows one carriageway (OSRM driving direction); both directions share the line.
- Map taps: shelter markers 44 px tap area, above buses; tapping a bus stopped at a shelter opens that shelter.

## Group tickets (19 Oct, fourth batch)

- `tickets.quantity` (update 015): one purchase for up to 10 passengers; `fare_centavos` stays the total paid. Stepper in the bus offer; one QR admits everyone once; scan result says "Admit N". A group is one ticket for the unpaid-ticket limit. Station demand counts still count tickets, not people (decide if you want people).
- No partial boarding: the first scan uses up the whole ticket.

## P9 (19 Oct, fifth batch)

- Mail: `MAIL_PROVIDER=console|smtp` (`SMTP_*`, `MAIL_FROM`). Paid ticket emailed in the background; `POST /api/tickets/:id/email` resends. Nothing is really sent until you set smtp.
- Dashboard: `GET /api/admin/stats?days=7|14|30`; `/admin` home page.
- `bun run db:seed` adds ten days of history (reference codes `BRT-HS....`); `bun run smoke` checks a running system; `plan/demo-script.md` and `plan/demo-checklist.md`.
- Roadmap: all phases P0 to P9 are built. What is left is outside the POC: PisoPay against the real gateway, SMTP against a real mail server, a production routing service, real GPS positions.

## UI: side navigation (19 Oct)

- `AppShell` now has a side navigation bar (fixed column on a wide screen, a drawer behind a menu button on a phone) instead of links in a header; the user, sign out, theme toggle and version label are at the bottom of the bar. A visitor who is not signed in sees Map and Sign in.

## Other decisions and rules worth remembering

- Do not commit until told. Stations are exactly the client's 20 shelters. DB password only in the gitignored `.env`. The PoC banner is hidden on purpose.
- No passenger count per bus (counts per station are fine). Admins monitor only (cannot dispatch). Konduktors see only their own bus, everywhere (list, SSE, ETA).
- A ticket becomes paid only through `settleEvent` (a verified webhook, or PisoPay's own answer to our authenticated status check), always with the amount equal to the frozen fare.
- After changing tracking server code, **restart `next dev`** (the hot-reloaded live feed can keep an old shape).
- The browser tests used headless Chrome driven over CDP from small Bun scripts (not kept in the repo, except the two in `plan/handoff-tools/`). Camera tests used an ffmpeg-made `.y4m` of a ticket's QR with Chrome's fake-device flags.
- Tooling quirks: large bash heredocs with quotes often fail here; write files with the Write tool or a script file. Many files use CRLF line endings: patch scripts must normalise `\r\n` first.

## Demo logins (seeded, password `Demo1234!`)

`admin@brt.test`, `konduktor1@brt.test` to `konduktor3@brt.test`, `passenger1@brt.test`, `passenger2@brt.test`. Start with `bun run dev` and `bun run workers` (simulator + ticket expiry).

## Next up after the QR Ph check

P9: email notifications, dashboards, polish (see `plan/roadmap.md`).
