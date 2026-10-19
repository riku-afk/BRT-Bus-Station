# Demo script (about 15 minutes)

Three browser windows work best: a phone-size one for the passenger, a phone-size one for the konduktor, and a wide one for the admin. Password for every demo account: `Demo1234!`. Run through [demo-checklist.md](demo-checklist.md) first.

## 1. The map (passenger, 2 min)

1. Open the app signed out. The map shows the 20 shelters on the **real road** (blue line), buses gliding along it, and a green ring on shelters with a bus waiting.
2. Tap a shelter with a green ring. The pop-up lists the buses waiting there, **where each is headed**, **when it leaves**, and the buses **arriving** with minutes and when they leave again.
3. Tap a bus: its trip, the fare and a **Buy ticket** button. Signed out, it asks to sign in.

## 2. Buy a ticket (passenger, 3 min)

1. Sign in as `passenger1@brt.test`. Tap a shelter with a waiting bus and tap the bus.
2. Use **+** to make it a family of four: the total updates. Press **Buy 4 tickets**.
3. You land on the ticket page with a **QR Ph** code and a countdown (15 minutes). With the mock gateway you are taken to the demo payment page instead: press **Pay**.
4. The ticket turns paid on its own and shows the ticket QR, "One scan admits all 4 of you", and **Email me this ticket** (with the console mail provider nothing is really sent).

## 3. The konduktor (4 min)

1. Sign in as the konduktor of that bus (Bus 1 is `konduktor1@brt.test`). **My bus** shows where it waits. Choose a destination by tapping a shelter on the map: passengers at that shelter see "Headed to ..." at once. Set a departure time ("In 10 min" or a clock time).
2. Open **Scan**. Point the camera at the ticket QR (or type the reference code). The screen turns green: **VALID, Admit 4 passengers**, and where they get off.
3. Scan it again: red, **ALREADY USED at 10:42 AM**.
4. Show the refusals: another bus's konduktor gets **WRONG BUS**; at another shelter **WRONG SHELTER**; while the bus is on the road **BUS NOT AT A SHELTER**.
5. **Dispatch** the bus (a confirmation pop-up shows the route). On the road the screen shows **Arrives at ... in N min** and lets the konduktor time the next departure.

## 4. The admin (4 min)

1. Sign in as `admin@brt.test`. The dashboard: sales today, tickets, passengers, scans, a bar chart by day (switch Sales / Tickets / Passengers, 7 / 14 / 30 days, **Show as table**), where tickets ended up, the busiest trips.
2. **Live map**: every bus with details and its konduktor, tickets bought at each shelter. Admins monitor; they cannot dispatch.
3. **Scans**: filter by konduktor, bus, day and result. **Payments**: anything that could not be applied to a ticket is flagged here (and on the dashboard).

## 5. Things worth saying out loud

- A ticket is only paid from a verified payment notice, and the amount has to match the fare; a forged or wrong-amount notice changes nothing and is kept for review.
- Tickets are for one bus, one shelter, one scan. A bus cannot be sent anywhere else once passengers have paid for its trip.
- Evidence (payments, scans) is never edited or deleted.
- Email and payment problems never block each other: a mail failure cannot undo a confirmed payment.
