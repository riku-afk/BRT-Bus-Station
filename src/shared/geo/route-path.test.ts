import { describe, expect, it } from 'vitest';
import { buildRoutePath, cumulativeOf, haversineMeters, positionAlongPath, simplifyPath, slicePath, type LatLng } from './route';

// Three shelters on a meridian, about 1.1 km apart.
const A: LatLng = { latitude: 14, longitude: 121 };
const B: LatLng = { latitude: 14.01, longitude: 121 };
const C: LatLng = { latitude: 14.02, longitude: 121 };
// The road from A to B bends out east: it is longer than the straight line.
const detourAB: LatLng[] = [
  { latitude: 14.0001, longitude: 121.0001 },
  { latitude: 14.005, longitude: 121.01 },
  { latitude: 14.0099, longitude: 121.0001 },
];

describe('buildRoutePath', () => {
  it('without roads it is the straight line through the shelters', () => {
    const path = buildRoutePath([A, B, C]);
    expect(path.points).toEqual([A, B, C]);
    expect(path.stationDistances[0]).toBe(0);
    expect(path.stationDistances[1]).toBeCloseTo(haversineMeters(A, B), 3);
    expect(path.totalMeters).toBeCloseTo(haversineMeters(A, B) + haversineMeters(B, C), 3);
  });

  it('follows the road where it is known: longer, and every shelter is still exactly on the path', () => {
    const straight = buildRoutePath([A, B, C]);
    const road = buildRoutePath([A, B, C], [detourAB, null]);
    expect(road.stationDistances[1]).toBeGreaterThan(straight.stationDistances[1]! * 1.5);
    // The second leg has no road: still straight.
    expect(road.totalMeters - road.stationDistances[1]!).toBeCloseTo(haversineMeters(B, C), 3);
    // Shelters are vertices of the path at their own distances.
    expect(road.points[0]).toEqual(A);
    expect(road.points[road.cumulativeMeters.indexOf(road.stationDistances[1]!)]).toEqual(B);
    expect(road.points.at(-1)).toEqual(C);
  });

  it('cumulative distances never decrease and end at the total', () => {
    const road = buildRoutePath([A, B, C], [detourAB, detourAB.map((p) => ({ latitude: p.latitude + 0.01, longitude: p.longitude }))]);
    for (let i = 1; i < road.cumulativeMeters.length; i++) expect(road.cumulativeMeters[i]!).toBeGreaterThanOrEqual(road.cumulativeMeters[i - 1]!);
    expect(road.cumulativeMeters.at(-1)).toBe(road.totalMeters);
    expect(road.stationDistances.at(-1)).toBe(road.totalMeters);
  });

  it('handles one shelter, none, and legs shorter than the list', () => {
    expect(buildRoutePath([A]).totalMeters).toBe(0);
    expect(buildRoutePath([]).points).toEqual([]);
    expect(buildRoutePath([A, B, C], [detourAB]).points.length).toBe(3 + detourAB.length); // the last leg is missing: straight
  });
});

describe('positionAlongPath', () => {
  const road = buildRoutePath([A, B], [detourAB]);

  it('is at the shelters at the ends', () => {
    expect(positionAlongPath(road, 0)).toMatchObject({ latitude: A.latitude, longitude: A.longitude });
    expect(positionAlongPath(road, road.totalMeters)).toMatchObject({ latitude: B.latitude, longitude: B.longitude });
    expect(positionAlongPath(road, -50)).toMatchObject({ latitude: A.latitude });
    expect(positionAlongPath(road, 1e9)).toMatchObject({ latitude: B.latitude });
  });

  it('stays ON the road: midway it is out at the bend, not on the straight line between the shelters', () => {
    const middle = positionAlongPath(road, road.totalMeters / 2);
    expect(middle.longitude).toBeGreaterThan(121.004); // the straight line is at 121
    // Every position along the way is on the polyline.
    for (let d = 0; d <= road.totalMeters; d += road.totalMeters / 40) {
      const p = positionAlongPath(road, d);
      const nearest = Math.min(...segmentDistances(road.points, p));
      expect(nearest).toBeLessThan(0.5);
    }
  });

  it('points the way the road goes (heading follows each piece), skipping duplicate vertices', () => {
    const heading = positionAlongPath(buildRoutePath([A, B]), 100).headingDegrees;
    expect(heading).toBeCloseTo(0, 0); // due north
    const duplicated = buildRoutePath([A, B], [[{ ...A }, { ...A }, { latitude: 14.005, longitude: 121 }, { ...B }]]);
    expect(positionAlongPath(duplicated, 10).headingDegrees).toBeCloseTo(0, 0);
  });

  it('is monotonic: further along the path is never behind', () => {
    let last = -1;
    for (let d = 0; d <= road.totalMeters; d += 25) {
      const progress = road.cumulativeMeters.findIndex((c) => c >= d);
      expect(progress).toBeGreaterThanOrEqual(last);
      last = progress;
    }
  });
});

