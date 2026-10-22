import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { Session, setupTestApp } from './helpers';

/**
 * Buying a ticket on a bus that is waiting at a shelter: what the passenger is shown, what the ticket is for, who may scan
 * it, and why the bus cannot be sent anywhere else once passengers have paid.
 */

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
let qr: typeof import('@lib/qr-token');
let admin: Session;
let pax1: Session;
let pax2: Session;
let kond1: Session; // bus 1
let kond2: Session; // bus 2
const anon = () => new Session({ request: (p, i) => ctx.api.request(p, i) });
const db = () => ctx.db.getDb();

const st: string[] = []; // shelters A, B, C, D
const ids: Record<string, string> = {};

type Scan = { result: string; reason: string | null; message: string };
type Bus = { busName: string; service: string; headingToId: string | null; headingToName: string | null; plannedDestinationId: string | null; expectedDepartureAt: string | null; originStationId: string | null };

/** Park a bus at a shelter as available (a fresh wait), or put it on the road. */
const parkBus = (busId: string, shelter: string | null) =>
  db().query(
    `INSERT INTO bus_availability (bus_id, station_id, status) VALUES ($1, $2, $3)
     ON CONFLICT (bus_id) DO UPDATE SET station_id = $2, status = $3, expected_departure_at = NULL, planned_destination_id = NULL, parked_at = now(), updated_at = now()`,
    [busId, shelter ?? st[0], shelter ? 'available' : 'on_road'],
  );
const waiting = async (name: string) => {
  const buses = (await anon().call('GET', '/tracking/buses')).body.data.buses as Bus[];
  return buses.find((b) => b.busName === name);
};
const buy = (s: Session, busId: string) => s.call('POST', '/tickets', { busId });
const pay = async (s: Session, ticketId: string) => {
  const checkout = (await s.call('POST', `/tickets/${ticketId}/checkout`)).body.data as { checkoutUrl: string };
  const done = await anon().call('POST', `/payments/mock/sessions/${checkout.checkoutUrl.replace('/pay/mock/', '')}/complete`, { outcome: 'paid', method: 'gcash' });
  expect(done.body.data.outcome).toBe('applied');
};
const scan = async (s: Session, ticketId: string) => (await s.call('POST', '/scans', { token: qr.signTicketToken(ticketId) })).body.data as Scan;
const ticketRow = async (id: string) => (await db().query<{ status: string }>('SELECT status FROM tickets WHERE id = $1', [id]))[0]!;
const plan = (s: Session, destinationId: string | null) => s.call('PUT', '/tracking/my-bus/destination', { destinationId });

beforeAll(async () => {
  ctx = await setupTestApp();
  qr = await import('@lib/qr-token');
  const { authService } = await import('@modules/auth');
  await authService.createUser({ email: 'admin@t.test', password: 'Password123', fullName: 'Admin', role: 'admin' });
  await authService.createUser({ email: 'pax1@t.test', password: 'Password123', fullName: 'Pax One', role: 'passenger' });
  await authService.createUser({ email: 'pax2@t.test', password: 'Password123', fullName: 'Pax Two', role: 'passenger' });
  const signIn = async (email: string) => {
    const s = anon();
    await s.call('POST', '/auth/login', { email, password: 'Password123' });
    return s;
  };
  admin = await signIn('admin@t.test');
  pax1 = await signIn('pax1@t.test');
  pax2 = await signIn('pax2@t.test');
  for (const [i, n] of ['A', 'B', 'C', 'D'].entries()) st.push((await admin.call('POST', '/stations', { name: n, latitude: 14 + i * 0.01, longitude: 121 })).body.data.id);

  ids.bus1 = (await admin.call('POST', '/buses', { plateNumber: 'B 1', name: 'Bus One' })).body.data.id;
  ids.bus2 = (await admin.call('POST', '/buses', { plateNumber: 'B 2', name: 'Bus Two' })).body.data.id;
  ids.free = (await admin.call('POST', '/buses', { plateNumber: 'B 3', name: 'Free Runner' })).body.data.id; // no konduktor
  for (const n of [1, 2]) {
    const made = await admin.call('POST', '/konduktors', { email: `kond${n}@t.test`, password: 'Password123', fullName: `Konduktor ${n}`, employeeNo: `K-${n}` });
    await admin.call('PUT', `/buses/${ids[`bus${n}`]}/konduktor`, { konduktorId: made.body.data.id });
  }
  kond1 = await signIn('kond1@t.test');
  kond2 = await signIn('kond2@t.test');
}, 120_000);

