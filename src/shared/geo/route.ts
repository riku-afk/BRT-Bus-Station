/**
 * Route geometry. Stations in sequence, joined either by straight segments (the fallback) or by the real road between each pair
 * (a "leg" fetched from a routing service). Browser-safe, shared by the API, the simulator, ETA and the maps.
 */

export type LatLng = { latitude: number; longitude: number };

const EARTH_RADIUS_M = 6_371_008.8;
const toRad = (deg: number) => (deg * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export type Route = {
  /** Distance from the first station to each station, in metres (same order as the input). */
  cumulativeMeters: number[];
  totalMeters: number;
};

/** `points` must already be in line order. */
export function buildRoute(points: readonly LatLng[]): Route {
  const cumulativeMeters: number[] = [];
  let total = 0;
  points.forEach((point, i) => {
    if (i > 0) total += haversineMeters(points[i - 1]!, point);
    cumulativeMeters.push(total);
  });
  return { cumulativeMeters, totalMeters: total };
}

/** Position `distanceMeters` along the route (clamped to its ends), plus the heading of the segment it is on. */
export function positionAlongRoute(points: readonly LatLng[], route: Route, distanceMeters: number): LatLng & { headingDegrees: number } {
  if (points.length === 0) throw new Error('Route has no points');
  if (points.length === 1) return { ...points[0]!, headingDegrees: 0 };
  const d = Math.min(Math.max(distanceMeters, 0), route.totalMeters);
  let i = 1;
  while (i < points.length - 1 && route.cumulativeMeters[i]! < d) i++;
  const from = points[i - 1]!;
  const to = points[i]!;
  const segmentStart = route.cumulativeMeters[i - 1]!;
  const segmentLength = route.cumulativeMeters[i]! - segmentStart;
  const t = segmentLength === 0 ? 0 : (d - segmentStart) / segmentLength;
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * t,
    longitude: from.longitude + (to.longitude - from.longitude) * t,
    headingDegrees: bearingDegrees(from, to),
  };
}

/** Initial compass bearing from `a` to `b`, 0–360. */
export function bearingDegrees(a: LatLng, b: LatLng): number {
  const dLng = toRad(b.longitude - a.longitude);
  const y = Math.sin(dLng) * Math.cos(toRad(b.latitude));
  const x = Math.cos(toRad(a.latitude)) * Math.sin(toRad(b.latitude)) - Math.sin(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.cos(dLng);
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

// ── The route as a path along the real road ────────────────────────────────────────────────────────────────────────────────

/**
 * The whole line as one polyline. `points` follow the road between shelters (or a straight line where no road geometry is known),
 * `cumulativeMeters[i]` is the distance from the start to `points[i]`, and `stationDistances[k]` is how far along the k-th
 * shelter is. Every distance the system uses (bus position, ETA, fare distance) is measured along this path.
 */
export type RoutePath = {
  points: LatLng[];
  cumulativeMeters: number[];
  totalMeters: number;
  stationDistances: number[];
};

/**
 * `legs[i]` is the road from station i to station i+1 (null or missing: a straight line). A leg's end points are where the road
 * meets the shelters, a few metres from them; the path goes shelter, road, shelter, so it always passes exactly through each shelter.
 */
export function buildRoutePath(stations: readonly LatLng[], legs: readonly (readonly LatLng[] | null | undefined)[] = []): RoutePath {
  const points: LatLng[] = [];
  const cumulativeMeters: number[] = [];
  const stationDistances: number[] = [];
  let total = 0;
  const push = (p: LatLng) => {
    if (points.length > 0) total += haversineMeters(points[points.length - 1]!, p);
    points.push({ latitude: p.latitude, longitude: p.longitude });
    cumulativeMeters.push(total);
  };
  stations.forEach((station, i) => {
    const leg = i > 0 ? legs[i - 1] : null;
    if (leg) for (const p of leg) push(p);
    push(station);
    stationDistances.push(total);
  });
  return { points, cumulativeMeters, totalMeters: total, stationDistances };
}

/** Position `distanceMeters` along the path (clamped to its ends) and the heading of the piece of road it is on. */
export function positionAlongPath(path: RoutePath, distanceMeters: number): LatLng & { headingDegrees: number } {
  const { points, cumulativeMeters: cum } = path;
  if (points.length === 0) throw new Error('Route has no points');
  if (points.length === 1) return { ...points[0]!, headingDegrees: 0 };
  const d = Math.min(Math.max(distanceMeters, 0), path.totalMeters);
  // First vertex at or beyond d (binary search), then the piece before it.
  let lo = 1;
  let hi = points.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid]! < d) lo = mid + 1;
    else hi = mid;
  }
  const from = points[lo - 1]!;
  const to = points[lo]!;
  const start = cum[lo - 1]!;
  const length = cum[lo]! - start;
  const t = length === 0 ? 0 : (d - start) / length;
  return {
    latitude: from.latitude + (to.latitude - from.latitude) * t,
    longitude: from.longitude + (to.longitude - from.longitude) * t,
    headingDegrees: headingAt(points, lo),
  };
}

