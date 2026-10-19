# Before you present

Run these in order; each takes a minute or less.

- [ ] `bun run db:migrate` is up to date (it prints "applied" only for new updates).
- [ ] `bun run db:seed` has run once: demo users, the 20 shelters, buses, a week of sales and scans.
- [ ] `bun run routes:build` has run: the route follows real roads (needs internet once).
- [ ] `bun run dev` is running, and `bun run workers` in a second terminal (the simulator and the ticket expiry).
- [ ] **`bun run smoke` passes.** It signs in as each role and checks the chain. Fix anything it reports before presenting.
- [ ] `.env`: `PAYMENT_PROVIDER=mock` for an offline demo. For PisoPay: credentials set, `APP_BASE_URL` is a public https address, the tunnel is up, and the app is opened through that address (see [pisopay-setup.md](pisopay-setup.md)).
- [ ] The konduktor's bus is **waiting at a shelter** (Available). If it is on the road, wait for it to arrive.
- [ ] A phone (or browser) with a camera is ready for scanning: camera access needs https or localhost.
- [ ] `bun run check` is green if code changed since the last demo.

## If something looks wrong

| You see | Do |
|---|---|
| No buses on the map | Start `bun run workers`. |
| Buses on a straight line | `bun run routes:build`, then restart the workers. |
| Passenger sees no bus at a shelter | The konduktor's bus is on the road, or the workers are not running. |
| Payment never completes (PisoPay) | PisoPay cannot reach `APP_BASE_URL`: use the tunnel address. The page also asks PisoPay itself every few seconds. |
| Scan says WRONG SHELTER / WRONG BUS | The ticket was bought for another bus or shelter: that is the rule working. |
| Dashboard is empty | `bun run db:seed` adds a week of history (it never overwrites real data). |
