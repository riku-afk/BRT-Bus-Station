import { describe, expect, it } from 'vitest';
import { bearingDegrees, buildRoute, haversineMeters, positionAlongRoute } from './route';

const manila = { latitude: 14.5995, longitude: 120.9842 };
const cavite = { latitude: 14.4791, longitude: 120.8969 };

describe('route geometry', () => {
  it('measures great-circle distance', () => {
    expect(haversineMeters(manila, manila)).toBe(0);
    expect(haversineMeters(manila, cavite)).toBeGreaterThan(15_000);
    expect(haversineMeters(manila, cavite)).toBeLessThan(17_000);
    // 0.01° of latitude is about 1.11 km everywhere.
    expect(haversineMeters({ latitude: 14, longitude: 121 }, { latitude: 14.01, longitude: 121 })).toBeCloseTo(1111.95, 0);
  });

  it('builds cumulative distances in input order', () => {
    const a = { latitude: 14, longitude: 121 };
    const b = { latitude: 14.01, longitude: 121 };
    const c = { latitude: 14.02, longitude: 121 };
    const route = buildRoute([a, b, c]);
    expect(route.cumulativeMeters[0]).toBe(0);
    expect(route.cumulativeMeters[2]).toBeCloseTo(route.cumulativeMeters[1]! * 2, 3);
    expect(route.totalMeters).toBe(route.cumulativeMeters[2]);
  });

  it('interpolates a position along the route and clamps at the ends', () => {
    const pts = [
      { latitude: 14, longitude: 121 },
      { latitude: 14.01, longitude: 121 },
      { latitude: 14.01, longitude: 121.01 },
    ];
    const route = buildRoute(pts);
    const mid = positionAlongRoute(pts, route, route.cumulativeMeters[1]! / 2);
    expect(mid.latitude).toBeCloseTo(14.005, 5);
    expect(mid.headingDegrees).toBeCloseTo(0, 3); // heading north on the first segment
    expect(positionAlongRoute(pts, route, -50)).toMatchObject({ latitude: 14, longitude: 121 });
    expect(positionAlongRoute(pts, route, 1e9)).toMatchObject({ latitude: 14.01, longitude: 121.01 });
    expect(positionAlongRoute(pts, route, route.cumulativeMeters[1]! + 10).headingDegrees).toBeCloseTo(90, 0);
  });

  it('computes compass bearings', () => {
    const o = { latitude: 14, longitude: 121 };
    expect(bearingDegrees(o, { latitude: 15, longitude: 121 })).toBeCloseTo(0, 3);
    expect(bearingDegrees(o, { latitude: 14, longitude: 122 })).toBeCloseTo(90, 0);
    expect(bearingDegrees(o, { latitude: 13, longitude: 121 })).toBeCloseTo(180, 3);
    expect(bearingDegrees(o, { latitude: 14, longitude: 120 })).toBeCloseTo(270, 0);
  });
});
