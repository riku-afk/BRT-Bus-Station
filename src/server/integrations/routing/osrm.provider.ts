import { haversineMeters, simplifyPath, type LatLng } from '@shared/geo/route';
import type { RoadLeg, RoutingProvider } from './routing-provider';

const REQUEST_TIMEOUT_MS = 15_000;
/** Road geometry is thinned to this tolerance: the shape of the road, a fraction of the points. */
const SIMPLIFY_METERS = 2;
/**
 * A road between two neighbouring shelters is never shorter than the straight line, and a sane one is not many times longer. Anything
 * outside this is the router going round the block or snapping to the wrong road: better a straight line than a wrong road.
 */
const MIN_RATIO = 0.95;
const MAX_RATIO = 3;
const MAX_EXTRA_METERS = 1500;

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export class OsrmRoutingProvider implements RoutingProvider {
  readonly name = 'osrm' as const;
  private readonly fetchFn: FetchLike;

  constructor(
    private readonly baseUrl: string,
    fetchFn?: FetchLike,
  ) {
    this.fetchFn = fetchFn ?? ((url, init) => fetch(url, init));
  }

  async leg(from: LatLng, to: LatLng): Promise<RoadLeg | null> {
    // OSRM wants lng,lat.
    const url = `${this.baseUrl.replace(/\/+$/, '')}/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson&steps=false`;
    let body: unknown;
    try {
      const res = await this.fetchFn(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
      if (!res.ok) return null;
      body = await res.json();
    } catch {
      return null;
    }

    const routes = (body as { code?: string; routes?: { distance?: number; geometry?: { coordinates?: unknown } }[] } | null)?.routes;
    const best = routes?.[0];
    const coordinates = best?.geometry?.coordinates;
    if ((body as { code?: string }).code !== 'Ok' || !best || !Array.isArray(coordinates) || coordinates.length < 2) return null;

    const points: LatLng[] = [];
    for (const c of coordinates) {
      if (!Array.isArray(c) || typeof c[0] !== 'number' || typeof c[1] !== 'number') return null;
      points.push({ latitude: c[1], longitude: c[0] });
    }
    const straight = haversineMeters(from, to);
    const distanceMeters = typeof best.distance === 'number' && best.distance > 0 ? best.distance : 0;
    if (distanceMeters === 0) return null;
    if (distanceMeters < straight * MIN_RATIO || distanceMeters > straight * MAX_RATIO + MAX_EXTRA_METERS) return null;

    return { points: simplifyPath(points, SIMPLIFY_METERS), distanceMeters };
  }
}
