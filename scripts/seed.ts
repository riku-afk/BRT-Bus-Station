/**
 * Demo data (PLT-09). Filled in as domains arrive:
 *   P1 users · P2 stations + fare settings · P3 buses + konduktors · P5/P6 sample tickets and scans ·
 *   P9 ten days of ticket sales and scans, so the admin dashboard has something to show.
 * Idempotent: every block checks before inserting, so it is safe to run repeatedly.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../src/shared/demo/accounts';
import { computeFareCentavos } from '../src/shared/fares/fare';
import { generateReferenceCode } from '../src/server/lib/reference-code';
import { appEnv, databaseRoot, databaseUrl, withClient } from './lib/db';
import { ensureUser } from './lib/users';

if (appEnv === 'prod') {
  console.error('Refusing to load demo data when APP_ENV=prod.');
  process.exit(1);
}

await withClient(databaseUrl, async (client) => {
  let created = 0;
  for (const account of DEMO_ACCOUNTS) {
    if ((await ensureUser(client, { ...account, password: DEMO_PASSWORD })) === 'created') created++;
  }
  console.log(`seed: users — ${created} created, ${DEMO_ACCOUNTS.length - created} already present (password: ${DEMO_PASSWORD})`);

  // Stations: the client's bus shelters (database/seeds/stations.seed.json). Only when the table is empty,
  // so admin edits are never overwritten.
  const { n } = (await client.query<{ n: string }>('SELECT count(*) AS n FROM stations')).rows[0]!;
  if (Number(n) === 0) {
    const { stations } = JSON.parse(readFileSync(path.join(databaseRoot, 'seeds', 'stations.seed.json'), 'utf8')) as {
      stations: { name: string; sequence: number; latitude: number; longitude: number }[];
    };
    for (const st of stations) {
      await client.query('INSERT INTO stations (name, sequence, latitude, longitude) VALUES ($1, $2, $3, $4)', [
        st.name,
        st.sequence,
        st.latitude,
        st.longitude,
      ]);
    }
    console.log(`seed: stations — ${stations.length} created`);
  } else {
    console.log(`seed: stations — ${n} already present, left untouched`);
  }

  // Fleet: 3 konduktor profiles for the demo konduktor users and 7 buses. Buses 1-3 have a konduktor, so they wait parked
  // at a station until that konduktor dispatches them. Buses 4-7 have none and run the line by themselves.
  const konduktorUsers = DEMO_ACCOUNTS.filter((a) => a.role === 'konduktor');
  const phones = ['0917 100 0001', '0917 100 0002', '0917 100 0003'];
  const konduktorIds: string[] = [];
  for (const [i, account] of konduktorUsers.entries()) {
    const { rows: found } = await client.query<{ id: string }>(
      `INSERT INTO konduktors (user_id, employee_no, phone)
       SELECT id, $2, $3 FROM users WHERE email = $1
       ON CONFLICT (user_id) DO UPDATE SET user_id = EXCLUDED.user_id
       RETURNING id`,
      [account.email, `KND-00${i + 1}`, phones[i]],
    );
    konduktorIds.push(found[0]!.id);
  }
  const buses = [
    { plate: 'NCV 1101', name: 'Bus 1' },
    { plate: 'NCV 1102', name: 'Bus 2' },
    { plate: 'NCV 1103', name: 'Bus 3' },
    { plate: 'NCV 1104', name: 'Bus 4' },
    { plate: 'NCV 1105', name: 'Bus 5' },
    { plate: 'NCV 1106', name: 'Bus 6' },
    { plate: 'NCV 1107', name: 'Bus 7' },
  ];
  for (const [i, bus] of buses.entries()) {
    await client.query(
      `INSERT INTO buses (plate_number, name, konduktor_id) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [bus.plate, bus.name, konduktorIds[i] ?? null],
    );
  }
  console.log(`seed: fleet — ${konduktorIds.length} konduktors, ${buses.length} buses`);

  // Demo tickets, so the station counts on the admin Live map show real numbers. Added only when no valid paid ticket
  // exists (so real purchases are never mixed with, or duplicated by, the demo ones) and always valid until tonight.
  const valid = await client.query("SELECT 1 FROM tickets WHERE status = 'paid' AND valid_until > now() LIMIT 1");
  if (valid.rowCount === 0) {
    const stationRows = (await client.query<{ id: string; sequence: number }>('SELECT id, sequence FROM stations ORDER BY sequence')).rows;
    const passengers = (await client.query<{ id: string; email: string }>("SELECT id, email FROM users WHERE role = 'passenger' ORDER BY email")).rows;
    const fareRow = (await client.query<{ base: number; per: number }>('SELECT base_fare_centavos AS base, per_station_centavos AS per FROM fare_settings WHERE id = 1')).rows[0];
    if (stationRows.length >= 12 && passengers.length >= 2 && fareRow) {
      const at = (seq: number) => stationRows.find((r) => r.sequence === seq)!;
      // [passenger index, origin seq, destination seq, status]
      const demo: [number, number, number, string][] = [
        [0, 3, 12, 'paid'], [1, 3, 12, 'paid'], [0, 3, 20, 'paid'], [1, 3, 8, 'paid'],
        [0, 8, 1, 'paid'], [1, 8, 15, 'paid'],
        [0, 10, 15, 'paid'], [1, 10, 15, 'paid'], [0, 10, 18, 'paid'],
        [1, 1, 5, 'used'], [0, 6, 2, 'pending_payment'],
      ];
      for (const [p, o, d, status] of demo) {
        const fare = computeFareCentavos({ baseFareCentavos: fareRow.base, perStationCentavos: fareRow.per }, at(o).sequence, at(d).sequence);
        await client.query(
          `INSERT INTO tickets (reference_code, passenger_id, origin_station_id, destination_station_id, fare_centavos, status, valid_until, paid_at, used_at)
           VALUES ($1, $2, $3, $4, $5, $6,
                   (date_trunc('day', now() AT TIME ZONE 'Asia/Manila') + interval '1 day' - interval '1 second') AT TIME ZONE 'Asia/Manila',
                   CASE WHEN $6 = 'pending_payment' THEN NULL ELSE now() END,
                   CASE WHEN $6 = 'used' THEN now() ELSE NULL END)`,
          [generateReferenceCode(), passengers[p]!.id, at(o).id, at(d).id, fare, status],
        );
      }
      console.log(`seed: tickets — ${demo.length} demo tickets (valid until tonight, Asia/Manila)`);
    }
  } else {
    console.log('seed: tickets — valid tickets already exist, demo tickets not added');
  }

  // Ten days of history (P9), so the admin dashboard and scan log show a working week and not an empty system: paid tickets that were
  // scanned (and a few that never were), their payments, and the scans. Reference codes start BRT-HS, which is how this block knows it
  // has run; it never touches real purchases. Evidence tables are only ever inserted into.
  const hasHistory = await client.query("SELECT 1 FROM tickets WHERE reference_code LIKE 'BRT-HS%' LIMIT 1");
  if (hasHistory.rowCount === 0) {
    const stationRows = (await client.query<{ id: string; sequence: number }>('SELECT id, sequence FROM stations ORDER BY sequence')).rows;
    const passengers = (await client.query<{ id: string }>("SELECT id FROM users WHERE role = 'passenger' ORDER BY email")).rows;
    const crewed = (
      await client.query<{ bus_id: string; bus_name: string; konduktor_id: string }>(
        'SELECT b.id AS bus_id, b.name AS bus_name, b.konduktor_id FROM buses b WHERE b.konduktor_id IS NOT NULL ORDER BY b.name',
      )
    ).rows;
    const fareRow = (await client.query<{ base: number; per: number }>('SELECT base_fare_centavos AS base, per_station_centavos AS per FROM fare_settings WHERE id = 1')).rows[0];

    if (stationRows.length >= 20 && passengers.length >= 2 && crewed.length >= 1 && fareRow) {
      const at = (seq: number) => stationRows.find((r) => r.sequence === seq)!;
      const MANILA = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' });
      const todayKey = MANILA.format(new Date());
      const dayStart = (daysAgo: number) => new Date(new Date(`${todayKey}T00:00:00+08:00`).getTime() - daysAgo * 86_400_000);
      const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
      const code = (n: number) => 'BRT-HS' + [3, 2, 1, 0].map((p) => letters[Math.floor(n / letters.length ** p) % letters.length]).join('');

      // Where people board and where the buses go: a few busy shelters, mostly towards the ends of the line.
      const trips: [number, number][] = [[3, 20], [8, 20], [10, 1], [1, 12], [12, 20], [6, 1], [3, 12], [15, 1]];
      let n = 0;
      let tickets = 0;
      let scans = 0;
      for (let daysAgo = 10; daysAgo >= 1; daysAgo--) {
        const count = 3 + ((daysAgo * 7) % 5) + (daysAgo % 7 === 0 ? 3 : 0); // a little busier once a week
        for (let i = 0; i < count; i++) {
          n++;
          const [o, d] = trips[(n * 3) % trips.length]!;
          const bus = crewed[(n + daysAgo) % crewed.length]!;
          const quantity = n % 5 === 0 ? 2 + (n % 3) : 1; // now and then a family
          const unit = computeFareCentavos({ baseFareCentavos: fareRow.base, perStationCentavos: fareRow.per }, at(o).sequence, at(d).sequence);
          const paidAt = new Date(dayStart(daysAgo).getTime() + (6 * 60 + i * 47) * 60_000);
          const used = n % 8 !== 0; // about one in eight was never used
          const reference = code(n);
          const ticket = await client.query<{ id: string }>(
            `INSERT INTO tickets (reference_code, passenger_id, origin_station_id, destination_station_id, fare_centavos, quantity, status, valid_until,
                                   paid_at, used_at, created_at, bus_id, bus_name)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
            [
              reference,
              passengers[n % passengers.length]!.id,
              at(o).id,
              at(d).id,
              unit * quantity,
              quantity,
              used ? 'used' : 'expired',
              new Date(dayStart(daysAgo).getTime() + 86_400_000 - 1000),
              paidAt,
              used ? new Date(paidAt.getTime() + 12 * 60_000) : null,
              new Date(paidAt.getTime() - 3 * 60_000),
              bus.bus_id,
              bus.bus_name,
            ],
          );
          tickets++;
          await client.query(
            `INSERT INTO payments (ticket_id, provider, provider_ref, method, amount_centavos, checkout_url, status, created_at, updated_at)
             VALUES ($1, 'mock', $2, 'gcash', $3, '/pay/mock/seed', 'succeeded', $4, $4)`,
            [ticket.rows[0]!.id, `seed_${reference}`, unit * quantity, paidAt],
          );
          if (used) {
            await client.query(
              "INSERT INTO scans (ticket_id, konduktor_id, bus_id, result, reason, scanned_at) VALUES ($1, $2, $3, 'valid', NULL, $4)",
              [ticket.rows[0]!.id, bus.konduktor_id, bus.bus_id, new Date(paidAt.getTime() + 12 * 60_000)],
            );
            scans++;
            // Someone scans the same ticket again now and then: refused as already used.
            if (n % 6 === 0) {
              await client.query(
                "INSERT INTO scans (ticket_id, konduktor_id, bus_id, result, reason, scanned_at) VALUES ($1, $2, $3, 'already_used', NULL, $4)",
                [ticket.rows[0]!.id, bus.konduktor_id, bus.bus_id, new Date(paidAt.getTime() + 15 * 60_000)],
              );
              scans++;
            }
          }
        }
        // And a code that was not a ticket at all.
        const bus = crewed[daysAgo % crewed.length]!;
        await client.query(
          "INSERT INTO scans (ticket_id, konduktor_id, bus_id, result, reason, scanned_at) VALUES (NULL, $1, $2, 'invalid', 'bad_token', $3)",
          [bus.konduktor_id, bus.bus_id, new Date(dayStart(daysAgo).getTime() + 9 * 3_600_000)],
        );
        scans++;
      }
      console.log(`seed: history — ${tickets} paid tickets over 10 days with their payments, and ${scans} scans`);
    }
  } else {
    console.log('seed: history — already present, left untouched');
  }
});
