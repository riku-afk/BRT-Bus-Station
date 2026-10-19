import { describe, expect, it, vi } from 'vitest';
import { OsrmRoutingProvider } from './osrm.provider';

const from = { latitude: 14.4442, longitude: 120.915439 };
const to = { latitude: 14.434538, longitude: 120.921902 }; // about 1.3 km away

const osrm = (coordinates: unknown, extra: Record<string, unknown> = {}) =>
  new Response(JSON.stringify({ code: 'Ok', routes: [{ distance: 1354.8, geometry: { type: 'LineString', coordinates }, ...extra }] }), { status: 200 });

// A realistic road: lng,lat pairs from near `from` to near `to`, dense enough that thinning removes some.
const road = Array.from({ length: 60 }, (_, i) => [120.9154 + (i / 59) * 0.0065, 14.4442 - (i / 59) * 0.0097 + Math.sin(i / 3) * 0.00002]);

describe('OSRM road routing', () => {
  it('asks for the driving route between two points (lng,lat order) and returns the road as lat/lng points with its length', async () => {
    const fetchFn = vi.fn(async () => osrm(road));
    const leg = await new OsrmRoutingProvider('https://osrm.example.test/', fetchFn).leg(from, to);
    const [url] = fetchFn.mock.calls[0] as unknown as [string];
    expect(url).toBe('https://osrm.example.test/route/v1/driving/120.915439,14.4442;120.921902,14.434538?overview=full&geometries=geojson&steps=false');
    expect(leg).not.toBeNull();
    expect(leg!.distanceMeters).toBe(1354.8);
    expect(leg!.points[0]).toEqual({ latitude: road[0]![1], longitude: road[0]![0] }); // lat, lng
    expect(leg!.points.at(-1)).toEqual({ latitude: road.at(-1)![1], longitude: road.at(-1)![0] });
  });

  it('thins the road: the shape with far fewer points', async () => {
    const dense = Array.from({ length: 400 }, (_, i) => [120.9154 + (i / 399) * 0.0065, 14.4442 - (i / 399) * 0.0097]);
    const leg = await new OsrmRoutingProvider('https://osrm.example.test', async () => osrm(dense)).leg(from, to);
    expect(leg!.points.length).toBeLessThan(10);
  });

  it('gives no road when the service has none, is down, or answers nonsense', async () => {
    const provider = (fetchFn: (url: string, init: RequestInit) => Promise<Response>) => new OsrmRoutingProvider('https://osrm.example.test', fetchFn);
    expect(await provider(async () => new Response(JSON.stringify({ code: 'NoRoute', routes: [] }), { status: 200 })).leg(from, to)).toBeNull();
    expect(await provider(async () => new Response('Too Many Requests', { status: 429 })).leg(from, to)).toBeNull();
    expect(await provider(async () => Promise.reject(new Error('ECONNRESET'))).leg(from, to)).toBeNull();
    expect(await provider(async () => new Response('<html>', { status: 200 })).leg(from, to)).toBeNull();
    expect(await provider(async () => osrm([[120.9, 14.4]])).leg(from, to)).toBeNull(); // one point is not a road
    expect(await provider(async () => osrm([[120.9, 14.4], ['x', 1]])).leg(from, to)).toBeNull();
  });

  it('refuses a road that makes no sense for two neighbouring shelters: far too long, or shorter than the straight line', async () => {
    const provider = (distance: number) => new OsrmRoutingProvider('https://osrm.example.test', async () => osrm(road, { distance }));
    expect(await provider(1354.8).leg(from, to)).not.toBeNull();
    expect(await provider(1500).leg(from, to)).not.toBeNull(); // a bit longer than straight: normal
    expect(await provider(9000).leg(from, to)).toBeNull(); // went round the block (and some)
    expect(await provider(300).leg(from, to)).toBeNull(); // shorter than straight: snapped to the wrong place
    expect(await provider(0).leg(from, to)).toBeNull();
  });
});