/** Bearing of the piece ending at `points[i]`, looking back past zero-length pieces (duplicate vertices have no direction). */
function headingAt(points: readonly LatLng[], i: number): number {
  for (let k = i; k >= 1; k--) {
    const a = points[k - 1]!;
    const b = points[k]!;
    if (a.latitude !== b.latitude || a.longitude !== b.longitude) return bearingDegrees(a, b);
  }
  return 0;
}

/** The part of the path between two distances, as points (for highlighting a trip on the map). */
export function slicePath(path: RoutePath, fromMeters: number, toMeters: number): LatLng[] {
  const lo = Math.max(0, Math.min(fromMeters, toMeters));
  const hi = Math.min(path.totalMeters, Math.max(fromMeters, toMeters));
  if (path.points.length === 0 || hi <= lo) return [];
  const out: LatLng[] = [positionAlongPath(path, lo)];
  path.points.forEach((p, i) => {
    const at = path.cumulativeMeters[i]!;
    if (at > lo && at < hi) out.push(p);
  });
  out.push(positionAlongPath(path, hi));
  return out.map(({ latitude, longitude }) => ({ latitude, longitude }));
}

/** Cumulative distances for a bare polyline. */
export function cumulativeOf(points: readonly LatLng[]): number[] {
  let total = 0;
  return points.map((p, i) => {
    if (i > 0) total += haversineMeters(points[i - 1]!, p);
    return total;
  });
}

/**
 * Drop vertices that lie within `toleranceMeters` of the line through their neighbours (Douglas-Peucker). Road geometry has a
 * vertex every few metres; this keeps its shape with a fraction of the points.
 */
export function simplifyPath(points: readonly LatLng[], toleranceMeters: number): LatLng[] {
  if (points.length <= 2) return points.map((p) => ({ ...p }));
  // Local flat approximation in metres around the first point: accurate for a stretch of road.
  const lat0 = toRad(points[0]!.latitude);
  const xy = points.map((p) => ({
    x: EARTH_RADIUS_M * toRad(p.longitude - points[0]!.longitude) * Math.cos(lat0),
    y: EARTH_RADIUS_M * toRad(p.latitude - points[0]!.latitude),
  }));
  const keep = new Array<boolean>(points.length).fill(false);
  keep[0] = true;
  keep[points.length - 1] = true;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [a, b] = stack.pop()!;
    let worst = -1;
    let worstDistance = toleranceMeters;
    for (let i = a + 1; i < b; i++) {
      const dist = distanceToSegment(xy[i]!, xy[a]!, xy[b]!);
      if (dist > worstDistance) {
        worstDistance = dist;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = true;
      stack.push([a, worst], [worst, b]);
    }
  }
  return points.filter((_, i) => keep[i]).map((p) => ({ ...p }));
}

function distanceToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}
