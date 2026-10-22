import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Session, setupTestApp } from './helpers';

/**
 * The passenger count on a konduktor's bus, and completing the ride: the count is the people on the valid scans since the last
 * completed ride; completing it (once the bus has arrived) starts the count again from zero without deleting anything.
 */

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
let qr: typeof import('@lib/qr-token');
let pax: Session;
let kond1: Session; // bus 1
let kond2: Session; // bus 2
const anon = () => new Session({ request: (p, i) => ctx.api.request(p, i) });
const db = () => ctx.db.getDb();
const st: string[] = [];
const ids: Record<string, string> = {};

type Ride = {
  passengers: number;
  tickets: number;
  since: string | null;
  atShelter: string | null;
  canComplete: boolean;
  mustCompleteBeforeDispatch: boolean;
  unfinishedPassengers: number;
};

const parkBus = (busId: string, shelter: string | null) =>
  db().query(
    `INSERT INTO bus_availability (bus_id, station_id, status) VALUES ($1, $2, $3)
     ON CONFLICT (bus_id) DO UPDATE SET station_id = $2, status = $3, expected_departure_at = NULL, planned_destination_id = NULL, parked_at = now(), updated_at = now()`,
    [busId, shelter ?? st[0], shelter ? 'available' : 'on_road'],
  );
/** A paid ticket for `quantity` people on bus 1, scanned by its konduktor. Returns the scan result. */
async function boardGroup(quantity: number, scanner = kond1) {
  const ticket = (await pax.call('POST', '/tickets', { busId: ids.bus1, quantity })).body.data as { id: string };
  const checkout = (await pax.call('POST', `/tickets/${ticket.id}/checkout`)).body.data as { checkoutUrl: string };
  await anon().call('POST', `/payments/mock/sessions/${checkout.checkoutUrl.replace('/pay/mock/', '')}/complete`, { outcome: 'paid', method: 'gcash' });
  const scanned = (await scanner.call('POST', '/scans', { token: qr.signTicketToken(ticket.id) })).body.data as { result: string };
  return { ticketId: ticket.id, result: scanned.result };
}
const ride = async (s: Session) => (await s.call('GET', '/scans/ride')).body.data as Ride;

beforeAll(async () => {
  ctx = await setupTestApp();
  qr = await import('@lib/qr-token');
  const { authService } = await import('@modules/auth');
  await authService.createUser({ email: 'admin@t.test', password: 'Password123', fullName: 'Admin', role: 'admin' });
  await authService.createUser({ email: 'pax@t.test', password: 'Password123', fullName: 'Pax', role: 'passenger' });
  const signIn = async (email: string) => {
    const s = anon();
    await s.call('POST', '/auth/login', { email, password: 'Password123' });
    return s;
  };
  const admin = await signIn('admin@t.test');
  pax = await signIn('pax@t.test');
  for (const [i, n] of ['A', 'B', 'C'].entries()) st.push((await admin.call('POST', '/stations', { name: n, latitude: 14 + i * 0.01, longitude: 121 })).body.data.id);
  ids.bus1 = (await admin.call('POST', '/buses', { plateNumber: 'R 1', name: 'Bus One' })).body.data.id;
  ids.bus2 = (await admin.call('POST', '/buses', { plateNumber: 'R 2', name: 'Bus Two' })).body.data.id;
  for (const n of [1, 2]) {
    const made = await admin.call('POST', '/konduktors', { email: `kond${n}@t.test`, password: 'Password123', fullName: `Konduktor ${n}`, employeeNo: `K-${n}` });
    await admin.call('PUT', `/buses/${ids[`bus${n}`]}/konduktor`, { konduktorId: made.body.data.id });
  }
  kond1 = await signIn('kond1@t.test');
  kond2 = await signIn('kond2@t.test');
}, 120_000);

beforeEach(async () => {
  await parkBus(ids.bus1!, st[0]!);
  await parkBus(ids.bus2!, st[0]!);
});

afterAll(async () => {
  await ctx?.close();
});

describe('the passenger count', () => {
  it('starts at zero, and the ride cannot be completed with nobody on board', async () => {
    expect(await ride(kond1)).toEqual({ passengers: 0, tickets: 0, since: null, atShelter: 'A', canComplete: false, mustCompleteBeforeDispatch: false, unfinishedPassengers: 0 });
    const res = await kond1.call('POST', '/scans/ride/complete');
    expect(res.status).toBe(409);
    expect(res.body.error?.message).toMatch(/no passengers/i);
  });

  it('counts every person on a valid scan: a group ticket counts all its people', async () => {
    expect((await boardGroup(3)).result).toBe('valid');
    expect((await boardGroup(1)).result).toBe('valid');
    expect(await ride(kond1)).toMatchObject({ passengers: 4, tickets: 2, since: null, atShelter: 'A', canComplete: true });
  });

  it('does not count a ticket scanned twice, a refused scan, or somebody else\'s bus', async () => {
    const { ticketId } = await boardGroup(2);
    const before = await ride(kond1);
    const again = (await kond1.call('POST', '/scans', { token: qr.signTicketToken(ticketId) })).body.data as { result: string };
    expect(again.result).toBe('already_used');
    await kond1.call('POST', '/scans', { referenceCode: 'BRT-NOPE00' });
    expect((await ride(kond1)).passengers).toBe(before.passengers);
    // the other konduktor's bus has its own count
    expect((await ride(kond2)).passengers).toBe(0);
    expect((await boardGroup(1, kond2)).result).toBe('invalid'); // a ticket for bus 1 is refused on bus 2
    expect((await ride(kond2)).passengers).toBe(0);
  });
});

