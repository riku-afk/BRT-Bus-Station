import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BusPositionUpdate, TrackingSnapshot } from '@shared/tracking/models';
import { Session, setupTestApp } from './helpers';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
let tracking: typeof import('@modules/tracking');
let admin: Session;
let passenger: Session;
let kond1: Session;
let kond2: Session;
let kond3: Session;
const konduktorIds: Record<number, string> = {};
const db = () => ctx.db.getDb();
const anon = () => new Session({ request: (p, i) => ctx.api.request(p, i) });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const trackingRepoPark = async (busId: string, stationId: string) => (await import('@modules/tracking/tracking.repository')).trackingRepository.parkBus(ctx.db.getDb(), busId, stationId);

const stationIds: string[] = [];
const busIds: Record<string, string> = {};

const update = (busId: string, overrides: Partial<BusPositionUpdate> = {}): BusPositionUpdate => ({
  busId,
  latitude: 14.01,
  longitude: 121,
  headingDegrees: 0,
  speedKmh: 40,
  distanceMeters: 1000,
  direction: 1,
  nextStationId: stationIds[1]!,
  atStation: false,
  service: 'line',
  originStationId: null,
  destinationStationId: null,
  tripId: null,
  ...overrides,
});

/** Minimal SSE reader over a Response body. */
class SseReader {
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private buffer = '';
  private decoder = new TextDecoder();
  constructor(res: Response) {
    this.reader = res.body!.getReader();
  }
  /** Next non-ping event, or null on timeout. */
  async next(timeoutMs = 4000): Promise<{ event: string; data: string } | null> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const split = this.buffer.indexOf('\n\n');
      if (split >= 0) {
        const block = this.buffer.slice(0, split);
        this.buffer = this.buffer.slice(split + 2);
        const event = /^event: (.*)$/m.exec(block)?.[1] ?? 'message';
        const data = /^data: (.*)$/m.exec(block)?.[1] ?? '';
        if (event === 'ping') continue;
        return { event, data };
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) return null;
      const chunk = await Promise.race([this.reader.read(), sleep(remaining).then(() => null)]);
      if (chunk === null) return null;
      if (chunk.done) return null;
      this.buffer += this.decoder.decode(chunk.value, { stream: true });
    }
  }
  /** Skip events (e.g. a repeat of the snapshot just received) until one satisfies `accept`. */
  async until(accept: (snapshot: TrackingSnapshot) => boolean, timeoutMs = 5000): Promise<TrackingSnapshot | null> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) return null;
      const event = await this.next(remaining);
      if (!event) return null;
      const snapshot = JSON.parse(event.data) as TrackingSnapshot;
      if (accept(snapshot)) return snapshot;
    }
  }
  cancel() {
    return this.reader.cancel().catch(() => {});
  }
}

beforeAll(async () => {
  ctx = await setupTestApp();
  tracking = await import('@modules/tracking');
  const { authService } = await import('@modules/auth');
  await authService.createUser({ email: 'admin@t.test', password: 'Password123', fullName: 'Admin', role: 'admin' });
  await authService.createUser({ email: 'pax@t.test', password: 'Password123', fullName: 'Pax', role: 'passenger' });
  admin = anon();
  await admin.call('POST', '/auth/login', { email: 'admin@t.test', password: 'Password123' });
  passenger = anon();
  await passenger.call('POST', '/auth/login', { email: 'pax@t.test', password: 'Password123' });

  for (const [i, n] of ['A', 'B', 'C', 'D'].entries()) {
    stationIds.push((await admin.call('POST', '/stations', { name: n, latitude: 14 + i * 0.01, longitude: 121 })).body.data.id);
  }
  busIds.one = (await admin.call('POST', '/buses', { plateNumber: 'T 1', name: 'Bus One' })).body.data.id;
  busIds.two = (await admin.call('POST', '/buses', { plateNumber: 'T 2', name: 'Bus Two' })).body.data.id;
  busIds.maint = (await admin.call('POST', '/buses', { plateNumber: 'T 3', name: 'Bus Three', status: 'maintenance' })).body.data.id;
  // SIM_BUS_COUNT is 2: Bus One and Bus Two have no konduktor, so they run the line by themselves. Crew One and Crew Two each
  // have a konduktor, so they wait parked until that konduktor dispatches them. Konduktor 3 has no bus.
  busIds.crew1 = (await admin.call('POST', '/buses', { plateNumber: 'T 4', name: 'Crew One' })).body.data.id;
  busIds.crew2 = (await admin.call('POST', '/buses', { plateNumber: 'T 5', name: 'Crew Two' })).body.data.id;
  for (const n of [1, 2, 3]) {
    const made = await admin.call('POST', '/konduktors', { email: `kond${n}@t.test`, password: 'Password123', fullName: `Konduktor ${n}`, employeeNo: `K-${n}` });
    konduktorIds[n] = made.body.data.id;
  }
  await admin.call('PUT', `/buses/${busIds.crew1}/konduktor`, { konduktorId: konduktorIds[1] });
  await admin.call('PUT', `/buses/${busIds.crew2}/konduktor`, { konduktorId: konduktorIds[2] });
  const signIn = async (email: string) => {
    const session = anon();
    await session.call('POST', '/auth/login', { email, password: 'Password123' });
    return session;
  };
  kond1 = await signIn('kond1@t.test');
  kond2 = await signIn('kond2@t.test');
  kond3 = await signIn('kond3@t.test');
}, 120_000);

