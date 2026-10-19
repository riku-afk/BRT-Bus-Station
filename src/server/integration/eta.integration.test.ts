import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BusPositionUpdate } from '@shared/tracking/models';
import type { BusEta, StationArrivals } from '@shared/eta/eta';
import { Session, setupTestApp } from './helpers';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
let tracking: typeof import('@modules/tracking');
let admin: Session;
let passenger: Session;
let kond1: Session;
let kond2: Session;
const anon = () => new Session({ request: (p, i) => ctx.api.request(p, i) });

const stationIds: string[] = [];
const dist: number[] = [];
const bus: Record<string, string> = {};

// 36 km/h = 10 m/s and a 20 s dwell, so expected values are easy to work out by hand.
const SPEED = 36;
const DWELL = 20;

const update = (busId: string, overrides: Partial<BusPositionUpdate> = {}): BusPositionUpdate => ({
  busId,
  latitude: 14.01,
  longitude: 121,
  headingDegrees: 0,
  speedKmh: SPEED,
  distanceMeters: 0,
  direction: 1,
  nextStationId: null,
  atStation: false,
  service: 'line',
  originStationId: null,
  destinationStationId: null,
  tripId: null,
  ...overrides,
});

const at = async (s: Session, stationIndex: number) => (await s.call('GET', `/eta/stations/${stationIds[stationIndex]}`)).body.data as StationArrivals;
const near = (actual: number, expected: number) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1); // rounding to whole seconds

beforeAll(async () => {
  ctx = await setupTestApp();
  const { env } = await import('@config/env');
  // Test-only: pretend the simulator runs at a speed that makes the arithmetic easy.
  Object.assign(env.simulator as { speedKmh: number; dwellSeconds: number }, { speedKmh: SPEED, dwellSeconds: DWELL });
  tracking = await import('@modules/tracking');
  const { authService } = await import('@modules/auth');
  await authService.createUser({ email: 'admin@t.test', password: 'Password123', fullName: 'Admin', role: 'admin' });
  await authService.createUser({ email: 'pax@t.test', password: 'Password123', fullName: 'Pax', role: 'passenger' });
  const signIn = async (email: string) => {
    const s = anon();
    await s.call('POST', '/auth/login', { email, password: 'Password123' });
    return s;
  };
  admin = await signIn('admin@t.test');
  passenger = await signIn('pax@t.test');
  for (const [i, n] of ['A', 'B', 'C', 'D'].entries()) stationIds.push((await admin.call('POST', '/stations', { name: n, latitude: 14 + i * 0.01, longitude: 121 })).body.data.id);
  const stations = (await anon().call('GET', '/stations')).body.data as { distanceMeters: number }[];
  dist.push(...stations.map((s) => s.distanceMeters));

  bus.line = (await admin.call('POST', '/buses', { plateNumber: 'E 1', name: 'Line Bus' })).body.data.id;
  bus.crew1 = (await admin.call('POST', '/buses', { plateNumber: 'E 2', name: 'Crew One' })).body.data.id;
  bus.crew2 = (await admin.call('POST', '/buses', { plateNumber: 'E 3', name: 'Crew Two' })).body.data.id;
  for (const n of [1, 2]) {
    const made = await admin.call('POST', '/konduktors', { email: `kond${n}@t.test`, password: 'Password123', fullName: `Konduktor ${n}`, employeeNo: `K-${n}` });
    await admin.call('PUT', `/buses/${bus[`crew${n}`]}/konduktor`, { konduktorId: made.body.data.id });
  }
  kond1 = await signIn('kond1@t.test');
  kond2 = await signIn('kond2@t.test');
}, 120_000);

afterAll(async () => {
  await ctx?.close();
});

