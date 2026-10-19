import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { haversineMeters } from '@shared/geo/route';
import { Session, setupTestApp } from './helpers';

/** The route buses drive: the road between shelters, stored, stitched into one path, and used everywhere distance matters. */

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
let routeService: typeof import('@modules/route/route.service').routeService;
let routeRepository: typeof import('@modules/route/route.repository').routeRepository;
let env: typeof import('@config/env').env;
let admin: Session;
const anon = () => new Session({ request: (p, i) => ctx.api.request(p, i) });
const db = () => ctx.db.getDb();

type Station = { id: string; latitude: number; longitude: number; distanceMeters: number };
const ids: string[] = [];
const coords = [
  { latitude: 14, longitude: 121 },
  { latitude: 14.01, longitude: 121 },
  { latitude: 14.02, longitude: 121 },
];
// The road from A to B bows out to the east.
const bend: [number, number][] = [
  [14.0002, 121.0002],
  [14.005, 121.01],
  [14.0098, 121.0002],
];

type RouteBody = { points: [number, number][]; totalMeters: number; stationDistances: number[]; roadLegs: number; legs: number };
const route = async () => (await anon().call('GET', '/route')).body.data as RouteBody;
const stations = async () => (await anon().call('GET', '/stations')).body.data as Station[];
const storeBend = (from = 0, to = 1) =>
  routeRepository.upsert(db(), {
    from_station_id: ids[from]!,
    to_station_id: ids[to]!,
    from_lat: coords[from]!.latitude,
    from_lng: coords[from]!.longitude,
    to_lat: coords[to]!.latitude,
    to_lng: coords[to]!.longitude,
    geometry: bend,
    distance_meters: 2600,
    source: 'test',
  });

beforeAll(async () => {
  ctx = await setupTestApp();
  ({ routeService } = await import('@modules/route/route.service'));
  ({ routeRepository } = await import('@modules/route/route.repository'));
  ({ env } = await import('@config/env'));
  const { authService } = await import('@modules/auth');
  await authService.createUser({ email: 'admin@t.test', password: 'Password123', fullName: 'Admin', role: 'admin' });
  admin = anon();
  await admin.call('POST', '/auth/login', { email: 'admin@t.test', password: 'Password123' });
  for (const [i, c] of coords.entries()) ids.push((await admin.call('POST', '/stations', { name: ['A', 'B', 'C'][i], ...c })).body.data.id);
}, 120_000);

beforeEach(async () => {
  await routeRepository.deleteAll(db());
  (env.routing as { provider: string }).provider = 'none';
  vi.unstubAllGlobals();
  // Put the shelters back where they were (a test may have moved one).
  for (const [i, c] of coords.entries()) await db().query('UPDATE stations SET latitude = $2, longitude = $3 WHERE id = $1', [ids[i], c.latitude, c.longitude]);
});

afterAll(async () => {
  vi.unstubAllGlobals();
  await ctx?.close();
});

describe('the route before any road is stored: straight lines', () => {
  it('is the shelters joined by straight lines, and says none of the legs follows a road', async () => {
    const r = await route();
    expect(r.legs).toBe(2);
    expect(r.roadLegs).toBe(0);
    expect(r.points).toEqual(coords.map((c) => [c.latitude, c.longitude]));
    expect(r.stationDistances[1]).toBeCloseTo(haversineMeters(coords[0]!, coords[1]!), -1);
  });

  it('is public', async () => {
    expect((await anon().call('GET', '/route')).status).toBe(200);
  });
});