beforeEach(async () => {
  await db().query("UPDATE tickets SET status = 'cancelled' WHERE status = 'pending_payment'");
  await db().query("UPDATE bus_trips SET status = 'cancelled', completed_at = now() WHERE status = 'en_route'");
  // Every test starts with both crewed buses freshly parked at shelter A, nothing announced, and (since a new wait starts now)
  // no earlier ticket counting against them.
  await parkBus(ids.bus1!, st[0]!);
  await parkBus(ids.bus2!, st[0]!);
  // Passengers scanned by an earlier test would now count as a finished trip that was never completed, and a bus cannot be dispatched
  // until that ride is completed: complete it, as the konduktor would (nothing to complete is a harmless 409).
  await kond1.call('POST', '/scans/ride/complete');
  await kond2.call('POST', '/scans/ride/complete');
});

afterAll(async () => {
  await ctx?.close();
});

describe('what passengers see for a waiting bus', () => {
  beforeEach(async () => {
    const tracking = await import('@modules/tracking');
    // Put the parked buses on the map as the simulator would.
    await db().query('DELETE FROM bus_positions');
    for (const busId of [ids.bus1!, ids.bus2!]) {
      await tracking.trackingService.recordPositions(
        [{ busId, latitude: 14, longitude: 121, headingDegrees: 0, speedKmh: 0, distanceMeters: 0, direction: 1, nextStationId: null, atStation: true, service: 'parked', originStationId: st[0]!, destinationStationId: null, tripId: null }],
        {},
      );
    }
  });

  it('says where each waiting bus is headed: the far end of the line unless its konduktor announced another station', async () => {
    expect(await waiting('Bus One')).toMatchObject({ service: 'parked', headingToId: st[3], headingToName: 'D', plannedDestinationId: null });
    await plan(kond1, st[2]!);
    expect(await waiting('Bus One')).toMatchObject({ headingToId: st[2], headingToName: 'C', plannedDestinationId: st[2] });
    expect(await waiting('Bus Two')).toMatchObject({ headingToId: st[3] }); // another bus is not affected
  });

  it('a bus that is not parked is not headed anywhere in this sense', async () => {
    await db().query("UPDATE bus_positions SET service = 'dispatch', origin_station_id = $2, destination_station_id = $3 WHERE bus_id = $1", [ids.bus1, st[0], st[1]]);
    expect(await waiting('Bus One')).toMatchObject({ service: 'dispatch', headingToId: null, headingToName: null });
  });
});