afterAll(async () => {
  await ctx?.close();
});

describe('positions', () => {
  it('stores positions and serves them publicly with bus and station names (TRK-03, TRK-07)', async () => {
    expect((await anon().call('GET', '/tracking/buses')).body.data.buses).toEqual([]);
    await tracking.trackingService.recordPositions([update(busIds.one!), update(busIds.two!, { distanceMeters: 2000, direction: -1 })]);
    const res = await anon().call('GET', '/tracking/buses');
    expect(res.status).toBe(200);
    const buses = res.body.data.buses as { busName: string; nextStationName: string; direction: number; plateNumber: string }[];
    expect(buses.map((b) => b.busName)).toEqual(['Bus One', 'Bus Two']);
    expect(buses[0]).toMatchObject({ plateNumber: 'T 1', nextStationName: 'B', direction: 1 });
    expect(buses[1]!.direction).toBe(-1);
  });

  it('upserts one row per bus instead of keeping history', async () => {
    await tracking.trackingService.recordPositions([update(busIds.one!, { distanceMeters: 1500, latitude: 14.015 })]);
    const rows = await ctx.db.getDb().query('SELECT count(*)::int AS n FROM bus_positions WHERE bus_id = $1', [busIds.one]);
    expect(rows[0]).toEqual({ n: 1 });
    const buses = (await anon().call('GET', '/tracking/buses')).body.data.buses as { busName: string; latitude: number }[];
    expect(buses.find((b) => b.busName === 'Bus One')!.latitude).toBe(14.015);
  });

  it('hides a bus that is not in service, and replace removes buses a source no longer reports', async () => {
    await tracking.trackingService.recordPositions([update(busIds.maint!)]);
    let buses = (await anon().call('GET', '/tracking/buses')).body.data.buses as { busName: string }[];
    expect(buses.map((b) => b.busName)).not.toContain('Bus Three');

    await admin.call('PATCH', `/buses/${busIds.two}`, { status: 'inactive' });
    buses = (await anon().call('GET', '/tracking/buses')).body.data.buses;
    expect(buses.map((b) => b.busName)).toEqual(['Bus One']);
    await admin.call('PATCH', `/buses/${busIds.two}`, { status: 'active' });

    await tracking.trackingService.recordPositions([update(busIds.one!)], { replace: true });
    const rows = await ctx.db.getDb().query('SELECT bus_id FROM bus_positions');
    expect(rows).toHaveLength(1);
    await tracking.trackingService.recordPositions([], { replace: true });
    expect(await ctx.db.getDb().query('SELECT 1 FROM bus_positions')).toHaveLength(0);
  });

  it('removing a bus removes its position', async () => {
    const extra = (await admin.call('POST', '/buses', { plateNumber: 'T 9', name: 'Temp' })).body.data.id;
    await tracking.trackingService.recordPositions([update(extra)]);
    await admin.call('DELETE', `/buses/${extra}`);
    expect(await ctx.db.getDb().query('SELECT 1 FROM bus_positions WHERE bus_id = $1', [extra])).toHaveLength(0);
  });
});