describe('completing the ride', () => {
  it('is refused while the bus is still on the road', async () => {
    await boardGroup(2);
    await parkBus(ids.bus1!, null);
    expect(await ride(kond1)).toMatchObject({ atShelter: null, canComplete: false });
    const res = await kond1.call('POST', '/scans/ride/complete');
    expect(res.status).toBe(409);
    expect(res.body.error?.message).toMatch(/still on the road/i);
    expect((await ride(kond1)).passengers).toBeGreaterThan(0); // nothing was cleared
  });

  it('clears the count to zero without deleting any scan, and the next scans start the count again', async () => {
    await boardGroup(2);
    const total = (await ride(kond1)).passengers;
    const scansBefore = Number((await db().query<{ n: string }>('SELECT count(*) AS n FROM scans WHERE bus_id = $1', [ids.bus1]))[0]!.n);

    const done = await kond1.call('POST', '/scans/ride/complete');
    expect(done.status).toBe(200);
    expect(done.body.data).toMatchObject({ passengers: total });
    expect(await ride(kond1)).toMatchObject({ passengers: 0, tickets: 0, canComplete: false });
    expect(done.body.data.completedAt).toBe((await ride(kond1)).since);

    // the history is intact
    expect(Number((await db().query<{ n: string }>('SELECT count(*) AS n FROM scans WHERE bus_id = $1', [ids.bus1]))[0]!.n)).toBe(scansBefore);
    const row = (await db().query<{ passengers: number; tickets: number }>('SELECT passengers, tickets FROM ride_completions WHERE bus_id = $1 ORDER BY completed_at DESC LIMIT 1', [ids.bus1]))[0]!;
    expect(row.passengers).toBe(total);

    // the next boarding starts from zero
    await boardGroup(5);
    expect(await ride(kond1)).toMatchObject({ passengers: 5, tickets: 1, canComplete: true });
  });

  it('is for konduktors only, and a completion can never be changed or deleted', async () => {
    expect((await anon().call('GET', '/scans/ride')).status).toBe(401);
    expect((await pax.call('GET', '/scans/ride')).status).toBe(403);
    expect((await pax.call('POST', '/scans/ride/complete')).status).toBe(403);
    await boardGroup(1);
    expect((await kond1.call('POST', '/scans/ride/complete')).status).toBe(200);
    await expect(db().query('UPDATE ride_completions SET passengers = 0')).rejects.toThrow(/insert-only/);
    await expect(db().query('DELETE FROM ride_completions')).rejects.toThrow(/insert-only/);
  });
});

describe('dispatching after a ride', () => {
  const dispatch = (s: Session) => s.call('POST', '/tracking/my-bus/dispatch', {});

  // Start every test from a clean count: complete whatever an earlier test left on the buses (nothing to complete is a harmless 409).
  beforeEach(async () => {
    // A trip left active by an earlier test would make the next dispatch fail with "already on the road".
    await (await import('@modules/tracking/tracking.service')).trackingService.cancelActiveTrips();
    await kond1.call('POST', '/scans/ride/complete');
    await kond2.call('POST', '/scans/ride/complete');
  });

  it('is not blocked by passengers who boarded at the shelter the bus is waiting at now', async () => {
    await boardGroup(2); // scanned after the bus parked here: they are leaving with it
    expect(await ride(kond1)).toMatchObject({ passengers: 2, mustCompleteBeforeDispatch: false, unfinishedPassengers: 0 });
    expect((await dispatch(kond1)).status).toBe(201);
  });

  it('is refused when the bus has arrived and the last ride was not completed, and allowed once it is', async () => {
    await boardGroup(3); // boarded at the first shelter
    await parkBus(ids.bus1!, st[1]!); // the bus drove on and arrived at the next one
    expect(await ride(kond1)).toMatchObject({ passengers: 3, canComplete: true, mustCompleteBeforeDispatch: true, unfinishedPassengers: 3 });

    const refused = await dispatch(kond1);
    expect(refused.status).toBe(409);
    expect(refused.body.error?.message).toMatch(/Complete your ride first.*3 passengers/);

    expect((await kond1.call('POST', '/scans/ride/complete')).status).toBe(200);
    expect(await ride(kond1)).toMatchObject({ passengers: 0, mustCompleteBeforeDispatch: false, unfinishedPassengers: 0 });
    expect((await dispatch(kond1)).status).toBe(201);
  });

  it('only counts the bus itself: another konduktor with no unfinished ride can dispatch', async () => {
    await boardGroup(1);
    await parkBus(ids.bus1!, st[1]!);
    expect((await dispatch(kond1)).status).toBe(409);
    expect((await dispatch(kond2)).status).toBe(201);
  });
});