/** Distance in metres from `p` to every piece of the polyline (flat approximation: fine at this scale). */
function segmentDistances(points: LatLng[], p: LatLng): number[] {
  const m = 111_320;
  const k = Math.cos((p.latitude * Math.PI) / 180);
  const xy = (q: LatLng) => ({ x: (q.longitude - p.longitude) * m * k, y: (q.latitude - p.latitude) * m });
  const out: number[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = xy(points[i - 1]!);
    const b = xy(points[i]!);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = dx * dx + dy * dy;
    const t = len === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / len));
    out.push(Math.hypot(a.x + t * dx, a.y + t * dy));
  }
  return out;
}

describe('slicePath', () => {
  const road = buildRoutePath([A, B, C], [detourAB, null]);

  it('is the part of the road between two distances, with exact ends, in either order', () => {
    const [from, to] = [road.stationDistances[0]!, road.stationDistances[1]!];
    const slice = slicePath(road, from, to);
    expect(slice[0]).toMatchObject({ latitude: A.latitude });
    expect(slice.at(-1)).toMatchObject({ latitude: B.latitude, longitude: B.longitude });
    expect(slice.length).toBeGreaterThanOrEqual(detourAB.length);
    expect(slicePath(road, to, from)).toEqual(slice);
  });

  it('is empty for no distance, and clamps to the road', () => {
    expect(slicePath(road, 10, 10)).toEqual([]);
    const whole = slicePath(road, -100, 1e9);
    expect(whole[0]).toMatchObject({ latitude: A.latitude });
    expect(whole.at(-1)).toMatchObject({ latitude: C.latitude });
  });
});

describe('simplifyPath', () => {
  it('drops points that are on the line and keeps the corners', () => {
    const straight: LatLng[] = Array.from({ length: 50 }, (_, i) => ({ latitude: 14 + i * 0.0001, longitude: 121 }));
    expect(simplifyPath(straight, 2)).toHaveLength(2);
    const corner: LatLng[] = [...straight, ...Array.from({ length: 50 }, (_, i) => ({ latitude: 14.0049, longitude: 121 + (i + 1) * 0.0001 }))];
    const simple = simplifyPath(corner, 2);
    expect(simple.length).toBeLessThanOrEqual(4);
    expect(simple.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps the first and last point exactly, and never moves the road more than the tolerance', () => {
    const wiggly: LatLng[] = Array.from({ length: 200 }, (_, i) => ({ latitude: 14 + i * 0.00005, longitude: 121 + Math.sin(i / 5) * 0.0004 }));
    const simple = simplifyPath(wiggly, 3);
    expect(simple[0]).toEqual(wiggly[0]);
    expect(simple.at(-1)).toEqual(wiggly.at(-1));
    expect(simple.length).toBeLessThan(wiggly.length);
    for (const p of wiggly) expect(Math.min(...segmentDistances(simple, p))).toBeLessThanOrEqual(3.2);
  });

  it('leaves tiny inputs alone', () => {
    expect(simplifyPath([], 2)).toEqual([]);
    expect(simplifyPath([A], 2)).toEqual([A]);
    expect(simplifyPath([A, B], 2)).toEqual([A, B]);
  });
});

describe('cumulativeOf', () => {
  it('starts at zero and adds each piece', () => {
    const c = cumulativeOf([A, B, C]);
    expect(c[0]).toBe(0);
    expect(c[2]).toBeCloseTo(haversineMeters(A, B) + haversineMeters(B, C), 3);
  });
});
