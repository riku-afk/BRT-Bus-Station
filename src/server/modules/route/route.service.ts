/**
 * The route buses drive: the real road between each pair of neighbouring shelters, stitched into one path. Everything that
 * measures distance along the line (where a bus is, ETA, the distance a fare is based on) uses this one path, so the map, the
 * simulator and the estimates always agree.
 *
 * Road geometry is fetched from a routing service once and stored (`route_segments`); nothing here calls it while serving a
 * request. A pair with no stored road (not fetched yet, the service was down, or a shelter was moved since) is a straight line
 * until the road is fetched, so the system works either way.
 */
import { getDb, type SQLExecutor } from '@core/database';
import { getRoutingProvider } from '@integrations/routing';
import { stationsRepository } from '@modules/stations/stations.repository';
import { buildRoutePath, type LatLng, type RoutePath } from '@shared/geo/route';
import { routeRepository, type SegmentRow } from './route.repository';

type Shelter = { id: string; latitude: number; longitude: number };

/** A stored road is only good for the exact coordinates it was fetched for. */
const SAME_PLACE = 1e-6;
const sameSpot = (aLat: number, aLng: number, b: Shelter) => Math.abs(aLat - b.latitude) < SAME_PLACE && Math.abs(aLng - b.longitude) < SAME_PLACE;
/** The public OSRM server allows about one request a second. */
const REQUEST_GAP_MS = 1100;

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type RouteSummary = RoutePath & { roadLegs: number; legs: number };

let running: Promise<{ built: number; failed: number }> | null = null;
let again = false;

export const routeService = {
  /** The stored road for each consecutive pair of `stations` (null where there is none, or where it is stale). */
  async legsFor(db: SQLExecutor, stations: readonly Shelter[]): Promise<(LatLng[] | null)[]> {
    if (stations.length < 2) return [];
    const byPair = new Map<string, SegmentRow>((await routeRepository.list(db)).map((r) => [`${r.from_station_id}>${r.to_station_id}`, r]));
    const legs: (LatLng[] | null)[] = [];
    for (let i = 0; i < stations.length - 1; i++) {
      const a = stations[i]!;
      const b = stations[i + 1]!;
      const row = byPair.get(`${a.id}>${b.id}`);
      legs.push(row && sameSpot(row.from_lat, row.from_lng, a) && sameSpot(row.to_lat, row.to_lng, b) ? row.geometry.map(([latitude, longitude]) => ({ latitude, longitude })) : null);
    }
    return legs;
  },

  /** The whole line as one path along the roads, for the active shelters in line order. */
  async path(db: SQLExecutor = getDb()): Promise<RouteSummary> {
    const stations = await stationsRepository.list(db, { includeInactive: false });
    const legs = await routeService.legsFor(db, stations);
    const path = buildRoutePath(stations, legs);
    return { ...path, roadLegs: legs.filter(Boolean).length, legs: legs.length };
  },

  /**
   * Fetch the road for every pair that has none (or a stale one). `force` refetches everything. Calls the routing service one
   * pair at a time, politely, and stores each as it arrives, so a failure part way keeps what was fetched.
   */
  async ensure(opts: { force?: boolean; onProgress?: (done: number, total: number, ok: boolean) => void } = {}): Promise<{ built: number; failed: number }> {
    const provider = getRoutingProvider();
    if (provider.name === 'none') return { built: 0, failed: 0 };
    const db = getDb();
    const stations = await stationsRepository.list(db, { includeInactive: false });
    if (opts.force) await routeRepository.deleteAll(db);
    const legs = await routeService.legsFor(db, stations);
    const missing = legs.map((leg, i) => (leg ? -1 : i)).filter((i) => i >= 0);

    let built = 0;
    let failed = 0;
    for (const [n, i] of missing.entries()) {
      if (n > 0) await pause(REQUEST_GAP_MS);
      const a = stations[i]!;
      const b = stations[i + 1]!;
      const road = await provider.leg(a, b);
      if (road) {
        await routeRepository.upsert(db, {
          from_station_id: a.id,
          to_station_id: b.id,
          from_lat: a.latitude,
          from_lng: a.longitude,
          to_lat: b.latitude,
          to_lng: b.longitude,
          geometry: road.points.map((p) => [p.latitude, p.longitude]),
          distance_meters: road.distanceMeters,
          source: provider.name,
        });
        built++;
      } else {
        failed++;
      }
      opts.onProgress?.(n + 1, missing.length, road !== null);
    }
    return { built, failed };
  },

  /**
   * After a shelter is added, moved, reordered or removed: fetch whatever road is now missing, in the background. One run at a time;
   * a change that arrives during a run triggers one more run afterwards. Never throws and never delays the request that caused it.
   */
  refreshInBackground(): void {
    if (getRoutingProvider().name === 'none') return;
    if (running) {
      again = true;
      return;
    }
    running = routeService
      .ensure()
      .catch(() => ({ built: 0, failed: 0 }))
      .finally(() => {
        running = null;
        if (again) {
          again = false;
          routeService.refreshInBackground();
        }
      });
  },
};
