/** Station rules: contiguous sequence 1..N, route distances from the active stations (STN-01..05). */
import { getDb, transaction, type SQLExecutor } from '@core/database';
import { ApiError } from '@lib/response';
import { routeService } from '@modules/route/route.service';
import { buildRoutePath, type LatLng } from '@shared/geo/route';
import { stationsRepository } from './stations.repository';
import type { StationDemand } from '@shared/tracking/models';
import type { StationRow, StationView } from './stations.types';

/** Distances are measured along the active stations only, so a deactivated stop does not stretch the route. */
export function toViews(rows: StationRow[], legs: readonly (readonly LatLng[] | null)[] = []): StationView[] {
  const active = rows.filter((r) => r.is_active);
  // Along the real road where its geometry is known (`legs`, one per pair of neighbouring active stations), else straight.
  const route = buildRoutePath(active.map((r) => ({ latitude: r.latitude, longitude: r.longitude })), legs);
  const distanceById = new Map(active.map((r, i) => [r.id, route.stationDistances[i]!]));
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    sequence: r.sequence,
    latitude: r.latitude,
    longitude: r.longitude,
    isActive: r.is_active,
    distanceMeters: Math.round(distanceById.get(r.id) ?? 0),
  }));
}

export const stationsService = {
  async list(opts: { includeInactive: boolean }, db: SQLExecutor = getDb()): Promise<StationView[]> {
    // Distances need the full line, so load everything and filter afterwards.
    const all = await stationsRepository.list(db, { includeInactive: true });
    const views = toViews(all, await routeService.legsFor(db, all.filter((r) => r.is_active)));
    return opts.includeInactive ? views : views.filter((v) => v.isActive);
  },

  async get(id: string, db: SQLExecutor = getDb()): Promise<StationView> {
    const views = await stationsService.list({ includeInactive: true }, db);
    const found = views.find((v) => v.id === id);
    if (!found) throw ApiError.notFound('Station not found');
    return found;
  },

  async create(input: { name: string; latitude: number; longitude: number; sequence?: number }): Promise<StationView> {
    const id = await transaction(async (tx) => {
      const count = await stationsRepository.count(tx);
      const sequence = Math.min(input.sequence ?? count + 1, count + 1);
      if (sequence <= count) await stationsRepository.shiftFrom(tx, sequence);
      return (await stationsRepository.insert(tx, { ...input, sequence })).id;
    });
    routeService.refreshInBackground();
    return stationsService.get(id);
  },

  async update(id: string, patch: { name?: string; latitude?: number; longitude?: number; isActive?: boolean }): Promise<StationView> {
    const row = await stationsRepository.update(getDb(), id, patch);
    if (!row) throw ApiError.notFound('Station not found');
    routeService.refreshInBackground();
    return stationsService.get(id);
  },

  async remove(id: string): Promise<void> {
    await transaction(async (tx) => {
      const row = await stationsRepository.findById(tx, id);
      if (!row) throw ApiError.notFound('Station not found');
      try {
        await stationsRepository.delete(tx, id);
      } catch (err) {
        // Tickets reference stations with ON DELETE RESTRICT (from P5): deactivate instead of deleting history.
        if ((err as { code?: string }).code === '23503') {
          throw ApiError.conflict('This station is used by existing tickets or fares. Deactivate it instead.');
        }
        throw err;
      }
      await stationsRepository.closeGapAfter(tx, row.sequence);
    });
    routeService.refreshInBackground();
  },

  /** `ids` must list every station exactly once. */
  async reorder(ids: string[]): Promise<StationView[]> {
    await transaction(async (tx) => {
      const current = await stationsRepository.list(tx, { includeInactive: true });
      const known = new Set(current.map((r) => r.id));
      if (ids.length !== known.size || new Set(ids).size !== ids.length || ids.some((id) => !known.has(id))) {
        throw ApiError.badRequest('The order must list every station exactly once');
      }
      await stationsRepository.applyOrder(tx, ids);
    });
    routeService.refreshInBackground();
    return stationsService.list({ includeInactive: true });
  },

  /**
   * Tickets bought at each station, as counts (GEN-01: demand data, never a list of passengers and never tied to a bus).
   * Every station is listed, with zeros where nothing was sold.
   */
  async demand(db: SQLExecutor = getDb()): Promise<StationDemand[]> {
    const [stations, totals, pairs] = await Promise.all([
      stationsRepository.list(db, { includeInactive: true }),
      stationsRepository.demandTotals(db),
      stationsRepository.demandByDestination(db),
    ]);
    const totalById = new Map(totals.map((t) => [t.station_id, t]));
    return stations.map((station) => ({
      stationId: station.id,
      validTickets: totalById.get(station.id)?.valid_tickets ?? 0,
      soldToday: totalById.get(station.id)?.sold_today ?? 0,
      byDestination: pairs
        .filter((p) => p.origin_station_id === station.id)
        .map((p) => ({ stationId: p.destination_station_id, count: p.n }))
        .sort((a, b) => b.count - a.count),
    }));
  },
};