describe('who runs the line and who waits (TRK-01, TRK-08)', () => {
  it('buses without a konduktor run the line by themselves; crewed buses wait parked at stations', async () => {
    await tracking.trackingService.recordPositions([], { replace: true });
    await db().query('DELETE FROM bus_availability');
    const sim = tracking.createSimulator();
    await sim.start(tracking.positionSink);
    await sim.stop();

    const buses = (await anon().call('GET', '/tracking/buses')).body.data.buses as {
      busName: string;
      service: string;
      atStation: boolean;
      speedKmh: number;
      konduktorName: string | null;
      originStationName: string | null;
      destinationStationName: string | null;
      tripId: string | null;
      distanceMeters: number;
    }[];
    // Bus Three is in maintenance. SIM_BUS_COUNT is 2, so only Bus One and Bus Two run by themselves.
    expect(buses.map((b) => b.busName)).toEqual(['Bus One', 'Bus Two', 'Crew One', 'Crew Two']);

    const auto = buses.filter((b) => b.service === 'line');
    expect(auto.map((b) => b.busName)).toEqual(['Bus One', 'Bus Two']);
    for (const b of auto) {
      expect(b.konduktorName).toBeNull();
      expect([b.originStationName, b.destinationStationName].sort()).toEqual(['A', 'D']); // the line's two terminals
    }

    const crewed = buses.filter((b) => b.service === 'parked');
    expect(crewed.map((b) => [b.busName, b.konduktorName])).toEqual([
      ['Crew One', 'Konduktor 1'],
      ['Crew Two', 'Konduktor 2'],
    ]);
    for (const b of crewed) expect(b).toMatchObject({ atStation: true, speedKmh: 0, destinationStationName: null, tripId: null });
    expect(new Set(crewed.map((b) => b.originStationName)).size).toBe(2); // spread over different stations

    // Nothing moves the crewed buses but their konduktor; the automatic ones keep going.
    await sleep(300);
    await sim.tick();
    const later = (await anon().call('GET', '/tracking/buses')).body.data.buses as typeof buses;
    for (const [i, b] of crewed.entries()) expect(later.find((x) => x.busName === b.busName)!.distanceMeters).toBe(crewed[i]!.distanceMeters);
    expect(later.find((x) => x.busName === 'Bus One')!.distanceMeters).not.toBe(auto[0]!.distanceMeters);
    expect(JSON.stringify(buses)).not.toMatch(/passengers?\b|capacity|seats?\b|occupan/i); // GEN-01
  });

  it('a bus becomes crewed when a konduktor is assigned, and runs the line again when they are removed', async () => {
    const sim = tracking.createSimulator();
    await sim.start(tracking.positionSink);
    await sim.stop();
    const serviceOf = async (name: string) =>
      ((await anon().call('GET', '/tracking/buses')).body.data.buses as { busName: string; service: string }[]).find((b) => b.busName === name)?.service;

    expect(await serviceOf('Bus Two')).toBe('line');
    expect((await admin.call('PUT', `/buses/${busIds.two}/konduktor`, { konduktorId: konduktorIds[3] })).status).toBe(200);
    await sleep(200);
    await sim.tick();
    expect(await serviceOf('Bus Two')).toBe('parked');

    await admin.call('PUT', `/buses/${busIds.two}/konduktor`, { konduktorId: null });
    await sleep(200);
    await sim.tick();
    expect(await serviceOf('Bus Two')).toBe('line');
  });

  it('a deactivated konduktor no longer controls a bus: it runs the line by itself', async () => {
    const sim = tracking.createSimulator();
    await sim.start(tracking.positionSink);
    await sim.stop();
    // Deactivating also unassigns the bus (admin rule); put them back afterwards.
    await admin.call('PATCH', `/konduktors/${konduktorIds[2]}`, { isActive: false });
    await sleep(200);
    await sim.tick();
    const buses = (await anon().call('GET', '/tracking/buses')).body.data.buses as { busName: string; service: string }[];
    // Bus count is 2 and the line buses are Bus One / Bus Two, so Crew Two is free but beyond the limit: it simply is not driven.
    expect(buses.find((b) => b.busName === 'Crew Two')).toBeUndefined();
    await admin.call('PATCH', `/konduktors/${konduktorIds[2]}`, { isActive: true });
    await admin.call('PUT', `/buses/${busIds.crew2}/konduktor`, { konduktorId: konduktorIds[2] });
    await sleep(200);
    await sim.tick();
    expect(((await anon().call('GET', '/tracking/buses')).body.data.buses as { busName: string; service: string }[]).find((b) => b.busName === 'Crew Two')?.service).toBe('parked');
  });
});