describe('ETA for a station (ETA-02)', () => {
  it('lists a line bus heading for the station with minutes worked out from distance, speed and dwell', async () => {
    const start = dist[0]! + 500;
    await tracking.trackingService.recordPositions([update(bus.line!, { distanceMeters: start, direction: 1 })], { replace: true });

    const b = await at(passenger, 1);
    expect(b.stationName).toBe('B');
    expect(b.arrivals).toHaveLength(1);
    near(b.arrivals[0]!.seconds, (dist[1]! - start) / 10);
    expect(b.arrivals[0]).toMatchObject({ busName: 'Line Bus', plateNumber: 'E 1', service: 'line', stopsAway: 1, towardsName: 'D' });

    // Each station further on adds the drive and one dwell at the stop in between.
    const d = await at(passenger, 3);
    near(d.arrivals[0]!.seconds, (dist[3]! - start) / 10 + 2 * DWELL);
    expect(d.arrivals[0]!.stopsAway).toBe(3);
  });

  it('does not list a station the bus has already passed, or the one it is stopped at', async () => {
    await tracking.trackingService.recordPositions([update(bus.line!, { distanceMeters: dist[1]!, direction: 1, atStation: true })], { replace: true });
    expect((await at(passenger, 0)).arrivals).toEqual([]);
    expect((await at(passenger, 1)).arrivals).toEqual([]);
    expect((await at(passenger, 2)).arrivals).toHaveLength(1);
  });

  it('follows the direction of travel', async () => {
    await tracking.trackingService.recordPositions([update(bus.line!, { distanceMeters: dist[2]! - 100, direction: -1 })], { replace: true });
    expect((await at(passenger, 3)).arrivals).toEqual([]);
    expect((await at(passenger, 1)).arrivals).toHaveLength(1);
    near((await at(passenger, 1)).arrivals[0]!.seconds, (dist[2]! - 100 - dist[1]!) / 10);
    expect((await at(passenger, 1)).arrivals[0]!.towardsName).toBe('A');
  });

  it('a dispatched bus drives non-stop: it appears only at its destination, with no dwell', async () => {
    await tracking.trackingService.recordPositions(
      [update(bus.crew1!, { service: 'dispatch', distanceMeters: dist[0]!, originStationId: stationIds[0]!, destinationStationId: stationIds[3]!, tripId: null })],
      { replace: true },
    );
    const d = await at(passenger, 3);
    expect(d.arrivals).toHaveLength(1);
    near(d.arrivals[0]!.seconds, dist[3]! / 10);
    expect(d.arrivals[0]).toMatchObject({ service: 'dispatch', fromName: 'A', towardsName: 'D' });
    expect((await at(passenger, 1)).arrivals).toEqual([]); // it does not stop at B
    expect((await at(passenger, 2)).arrivals).toEqual([]);
  });

  it('orders several buses by soonest arrival', async () => {
    await tracking.trackingService.recordPositions(
      [
        update(bus.line!, { distanceMeters: dist[0]!, direction: 1 }), // far from C
        update(bus.crew1!, { service: 'dispatch', distanceMeters: dist[1]! + 800, originStationId: stationIds[0]!, destinationStationId: stationIds[2]!, tripId: null }),
      ],
      { replace: true },
    );
    const c = await at(passenger, 2);
    expect(c.arrivals.map((a) => a.busName)).toEqual(['Crew One', 'Line Bus']);
    expect(c.arrivals[0]!.seconds).toBeLessThan(c.arrivals[1]!.seconds);
  });

  it('parked buses are not arriving anywhere (their departure time is shown instead)', async () => {
    await tracking.trackingService.recordPositions([update(bus.crew2!, { service: 'parked', atStation: true, distanceMeters: dist[0]!, originStationId: stationIds[0]! })], { replace: true });
    for (let i = 0; i < 4; i++) expect((await at(passenger, i)).arrivals).toEqual([]);
  });

  it('is public, and rejects a bad or unknown station', async () => {
    expect((await anon().call('GET', `/eta/stations/${stationIds[0]}`)).status).toBe(200);
    expect((await passenger.call('GET', '/eta/stations/not-an-id')).status).toBe(400);
    expect((await passenger.call('GET', '/eta/stations/00000000-0000-4000-8000-000000000000')).status).toBe(404);
  });
});

describe('ETA for buses (ETA-01)', () => {
  it('gives each bus on the road its next station and the end of its run; parked buses have none', async () => {
    await tracking.trackingService.recordPositions(
      [
        update(bus.line!, { distanceMeters: dist[0]! + 500, direction: 1, originStationId: stationIds[0]!, destinationStationId: stationIds[3]! }),
        update(bus.crew1!, { service: 'dispatch', distanceMeters: dist[0]!, originStationId: stationIds[0]!, destinationStationId: stationIds[2]!, tripId: null }),
        update(bus.crew2!, { service: 'parked', atStation: true, distanceMeters: dist[0]!, originStationId: stationIds[0]! }),
      ],
      { replace: true },
    );
    const etas = (await passenger.call('GET', '/eta/buses')).body.data as BusEta[];
    expect(etas.map((e) => e.busId).sort()).toEqual([bus.line, bus.crew1].sort());

    const line = etas.find((e) => e.busId === bus.line)!;
    expect(line.next).toMatchObject({ stationName: 'B' });
    near(line.next!.seconds, (dist[1]! - dist[0]! - 500) / 10);
    expect(line.destination).toMatchObject({ stationName: 'D' });
    near(line.destination!.seconds, (dist[3]! - dist[0]! - 500) / 10 + 2 * DWELL);

    const dispatched = etas.find((e) => e.busId === bus.crew1)!;
    expect(dispatched.next).toMatchObject({ stationName: 'C' });
    expect(dispatched.destination).toEqual(dispatched.next);
    near(dispatched.destination!.seconds, dist[2]! / 10);
  });
});

describe('who may see which estimate', () => {
  it('a konduktor gets only their own bus, from the buses list and from a station', async () => {
    await tracking.trackingService.recordPositions(
      [
        update(bus.line!, { distanceMeters: dist[0]!, direction: 1, originStationId: stationIds[0]!, destinationStationId: stationIds[3]! }),
        update(bus.crew1!, { service: 'dispatch', distanceMeters: dist[0]!, originStationId: stationIds[0]!, destinationStationId: stationIds[3]!, tripId: null }),
      ],
      { replace: true },
    );
    expect(((await kond1.call('GET', '/eta/buses')).body.data as BusEta[]).map((e) => e.busId)).toEqual([bus.crew1]);
    expect((await at(kond1, 3)).arrivals.map((a) => a.busName)).toEqual(['Crew One']);

    // The other konduktor's bus is not on the road, so they see nothing: never someone else's bus.
    expect((await kond2.call('GET', '/eta/buses')).body.data).toEqual([]);
    expect((await at(kond2, 3)).arrivals).toEqual([]);

    // Passengers and admins see them all.
    expect((await at(passenger, 3)).arrivals).toHaveLength(2);
    expect(((await admin.call('GET', '/eta/buses')).body.data as BusEta[]).length).toBe(2);
  });
});