describe('with the road stored for a pair of shelters', () => {
  it('the route follows it: longer, with the road\'s own points between the shelters', async () => {
    const straight = await route();
    await storeBend();
    const r = await route();
    expect(r.roadLegs).toBe(1);
    expect(r.points.length).toBe(3 + bend.length);
    expect(r.points).toContainEqual(bend[1]);
    expect(r.stationDistances[1]).toBeGreaterThan(straight.stationDistances[1]! * 1.5);
    // The second leg has no road yet: still straight, and the total is road + straight.
    expect(r.totalMeters - r.stationDistances[1]!).toBeCloseTo(haversineMeters(coords[1]!, coords[2]!), -1);
  });

  it('the shelters list reports distances along the road, so fares, ETAs and the buses all agree with the map', async () => {
    await storeBend();
    const r = await route();
    const list = await stations();
    expect(list.map((s) => s.distanceMeters)).toEqual(r.stationDistances);
  });

  it('a road stored for a shelter that has since been moved is ignored (stale) until it is fetched again', async () => {
    await storeBend();
    expect((await route()).roadLegs).toBe(1);
    await admin.call('PATCH', `/stations/${ids[1]}`, { latitude: 14.011 });
    const r = await route();
    expect(r.roadLegs).toBe(0);
    expect(r.points).toHaveLength(3);
    // And the straight line now goes to where the shelter is.
    expect(r.points[1]).toEqual([14.011, 121]);
  });

  it('a road for shelters that are no longer neighbours is not used', async () => {
    await storeBend();
    await admin.call('PATCH', `/stations/${ids[1]}`, { isActive: false });
    const r = await route();
    expect(r.legs).toBe(1);
    expect(r.roadLegs).toBe(0);
    await admin.call('PATCH', `/stations/${ids[1]}`, { isActive: true });
    expect((await route()).roadLegs).toBe(1); // neighbours again: the stored road is good again
  });

  it('removing a shelter removes its roads', async () => {
    const extra = (await admin.call('POST', '/stations', { name: 'X', latitude: 14.03, longitude: 121 })).body.data.id as string;
    await routeRepository.upsert(db(), { from_station_id: ids[2]!, to_station_id: extra, from_lat: 14.02, from_lng: 121, to_lat: 14.03, to_lng: 121, geometry: [[14.0201, 121], [14.0299, 121]], distance_meters: 1100, source: 'test' });
    await admin.call('DELETE', `/stations/${extra}`);
    expect(await db().query('SELECT 1 FROM route_segments WHERE to_station_id = $1', [extra])).toHaveLength(0);
  });
});

describe('fetching roads from the routing service', () => {
  const osrmFor = (distance = 1400) =>
    new Response(
      JSON.stringify({ code: 'Ok', routes: [{ distance, geometry: { coordinates: [[121.0001, 14.0001], [121.004, 14.005], [121.0001, 14.0099]] } }] }),
      { status: 200 },
    );

  it('fetches the road for every pair that has none and stores it', async () => {
    (env.routing as { provider: string }).provider = 'osrm';
    const fetchFn = vi.fn(async () => osrmFor());
    vi.stubGlobal('fetch', fetchFn);
    const result = await routeService.ensure();
    expect(result).toEqual({ built: 2, failed: 0 });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect((await route()).roadLegs).toBe(2);
    // The coordinates it was fetched for are stored with it.
    const row = (await db().query<{ from_lat: number; to_lat: number; source: string }>('SELECT from_lat, to_lat, source FROM route_segments ORDER BY from_lat'))[0]!;
    expect(row).toMatchObject({ from_lat: 14, to_lat: 14.01, source: 'osrm' });
  }, 20_000);

  it('only fetches what is missing, unless told to fetch everything again', async () => {
    (env.routing as { provider: string }).provider = 'osrm';
    await storeBend(0, 1);
    const fetchFn = vi.fn(async () => osrmFor());
    vi.stubGlobal('fetch', fetchFn);
    expect(await routeService.ensure()).toEqual({ built: 1, failed: 0 });
    expect(fetchFn).toHaveBeenCalledTimes(1);

    fetchFn.mockClear();
    expect(await routeService.ensure()).toEqual({ built: 0, failed: 0 }); // nothing missing
    expect(fetchFn).not.toHaveBeenCalled();

    expect(await routeService.ensure({ force: true })).toEqual({ built: 2, failed: 0 });
  }, 30_000);

  it('keeps what it fetched when one pair has no road: that leg stays straight', async () => {
    (env.routing as { provider: string }).provider = 'osrm';
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => (++calls === 1 ? osrmFor() : new Response(JSON.stringify({ code: 'NoRoute', routes: [] }), { status: 200 }))));
    expect(await routeService.ensure()).toEqual({ built: 1, failed: 1 });
    const r = await route();
    expect(r.roadLegs).toBe(1);
    expect(r.legs).toBe(2);
  }, 20_000);

  it('does nothing, and calls nothing, when routing is turned off', async () => {
    const fetchFn = vi.fn();
    vi.stubGlobal('fetch', fetchFn);
    expect(await routeService.ensure()).toEqual({ built: 0, failed: 0 });
    routeService.refreshInBackground();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('a shelter added, moved or removed starts a background fetch, one at a time, without delaying the request', async () => {
    (env.routing as { provider: string }).provider = 'osrm';
    let inFlight = 0;
    let maxInFlight = 0;
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls++;
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise((r) => setTimeout(r, 30));
        inFlight--;
        return osrmFor();
      }),
    );
    const started = Date.now();
    const res = await admin.call('PATCH', `/stations/${ids[1]}`, { latitude: 14.0105 });
    expect(res.status).toBe(200);
    expect(Date.now() - started).toBeLessThan(800); // it did not wait for the fetch
    await vi.waitFor(async () => expect((await route()).roadLegs).toBe(2), { timeout: 8000, interval: 200 });
    expect(maxInFlight).toBe(1);
    expect(calls).toBeGreaterThanOrEqual(2);
  }, 20_000);
});