describe('a konduktor controls their own bus (KON-04, KON-05, TRK-08)', () => {
  let sim: ReturnType<typeof tracking.createSimulator>;
  const tick = async () => {
    await sleep(150);
    await sim.tick();
  };
  const myBus = async (s: Session) => (await s.call('GET', '/tracking/my-bus')).body.data as {
    operation: string;
    bus: { name: string } | null;
    station: { id: string; name: string } | null;
    expectedDepartureAt: string | null;
    trip: { id: string; originStationId: string; originName: string; destinationStationId: string; destinationName: string } | null;
    defaultDestination: { id: string; name: string } | null;
    workerOnline: boolean;
  };
  const tripStatus = async (tripId: string) => (await db().query<{ status: string }>('SELECT status FROM bus_trips WHERE id = $1', [tripId]))[0]!.status;
  const runUntilArrived = async (s: Session) => {
    for (let i = 0; i < 80; i++) {
      await tick();
      if ((await myBus(s)).operation === 'available') return true;
    }
    return false;
  };

  beforeAll(async () => {
    await tracking.trackingService.recordPositions([], { replace: true });
    await db().query('DELETE FROM bus_availability');
    sim = tracking.createSimulator();
  });

  it('is for konduktors only: nobody else can see or dispatch a bus this way', async () => {
    for (const s of [anon(), admin, passenger]) {
      const expected = s === admin || s === passenger ? 403 : 401;
      expect((await s.call('GET', '/tracking/my-bus')).status).toBe(expected);
      expect((await s.call('PUT', '/tracking/my-bus/departure', { inMinutes: 5 })).status).toBe(expected);
      expect((await s.call('POST', '/tracking/my-bus/dispatch', {})).status).toBe(expected);
    }
    // The admin dispatch of the previous version is gone.
    expect((await admin.call('POST', '/tracking/dispatch', { originId: stationIds[0], destinationId: stationIds[2] })).status).toBe(404);
    expect((await admin.call('GET', '/tracking/dispatch')).status).toBe(404);
  });

  it('a konduktor with no bus is told so and cannot dispatch', async () => {
    expect(await myBus(kond3)).toMatchObject({ operation: 'no_bus', bus: null, station: null });
    const res = await kond3.call('POST', '/tracking/my-bus/dispatch', {});
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/No bus is assigned/);
    expect((await kond3.call('PUT', '/tracking/my-bus/departure', { inMinutes: 5 })).status).toBe(409);
  });

  it('a bus that the simulator has not placed yet is "not on the map", and cannot be dispatched', async () => {
    const mine = await myBus(kond1);
    expect(mine).toMatchObject({ operation: 'not_on_map', bus: { name: 'Crew One' }, station: null });
    const res = await kond1.call('POST', '/tracking/my-bus/dispatch', {});
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/not on the map yet/);
  });

  it('once placed, the bus is available at a station, and "dispatch" would send it to the far end of the line', async () => {
    await sim.start(tracking.positionSink);
    await sim.stop();
    const mine = await myBus(kond1);
    expect(mine.operation).toBe('available');
    expect(mine.station).not.toBeNull();
    expect(mine.workerOnline).toBe(true);
    expect(mine.expectedDepartureAt).toBeNull();
    expect(mine.defaultDestination).not.toBeNull();
    expect(mine.defaultDestination!.name).not.toBe(mine.station!.name);
    // The far end: a terminal (A or D) that is not where the bus is.
    expect(['A', 'D']).toContain(mine.defaultDestination!.name);
  });

  it('lets the konduktor set and clear an expected departure time, which passengers can see (KON-04)', async () => {
    const set = await kond1.call('PUT', '/tracking/my-bus/departure', { inMinutes: 10 });
    expect(set.status).toBe(200);
    const eta = new Date(set.body.data.expectedDepartureAt).getTime() - Date.now();
    expect(eta).toBeGreaterThan(9 * 60_000);
    expect(eta).toBeLessThanOrEqual(10 * 60_000 + 2000);

    // Visible to anyone, straight away (no simulator tick needed).
    const crew = (await anon().call('GET', '/tracking/buses')).body.data.buses as { busName: string; expectedDepartureAt: string | null }[];
    expect(crew.find((b) => b.busName === 'Crew One')!.expectedDepartureAt).toBe(set.body.data.expectedDepartureAt);
    expect(crew.find((b) => b.busName === 'Crew Two')!.expectedDepartureAt).toBeNull(); // someone else's bus is untouched

    expect((await kond1.call('PUT', '/tracking/my-bus/departure', { inMinutes: null })).body.data.expectedDepartureAt).toBeNull();
    for (const bad of [0, -5, 481, 1.5, 'soon']) {
      expect((await kond1.call('PUT', '/tracking/my-bus/departure', { inMinutes: bad })).status).toBe(400);
    }
  });

  it('dispatches to the far end, then the bus is on the road and cannot be dispatched again (its next departure can still be timed)', async () => {
    await kond1.call('PUT', '/tracking/my-bus/departure', { inMinutes: 5 });
    const before = await myBus(kond1);
    const res = await kond1.call('POST', '/tracking/my-bus/dispatch', {});
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ busName: 'Crew One', originName: before.station!.name, destinationName: before.defaultDestination!.name });
    const tripId = res.body.data.tripId as string;

    const trip = (await db().query<{ status: string; email: string }>('SELECT t.status, u.email FROM bus_trips t JOIN users u ON u.id = t.dispatched_by WHERE t.id = $1', [tripId]))[0]!;
    expect(trip).toEqual({ status: 'en_route', email: 'kond1@t.test' }); // who sent it is on record

    const mine = await myBus(kond1);
    expect(mine).toMatchObject({ operation: 'on_road', station: null, expectedDepartureAt: null });
    expect(mine.trip).toMatchObject({ originName: before.station!.name, destinationName: before.defaultDestination!.name });
    // The page marks these two stations on its map.
    expect(mine.trip).toMatchObject({ originStationId: before.station!.id, destinationStationId: before.defaultDestination!.id });

    const again = await kond1.call('POST', '/tracking/my-bus/dispatch', {});
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/on the road/);
    // While driving, the konduktor can say when the bus will leave the shelter it is going to; passengers there see it.
    const retimed = await kond1.call('PUT', '/tracking/my-bus/departure', { inMinutes: 5 });
    expect(retimed.status).toBe(200);
    expect(retimed.body.data).toMatchObject({ operation: 'on_road' });
    expect(retimed.body.data.expectedDepartureAt).not.toBeNull();

    // The worker picks it up: the bus is now a dispatched bus, with its konduktor named.
    await tick();
    const onMap = ((await anon().call('GET', '/tracking/buses')).body.data.buses as { busName: string; service: string; konduktorName: string; tripId: string }[]).find((b) => b.busName === 'Crew One')!;
    expect(onMap).toMatchObject({ service: 'dispatch', konduktorName: 'Konduktor 1', tripId });
  });

  it('arrives, and is available again at the destination, ready for the next dispatch', async () => {
    const trip = (await myBus(kond1)).trip!;
    expect(await runUntilArrived(kond1)).toBe(true);
    const mine = await myBus(kond1);
    expect(mine).toMatchObject({ operation: 'available', trip: null });
    // The departure time set on the road is kept: it is now the time it leaves this shelter.
    expect(mine.expectedDepartureAt).not.toBeNull();
    expect(mine.station!.name).toBe(trip.destinationName);
    expect((await db().query<{ status: string }>('SELECT status FROM bus_trips WHERE bus_id = $1 ORDER BY created_at DESC LIMIT 1', [busIds.crew1]))[0]?.status).toBe('completed');

    const parked = ((await anon().call('GET', '/tracking/buses')).body.data.buses as { busName: string; service: string; originStationName: string }[]).find((b) => b.busName === 'Crew One')!;
    expect(parked).toMatchObject({ service: 'parked', originStationName: trip.destinationName });

    // Dispatching again from where it arrived sends it to the far end from there: the opposite terminal.
    const back = await kond1.call('POST', '/tracking/my-bus/dispatch', {});
    expect(back.status).toBe(201);
    expect(back.body.data.originName).toBe(trip.destinationName);
    expect(['A', 'D']).toContain(trip.destinationName); // it went to a terminal
    expect(back.body.data.destinationName).toBe(trip.destinationName === 'A' ? 'D' : 'A');
    expect(await runUntilArrived(kond1)).toBe(true);
  }, 60_000);

  it('can pick a nearer station instead, and cannot pick the station it is already at or one that is not in service', async () => {
    const at = (await myBus(kond1)).station!;
    const others = stationIds.filter((id) => id !== at.id);
    const middle = others[1]!;
    expect((await kond1.call('POST', '/tracking/my-bus/dispatch', { destinationId: at.id })).status).toBe(400);
    expect((await kond1.call('POST', '/tracking/my-bus/dispatch', { destinationId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
    expect((await kond1.call('POST', '/tracking/my-bus/dispatch', { destinationId: 'nope' })).status).toBe(400);
    await admin.call('PATCH', `/stations/${others[2]}`, { isActive: false });
    expect((await kond1.call('POST', '/tracking/my-bus/dispatch', { destinationId: others[2] })).status).toBe(400);
    await admin.call('PATCH', `/stations/${others[2]}`, { isActive: true });

    const ok = await kond1.call('POST', '/tracking/my-bus/dispatch', { destinationId: middle });
    expect(ok.status).toBe(201);
    expect(ok.body.data.destinationName).toBe((await admin.call('GET', '/stations')).body.data.find((s: { id: string; name: string }) => s.id === middle).name);
    expect(await runUntilArrived(kond1)).toBe(true);
    expect((await myBus(kond1)).station!.id).toBe(middle);
  }, 60_000);

  it('only ever dispatches the konduktor\'s OWN bus, whatever the request says (GEN-05)', async () => {
    const crew1Before = await myBus(kond1);
    expect(crew1Before.operation).toBe('available');
    // Konduktor 2 tries to name Konduktor 1's bus (and a station for good measure).
    const res = await kond2.call('POST', '/tracking/my-bus/dispatch', { busId: busIds.crew1, konduktorId: konduktorIds[1] });
    expect(res.status).toBe(201);
    expect(res.body.data.busName).toBe('Crew Two');
    expect((await myBus(kond1)).operation).toBe('available'); // untouched
    expect((await myBus(kond2)).operation).toBe('on_road');
    expect(await runUntilArrived(kond2)).toBe(true);
  }, 60_000);

  it('lets only one of two simultaneous dispatches through', async () => {
    const [a, b] = await Promise.all([kond1.call('POST', '/tracking/my-bus/dispatch', {}), kond1.call('POST', '/tracking/my-bus/dispatch', {})]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(await db().query("SELECT 1 FROM bus_trips WHERE bus_id = $1 AND status = 'en_route'", [busIds.crew1])).toHaveLength(1);
    expect(await runUntilArrived(kond1)).toBe(true);
  }, 60_000);

  it('cancels a trip, and parks the bus at its origin, when the konduktor loses the bus mid-trip', async () => {
    const start = (await myBus(kond2)).station!;
    const sent = await kond2.call('POST', '/tracking/my-bus/dispatch', {});
    await tick();
    await admin.call('PUT', `/buses/${busIds.crew2}/konduktor`, { konduktorId: null });
    await tick();
    expect(await tripStatus(sent.body.data.tripId)).toBe('cancelled');
    expect(await myBus(kond2)).toMatchObject({ operation: 'no_bus' });
    // Put them back: the bus is parked again at the station it left from.
    await admin.call('PUT', `/buses/${busIds.crew2}/konduktor`, { konduktorId: konduktorIds[2] });
    await tick();
    const mine = await myBus(kond2);
    expect(mine.operation).toBe('available');
    expect(mine.station!.name).toBe(start.name);
  }, 60_000);

  it('a clean worker shutdown cancels trips in progress and leaves the bus available at its origin', async () => {
    const at = (await myBus(kond1)).station!;
    const sent = await kond1.call('POST', '/tracking/my-bus/dispatch', {});
    expect(sent.status).toBe(201);
    await tracking.trackingService.cancelActiveTrips();
    expect(await tripStatus(sent.body.data.tripId)).toBe('cancelled');
    expect(await myBus(kond1)).toMatchObject({ operation: 'available', station: { id: at.id } });
  });
});

describe('stations: buses waiting here (STN-07)', () => {
  it('lists the crewed buses waiting at each station, with their konduktor and expected departure', async () => {
    const sim = tracking.createSimulator();
    await sim.start(tracking.positionSink);
    await sim.stop();
    await kond1.call('PUT', '/tracking/my-bus/departure', { inMinutes: 15 });

    const res = await anon().call('GET', '/tracking/availability');
    expect(res.status).toBe(200);
    const stations = res.body.data as { stationId: string; buses: { busName: string; konduktorName: string; expectedDepartureAt: string | null; service: string }[] }[];
    const all = stations.flatMap((s) => s.buses);
    expect(all.map((b) => b.busName).sort()).toEqual(['Crew One', 'Crew Two']);
    expect(all.every((b) => b.service === 'parked')).toBe(true);
    // Automatic buses are never "available at a station".
    expect(all.map((b) => b.busName)).not.toContain('Bus One');

    const one = all.find((b) => b.busName === 'Crew One')!;
    expect(one.konduktorName).toBe('Konduktor 1');
    expect(one.expectedDepartureAt).not.toBeNull();
    expect(all.find((b) => b.busName === 'Crew Two')!.expectedDepartureAt).toBeNull();
    // It is listed under the station it waits at.
    const where = stations.find((s) => s.buses.some((b) => b.busName === 'Crew One'))!;
    expect((await kond1.call('GET', '/tracking/my-bus')).body.data.station.id).toBe(where.stationId);
  });

  it('drops a bus from its station when it is dispatched, and lists it at the destination when it arrives', async () => {
    const sim = tracking.createSimulator();
    const mine = await (async () => (await kond1.call('GET', '/tracking/my-bus')).body.data)();
    const origin = mine.station.id as string;
    await kond1.call('POST', '/tracking/my-bus/dispatch', {});
    await sleep(150);
    await sim.start(tracking.positionSink);
    await sim.stop();

    let list = (await anon().call('GET', '/tracking/availability')).body.data as { stationId: string; buses: { busName: string }[] }[];
    expect(list.flatMap((s) => s.buses.map((b) => b.busName))).not.toContain('Crew One'); // on the road, not waiting anywhere

    for (let i = 0; i < 80; i++) {
      await sleep(150);
      await sim.tick();
      list = (await anon().call('GET', '/tracking/availability')).body.data;
      if (list.some((s) => s.buses.some((b) => b.busName === 'Crew One'))) break;
    }
    const where = list.find((s) => s.buses.some((b) => b.busName === 'Crew One'))!;
    expect(where.stationId).not.toBe(origin);
  }, 60_000);

  it('is public, and a station with no bus waiting is simply not listed', async () => {
    const res = await anon().call('GET', '/tracking/availability');
    expect(res.status).toBe(200);
    const list = res.body.data as { stationId: string; buses: unknown[] }[];
    expect(list.length).toBeLessThanOrEqual(2);
    expect(list.every((s) => s.buses.length > 0)).toBe(true);
  });
});

describe('worker status', () => {
  it('is public and follows the worker heartbeat', async () => {
    await db().query("UPDATE simulator_state SET worker_heartbeat_at = now() - interval '1 minute'");
    expect((await anon().call('GET', '/tracking/status')).body.data).toEqual({ workerOnline: false });
    await db().query('UPDATE simulator_state SET worker_heartbeat_at = now()');
    expect((await anon().call('GET', '/tracking/status')).body.data).toEqual({ workerOnline: true });
  });
});

describe('a konduktor sees only their own bus', () => {
  const namesOf = (buses: { busName: string }[]) => buses.map((b) => b.busName).sort();

  beforeAll(async () => {
    // Everything placed: the automatic buses running, the crewed ones parked.
    const sim = tracking.createSimulator();
    await sim.start(tracking.positionSink);
    await sim.stop();
  });

  it('everyone else still sees every bus', async () => {
    for (const s of [anon(), passenger, admin]) {
      const names = namesOf((await s.call('GET', '/tracking/buses')).body.data.buses);
      expect(names).toEqual(expect.arrayContaining(['Bus One', 'Bus Two', 'Crew One', 'Crew Two']));
    }
  });

  it('a konduktor gets only their own bus from the list of buses', async () => {
    expect(namesOf((await kond1.call('GET', '/tracking/buses')).body.data.buses)).toEqual(['Crew One']);
    expect(namesOf((await kond2.call('GET', '/tracking/buses')).body.data.buses)).toEqual(['Crew Two']);
    // The other crew and the automatic buses are nowhere in the response.
    const raw = JSON.stringify((await kond1.call('GET', '/tracking/buses')).body);
    expect(raw).not.toMatch(/Crew Two|Bus One|Bus Two|Konduktor 2/);
  });

  it('a konduktor with no bus sees no buses at all', async () => {
    expect((await kond3.call('GET', '/tracking/buses')).body.data.buses).toEqual([]);
    expect((await kond3.call('GET', '/tracking/availability')).body.data).toEqual([]);
  });

  it("the list of buses waiting at stations shows a konduktor only their own bus", async () => {
    const all = (await anon().call('GET', '/tracking/availability')).body.data as { buses: { busName: string }[] }[];
    expect(all.flatMap((e) => e.buses.map((b) => b.busName)).sort()).toEqual(expect.arrayContaining(['Crew One', 'Crew Two']));
    const mine = (await kond1.call('GET', '/tracking/availability')).body.data as { buses: { busName: string }[] }[];
    for (const entry of mine) expect(entry.buses.map((b) => b.busName)).toEqual(['Crew One']);
  });

  it('the live stream sends a konduktor only their own bus, and keeps doing so as other buses move', async () => {
    const everyone = new SseReader(await ctx.api.request('/tracking/stream'));
    const crew = new SseReader(await kond1.raw('/tracking/stream'));
    try {
      const all = JSON.parse((await everyone.next())!.data) as TrackingSnapshot;
      expect(all.buses.length).toBeGreaterThan(1);
      const first = JSON.parse((await crew.next())!.data) as TrackingSnapshot;
      expect(first.buses.map((b) => b.busName)).toEqual(['Crew One']);

      // Another bus moves: the konduktor's next update still contains only their own.
      await tracking.trackingService.recordPositions([update(busIds.one!, { distanceMeters: 4242, latitude: 14.0042 })]);
      const later = await crew.next(4000);
      expect(later).not.toBeNull();
      const snapshot = JSON.parse(later!.data) as TrackingSnapshot;
      expect(snapshot.buses.map((b) => b.busName)).toEqual(['Crew One']);
      expect(later!.data).not.toMatch(/Bus One|Crew Two/);
    } finally {
      await everyone.cancel();
      await crew.cancel();
    }
  }, 20_000);
});

describe('live feed (SSE, TRK-04)', () => {
  it('sends a snapshot on connect, then pushes a positions event when a position changes', async () => {
    await tracking.trackingService.recordPositions([update(busIds.one!, { distanceMeters: 500 })], { replace: true });

    const res = await ctx.api.request('/tracking/stream');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    const sse = new SseReader(res);

    const snapshot = await sse.next();
    expect(snapshot?.event).toBe('snapshot');
    const snap = JSON.parse(snapshot!.data) as TrackingSnapshot;
    expect(snap.buses).toHaveLength(1);
    expect(snap.buses[0]!.distanceMeters).toBe(500);
    expect(tracking.trackingHub.size).toBe(1);

    await tracking.trackingService.recordPositions([update(busIds.one!, { distanceMeters: 750, latitude: 14.0075 })], { replace: true });
    const pushed = await sse.until((snap) => snap.buses[0]?.distanceMeters === 750);
    expect(pushed).not.toBeNull();
    expect(pushed!.buses[0]!.latitude).toBe(14.0075);

    await sse.cancel();
    // The hub drops the subscription (and its LISTEN connection) when the client goes away.
    for (let i = 0; i < 20 && tracking.trackingHub.size > 0; i++) await sleep(100);
    expect(tracking.trackingHub.size).toBe(0);
  }, 20_000);

  it('serves several clients from one hub, and a removed bus disappears from every stream', async () => {
    await tracking.trackingService.recordPositions([update(busIds.one!), update(busIds.two!)], { replace: true });
    const a = new SseReader(await ctx.api.request('/tracking/stream'));
    const b = new SseReader(await ctx.api.request('/tracking/stream'));
    expect(JSON.parse((await a.next())!.data).buses).toHaveLength(2);
    expect(JSON.parse((await b.next())!.data).buses).toHaveLength(2);
    expect(tracking.trackingHub.size).toBe(2);

    await tracking.trackingService.recordPositions([update(busIds.one!)], { replace: true });
    expect(await a.until((snap) => snap.buses.length === 1)).not.toBeNull();
    expect(await b.until((snap) => snap.buses.length === 1)).not.toBeNull();

    await a.cancel();
    await b.cancel();
    for (let i = 0; i < 20 && tracking.trackingHub.size > 0; i++) await sleep(100);
    expect(tracking.trackingHub.size).toBe(0);
  }, 20_000);

});

describe('announcing where the waiting bus is headed (the passenger map)', () => {
  type Mine = { operation: string; plannedDestination: { id: string; name: string } | null; defaultDestination: { id: string; name: string } | null };
  const plan = (s: Session, destinationId: string | null) => s.call('PUT', '/tracking/my-bus/destination', { destinationId });
  const waitingBus = async (name: string) => {
    const buses = (await anon().call('GET', '/tracking/buses')).body.data.buses as { busName: string; plannedDestinationId: string | null; plannedDestinationName: string | null; service: string }[];
    return buses.find((b) => b.busName === name);
  };

  it('starts with nothing announced, so passengers only see the likely end of the line', async () => {
    await tracking.trackingService.recordPositions([], { replace: true });
    await db().query('DELETE FROM bus_availability');
    const sim = tracking.createSimulator();
    await sim.start(tracking.positionSink);
    await sim.stop();
    const mine = (await kond1.call('GET', '/tracking/my-bus')).body.data as Mine;
    expect(mine.operation).toBe('available');
    expect(mine.plannedDestination).toBeNull();
    expect((await waitingBus('Crew One'))).toMatchObject({ service: 'parked', plannedDestinationId: null, plannedDestinationName: null });
  });

  it('a konduktor announces a destination and every passenger sees it on that bus', async () => {
    const mine = (await kond1.call('GET', '/tracking/my-bus')).body.data as Mine;
    const target = stationIds.find((id) => id !== mine.defaultDestination!.id)!;
    const res = await plan(kond1, target);
    expect(res.status).toBe(200);
    expect(res.body.data.plannedDestination.id).toBe(target);

    const bus = await waitingBus('Crew One');
    expect(bus!.plannedDestinationId).toBe(target);
    expect(bus!.plannedDestinationName).toBe(res.body.data.plannedDestination.name);
    // Visible to a passenger's availability list too, and not on the other konduktor's bus.
    const availability = (await passenger.call('GET', '/tracking/availability')).body.data as { buses: { busName: string; plannedDestinationName: string | null }[] }[];
    expect(availability.flatMap((s) => s.buses).find((b) => b.busName === 'Crew One')!.plannedDestinationName).toBe(res.body.data.plannedDestination.name);
    expect((await waitingBus('Crew Two'))!.plannedDestinationId).toBeNull();
  });

  it('the live feed carries it, so the passenger map updates without a reload', async () => {
    const here = ((await kond1.call('GET', '/tracking/my-bus')).body.data as { station: { id: string } }).station.id;
    const target = stationIds.find((id) => id !== here)!;
    await plan(kond1, null); // start from nothing announced, so the announcement is a visible change
    const reader = new SseReader(await ctx.api.request('/tracking/stream'));
    expect(await reader.next()).not.toBeNull(); // the first snapshot
    expect((await plan(kond1, target)).status).toBe(200);
    const seen = await reader.until((snap) => snap.buses.some((b) => b.busName === 'Crew One' && b.plannedDestinationId === target));
    expect(seen).not.toBeNull();
    await reader.cancel();
  }, 20_000);

  it('null clears it', async () => {
    expect((await plan(kond1, null)).body.data.plannedDestination).toBeNull();
    expect((await waitingBus('Crew One'))!.plannedDestinationId).toBeNull();
  });

  it('rejects the station the bus is already at, an unknown station and a bad id', async () => {
    const mine = (await kond1.call('GET', '/tracking/my-bus')).body.data as Mine & { station: { id: string } };
    expect((await plan(kond1, mine.station.id)).status).toBe(400);
    expect((await plan(kond1, '00000000-0000-4000-8000-000000000000')).status).toBe(404);
    expect((await kond1.call('PUT', '/tracking/my-bus/destination', { destinationId: 'nope' })).status).toBe(400);
    expect((await kond1.call('PUT', '/tracking/my-bus/destination', {})).status).toBe(400);
  });

  it('is only for konduktors with a bus', async () => {
    expect((await plan(anon(), stationIds[0]!)).status).toBe(401);
    expect((await plan(passenger, stationIds[0]!)).status).toBe(403);
    expect((await plan(admin, stationIds[0]!)).status).toBe(403);
    expect((await plan(kond3, stationIds[0]!)).status).toBe(409); // konduktor 3 has no bus
  });

  it('dispatching with no explicit station goes to the announced one; an explicit station wins; either way the plan is cleared', async () => {
    const mine = (await kond1.call('GET', '/tracking/my-bus')).body.data as Mine & { station: { id: string } };
    const others = stationIds.filter((id) => id !== mine.station.id && id !== mine.defaultDestination!.id);
    const announced = others[0]!;
    await plan(kond1, announced);
    const sent = await kond1.call('POST', '/tracking/my-bus/dispatch', {});
    expect(sent.status).toBe(201);
    const trip = (await db().query<{ destination_station_id: string }>('SELECT destination_station_id FROM bus_trips WHERE id = $1', [sent.body.data.tripId]))[0]!;
    expect(trip.destination_station_id).toBe(announced);
    // On the road: nothing is announced any more, and a plan cannot be made.
    expect((await waitingBus('Crew One'))!.plannedDestinationId).toBeNull();
    expect((await plan(kond1, announced)).status).toBe(409);
    expect((await db().query('SELECT planned_destination_id FROM bus_availability WHERE bus_id = $1', [busIds.crew1]))[0]).toEqual({ planned_destination_id: null });
  });

  it('an explicit station beats the announced one', async () => {
    // Crew Two: announce one station, dispatch to another.
    const mine = (await kond2.call('GET', '/tracking/my-bus')).body.data as Mine & { station: { id: string } };
    const [first, second] = stationIds.filter((id) => id !== mine.station.id);
    await plan(kond2, first!);
    const sent = await kond2.call('POST', '/tracking/my-bus/dispatch', { destinationId: second });
    const trip = (await db().query<{ destination_station_id: string }>('SELECT destination_station_id FROM bus_trips WHERE id = $1', [sent.body.data.tripId]))[0]!;
    expect(trip.destination_station_id).toBe(second);
  });

  it('an announcement is forgotten when the bus is parked again, so a new wait starts with nothing announced', async () => {
    const now = (await db().query<{ bus_id: string; station_id: string }>('SELECT bus_id, station_id FROM bus_availability WHERE bus_id = $1', [busIds.crew1]))[0]!;
    await db().query("UPDATE bus_availability SET status = 'available', station_id = $2 WHERE bus_id = $1", [now.bus_id, stationIds[0]]);
    await db().query('UPDATE bus_availability SET planned_destination_id = $2 WHERE bus_id = $1', [now.bus_id, stationIds[2]]);
    await trackingRepoPark(now.bus_id, stationIds[0]!);
    expect((await db().query('SELECT planned_destination_id FROM bus_availability WHERE bus_id = $1', [now.bus_id]))[0]).toEqual({ planned_destination_id: null });
  });

  it('the database refuses an announcement for a bus that is on the road', async () => {
    await expect(db().query("UPDATE bus_availability SET status = 'on_road', planned_destination_id = $2 WHERE bus_id = $1", [busIds.crew1, stationIds[1]])).rejects.toThrow(/plan_only_when_available/);
  });
});