describe('buying a ticket on a bus (the passenger picks a bus at a shelter)', () => {
  it('is for that bus: it boards at the shelter where the bus waits and goes where the bus is headed, at the server\'s fare', async () => {
    const res = await buy(pax1, ids.bus1!);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({
      originStationId: st[0],
      originName: 'A',
      destinationStationId: st[3],
      destinationName: 'D',
      busId: ids.bus1,
      busName: 'Bus One',
      status: 'pending_payment',
    });
    const quote = (await anon().call('GET', `/fares/quote?origin=${st[0]}&destination=${st[3]}`)).body.data;
    expect(res.body.data.fareCentavos).toBe(quote.fareCentavos);
  });

  it('goes where the konduktor announced', async () => {
    await plan(kond1, st[2]!);
    const res = await buy(pax1, ids.bus1!);
    expect(res.body.data).toMatchObject({ destinationName: 'C', busName: 'Bus One' });
  });

  it('the client cannot choose the shelter, destination or fare when buying on a bus', async () => {
    const res = await pax1.call('POST', '/tickets', { busId: ids.bus1, originId: st[1], destinationId: st[2], fareCentavos: 1 });
    // A busId means "this bus": the other fields are ignored.
    expect(res.body.data).toMatchObject({ originName: 'A', destinationName: 'D' });
  });

  it('is refused for a bus that has left, is not in service, has no konduktor, or does not exist', async () => {
    await parkBus(ids.bus1!, null);
    const left = await buy(pax1, ids.bus1!);
    expect(left.status).toBe(409);
    expect(left.body.error.message).toMatch(/left the shelter/);

    await parkBus(ids.free!, st[0]!);
    expect((await buy(pax1, ids.free!)).status).toBe(409); // nobody to scan it

    await admin.call('PATCH', `/buses/${ids.bus2}`, { status: 'maintenance' });
    expect((await buy(pax1, ids.bus2!)).status).toBe(409);
    await admin.call('PATCH', `/buses/${ids.bus2}`, { status: 'active' });

    expect((await buy(pax1, '00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await pax1.call('POST', '/tickets', { busId: 'nope' })).status).toBe(400);
  });

  it('is for passengers only, and still limited to a few unpaid tickets', async () => {
    expect((await buy(anon(), ids.bus1!)).status).toBe(401);
    expect((await buy(kond1, ids.bus1!)).status).toBe(403);
    expect((await buy(admin, ids.bus1!)).status).toBe(403);
    const made = [];
    for (let i = 0; i < 5; i++) made.push((await buy(pax2, ids.bus1!)).status);
    expect(made).toEqual([201, 201, 201, 201, 201]);
    expect((await buy(pax2, ids.bus1!)).status).toBe(409);
  });

  it('the old way (two stations, no bus) still makes a ticket with no bus', async () => {
    const res = await pax1.call('POST', '/tickets', { originId: st[0], destinationId: st[1] });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ busId: null, busName: null });
  });
});

describe('only that bus can scan it, at that shelter (SCN-09)', () => {
  it('Bus One\'s ticket is accepted by Bus One\'s konduktor while the bus waits at the shelter it was bought at', async () => {
    const t = (await buy(pax1, ids.bus1!)).body.data as { id: string };
    await pay(pax1, t.id);
    expect(await scan(kond1, t.id)).toMatchObject({ result: 'valid' });
    expect((await ticketRow(t.id)).status).toBe('used');
  });

  it('another bus waiting at the very same shelter refuses it, and the ticket stays usable', async () => {
    const t = (await buy(pax1, ids.bus1!)).body.data as { id: string };
    await pay(pax1, t.id);
    const wrong = await scan(kond2, t.id); // Bus Two is also at shelter A
    expect(wrong).toMatchObject({ result: 'invalid', reason: 'wrong_bus' });
    expect(wrong.message).toBe('Wrong bus: this ticket is for Bus One, not your bus');
    expect((await ticketRow(t.id)).status).toBe('paid');
    expect((await scan(kond1, t.id)).result).toBe('valid');
  });

  it('is refused once its bus has moved to another shelter, and accepted again when it is back where the ticket was bought', async () => {
    const t = (await buy(pax1, ids.bus1!)).body.data as { id: string };
    await pay(pax1, t.id);
    await parkBus(ids.bus1!, st[1]!);
    expect(await scan(kond1, t.id)).toMatchObject({ reason: 'wrong_station' });
    await parkBus(ids.bus1!, null);
    expect(await scan(kond1, t.id)).toMatchObject({ reason: 'bus_not_at_station' });
    await parkBus(ids.bus1!, st[0]!);
    expect((await scan(kond1, t.id)).result).toBe('valid');
  });

  it('a ticket with no bus (the old way) is still checked by the shelter alone', async () => {
    const t = (await pax1.call('POST', '/tickets', { originId: st[0], destinationId: st[1] })).body.data as { id: string };
    await pay(pax1, t.id);
    expect((await scan(kond2, t.id)).result).toBe('valid');
  });
});

describe('the bus goes where the tickets say', () => {
  const sold = async (busId: string, destination?: string) => {
    if (destination) await plan(busId === ids.bus1 ? kond1 : kond2, destination);
    return (await buy(pax1, busId)).body.data as { id: string };
  };

  it('once someone has a ticket, the destination cannot be changed to another station', async () => {
    await sold(ids.bus1!); // default: the far end, D
    const change = await plan(kond1, st[2]!);
    expect(change.status).toBe(409);
    expect(change.body.error.message).toBe('Passengers have already bought tickets to D, so this bus has to go there.');
    expect((await kond1.call('GET', '/tracking/my-bus')).body.data.plannedDestination).toBeNull();
  });

  it('announcing the same destination again is fine, and so is the default it was bought for', async () => {
    await sold(ids.bus1!, st[2]!);
    expect((await plan(kond1, st[2]!)).status).toBe(200);
    expect((await plan(kond1, null)).status).toBe(409); // clearing would send it to D, not C
  });

  it('dispatch is refused to any station other than the ticketed one, and goes to it when none is named', async () => {
    await sold(ids.bus1!, st[2]!);
    const wrong = await kond1.call('POST', '/tracking/my-bus/dispatch', { destinationId: st[1] });
    expect(wrong.status).toBe(409);
    expect(wrong.body.error.message).toMatch(/already bought tickets to C/);
    expect((await kond1.call('GET', '/tracking/my-bus')).body.data.operation).toBe('available');

    const ok = await kond1.call('POST', '/tracking/my-bus/dispatch', {});
    expect(ok.status).toBe(201);
    expect(ok.body.data.destinationName).toBe('C');
  });

  it('tickets for a different bus do not hold this one', async () => {
    await sold(ids.bus2!); // a ticket on Bus Two
    expect((await plan(kond1, st[1]!)).status).toBe(200);
  });

  it('an unpaid ticket that has run out of time does not hold the bus, and a cancelled one never does', async () => {
    const t = await sold(ids.bus1!);
    await db().query("UPDATE tickets SET created_at = now() - interval '20 minutes' WHERE id = $1", [t.id]);
    expect((await plan(kond1, st[1]!)).status).toBe(200);
    await plan(kond1, null);
    const t2 = await sold(ids.bus1!);
    await pax1.call('POST', `/tickets/${t2.id}/cancel`);
    expect((await plan(kond1, st[1]!)).status).toBe(200);
  });

  it('tickets from an earlier wait do not hold the bus for its next one', async () => {
    const t = await sold(ids.bus1!);
    await pay(pax1, t.id);
    await parkBus(ids.bus1!, st[0]!); // it came back and parked again: a new wait
    expect((await plan(kond1, st[1]!)).status).toBe(200);
  });

  it('a purchase racing a change of destination ends with the ticket and the bus agreeing', async () => {
    const results = await Promise.all([buy(pax1, ids.bus1!), plan(kond1, st[1]!), buy(pax2, ids.bus1!), plan(kond1, st[2]!)]);
    const tickets = results.filter((r) => r.body.data?.busId).map((r) => r.body.data.destinationStationId as string);
    const planned = (await kond1.call('GET', '/tracking/my-bus')).body.data.plannedDestination?.id ?? st[3];
    // Every ticket that was sold goes to where the bus is now headed, whichever request won.
    for (const destination of tickets) expect(destination).toBe(planned);
  });
});

describe('when an arriving bus will leave again', () => {
  it('a konduktor can time the departure from the shelter the bus is driving to, and passengers there see it', async () => {
    const tracking = await import('@modules/tracking');
    await db().query('DELETE FROM bus_positions');
    await tracking.trackingService.recordPositions(
      [{ busId: ids.bus1!, latitude: 14, longitude: 121, headingDegrees: 0, speedKmh: 40, distanceMeters: 100, direction: 1, nextStationId: st[1]!, atStation: false, service: 'dispatch', originStationId: st[0]!, destinationStationId: st[1]!, tripId: null }],
      {},
    );
    await db().query("UPDATE bus_availability SET status = 'on_road', planned_destination_id = NULL WHERE bus_id = $1", [ids.bus1]);
    const set = await kond1.call('PUT', '/tracking/my-bus/departure', { inMinutes: 12 });
    expect(set.status).toBe(200);
    const bus = await waiting('Bus One');
    expect(bus).toMatchObject({ service: 'dispatch' });
    const minutes = (new Date(bus!.expectedDepartureAt!).getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(11);
    expect(minutes).toBeLessThan(13);
  });

  it('arriving keeps that time (it is now the departure from this shelter) unless it has already passed', async () => {
    const { trackingRepository } = await import('@modules/tracking/tracking.repository');
    await db().query("UPDATE bus_availability SET status = 'on_road', station_id = $2, expected_departure_at = now() + interval '10 minutes', planned_destination_id = NULL WHERE bus_id = $1", [ids.bus1, st[0]]);
    await trackingRepository.parkBus(db(), ids.bus1!, st[1]!);
    expect((await db().query<{ expected_departure_at: Date | null }>('SELECT expected_departure_at FROM bus_availability WHERE bus_id = $1', [ids.bus1]))[0]!.expected_departure_at).not.toBeNull();

    await db().query("UPDATE bus_availability SET status = 'on_road', expected_departure_at = now() - interval '1 minute' WHERE bus_id = $1", [ids.bus1]);
    await trackingRepository.parkBus(db(), ids.bus1!, st[2]!);
    expect((await db().query<{ expected_departure_at: Date | null }>('SELECT expected_departure_at FROM bus_availability WHERE bus_id = $1', [ids.bus1]))[0]!.expected_departure_at).toBeNull();
  });

  it('leaving the shelter clears the time that was for waiting there', async () => {
    await kond1.call('PUT', '/tracking/my-bus/departure', { inMinutes: 5 });
    expect((await kond1.call('POST', '/tracking/my-bus/dispatch', {})).status).toBe(201);
    expect((await db().query<{ expected_departure_at: Date | null }>('SELECT expected_departure_at FROM bus_availability WHERE bus_id = $1', [ids.bus1]))[0]!.expected_departure_at).toBeNull();
  });
});

describe('one purchase for a group (a family of five, one account)', () => {
  const unitFare = async () => (await anon().call('GET', `/fares/quote?origin=${st[0]}&destination=${st[3]}`)).body.data.fareCentavos as number;
  const buyFor = (s: Session, quantity?: unknown) => s.call('POST', '/tickets', { busId: ids.bus1, ...(quantity === undefined ? {} : { quantity }) });

  it('is one passenger unless more are asked for', async () => {
    const res = await buyFor(pax1);
    expect(res.body.data).toMatchObject({ quantity: 1, fareCentavos: await unitFare() });
  });

  it("five passengers: one ticket, the server multiplies the fare, and the bus and shelter are still the bus's", async () => {
    const res = await buyFor(pax1, 5);
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ quantity: 5, fareCentavos: 5 * (await unitFare()), busName: 'Bus One', originName: 'A', destinationName: 'D' });
  });

  it('is limited to 1 to 10 whole passengers', async () => {
    expect((await buyFor(pax1, 10)).status).toBe(201);
    for (const bad of [0, 11, -1, 1.5, '3', null, 100]) expect((await buyFor(pax2, bad)).status, String(bad)).toBe(400);
  });

  it('the old two-station form takes a party size too', async () => {
    const res = await pax1.call('POST', '/tickets', { originId: st[0], destinationId: st[1], quantity: 3 });
    expect(res.body.data).toMatchObject({ quantity: 3, busId: null });
    const unit = (await anon().call('GET', `/fares/quote?origin=${st[0]}&destination=${st[1]}`)).body.data.fareCentavos;
    expect(res.body.data.fareCentavos).toBe(3 * unit);
  });

  it('a group counts as one ticket towards the limit of unpaid tickets', async () => {
    const made = [];
    for (let i = 0; i < 5; i++) made.push((await buyFor(pax2, 10)).status);
    expect(made).toEqual([201, 201, 201, 201, 201]);
    expect((await buyFor(pax2, 2)).status).toBe(409);
  });

  it('is paid once, for the total: the payment is for everyone, and the amount check holds the group to the total fare', async () => {
    const t = (await buyFor(pax1, 5)).body.data as { id: string; fareCentavos: number };
    const checkout = (await pax1.call('POST', `/tickets/${t.id}/checkout`)).body.data as { amountCentavos: number; checkoutUrl: string };
    expect(checkout.amountCentavos).toBe(t.fareCentavos);

    // Someone pays only one person's fare: not enough, so it is kept for review and the ticket is not paid.
    const payments = await import('@integrations/payment');
    const mock = payments.getMockProvider();
    const providerRef = checkout.checkoutUrl.replace('/pay/mock/', '');
    const short = mock.buildEvent({ providerRef, kind: 'succeeded', amountCentavos: await unitFare(), method: 'gcash' });
    const res = await ctx.api.request('/payments/webhook/mock', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-brt-signature': mock.signBody(short) }, body: short });
    expect(((await res.json()) as { data: { outcome: string } }).data.outcome).toBe('amount_mismatch');
    expect((await ticketRow(t.id)).status).toBe('pending_payment');
  });

  it('one scan admits the whole group once, and the konduktor is told how many; a second scan admits no one', async () => {
    const t = (await buyFor(pax1, 5)).body.data as { id: string };
    await pay(pax1, t.id);
    const first = (await kond1.call('POST', '/scans', { token: qr.signTicketToken(t.id) })).body.data;
    expect(first).toMatchObject({ result: 'valid', ticket: { quantity: 5 } });
    expect((await scan(kond1, t.id)).result).toBe('already_used');
  });

  it('the scan history and the admin log say how many were admitted', async () => {
    const t = (await buyFor(pax1, 4)).body.data as { id: string };
    await pay(pax1, t.id);
    await scan(kond1, t.id);
    const mine = (await kond1.call('GET', '/scans/mine?days=1')).body.data as { items: { quantity: number | null }[] };
    expect(mine.items.some((x) => x.quantity === 4)).toBe(true);
    const log = (await admin.call('GET', '/scans?pageSize=20')).body.data as { items: { quantity: number | null }[] };
    expect(log.items.some((x) => x.quantity === 4)).toBe(true);
  });

  it("shows the party size in the passenger's ticket list", async () => {
    await buyFor(pax1, 6);
    const mine = (await pax1.call('GET', '/tickets/mine')).body.data as { quantity: number }[];
    expect(mine.some((t) => t.quantity === 6)).toBe(true);
  });
});
