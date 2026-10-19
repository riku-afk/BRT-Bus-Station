/**
 * Arrival estimates (ETA-01, ETA-02). Reads the latest bus positions and the active stations, and applies the pure
 * calculation in `@shared/eta`. Speed and dwell come from the simulator's settings, so the estimate matches how the
 * simulated buses actually move; a real GPS source would feed measured speeds instead.
 *
 * Visibility follows tracking: a konduktor only ever gets estimates for their own bus (decision 16 Oct).
 */
import { env } from '@config/env';
import { getDb, type SQLExecutor } from '@core/database';
import { ApiError } from '@lib/response';
import { stationsService } from '@modules/stations/stations.service';
import { filterVisible, trackingService } from '@modules/tracking/tracking.service';
import { dispatchEta, lineEtas, type BusEta, type EtaParams, type StationArrival, type StationArrivals } from '@shared/eta/eta';
import type { BusPosition } from '@shared/tracking/models';

const params = (): EtaParams => ({ speedKmh: env.simulator.speedKmh, dwellSeconds: env.simulator.dwellSeconds });

type Line = { ids: string[]; names: string[]; distances: number[] };

async function loadLine(db: SQLExecutor): Promise<Line> {
  const stations = await stationsService.list({ includeInactive: false }, db);
  return { ids: stations.map((s) => s.id), names: stations.map((s) => s.name), distances: stations.map((s) => s.distanceMeters) };
}

/** Where a bus is heading overall: the end of the run it is on (a line bus: the terminal in its direction). */
function runEnd(bus: BusPosition, line: Line): number {
  const fromRun = bus.destinationStationId ? line.ids.indexOf(bus.destinationStationId) : -1;
  if (fromRun >= 0) return fromRun;
  return bus.direction === 1 ? line.ids.length - 1 : 0;
}

/** Seconds until `bus` reaches each station it is heading for, by station index. Parked buses are not heading anywhere. */
function arrivalsOf(bus: BusPosition, line: Line, p: EtaParams): Map<number, { seconds: number; stopsAway: number }> {
  const out = new Map<number, { seconds: number; stopsAway: number }>();
  if (bus.service === 'line') {
    for (const e of lineEtas(line.distances, bus, p)) out.set(e.stationIndex, { seconds: e.seconds, stopsAway: e.stopsAway });
  } else if (bus.service === 'dispatch') {
    const destination = bus.destinationStationId ? line.ids.indexOf(bus.destinationStationId) : -1;
    const seconds = destination >= 0 ? dispatchEta(line.distances, bus, destination, p) : null;
    if (seconds !== null) out.set(destination, { seconds, stopsAway: 1 });
  }
  return out;
}

export const etaService = {
  /** The buses that will reach one station, soonest first (ETA-02). */
  async forStation(stationId: string, visible: ReadonlySet<string> | null, db: SQLExecutor = getDb()): Promise<StationArrivals> {
    const line = await loadLine(db);
    const index = line.ids.indexOf(stationId);
    if (index < 0) throw ApiError.notFound('Station not found');
    const p = params();

    const arrivals: StationArrival[] = [];
    for (const bus of filterVisible(await trackingService.listPositions(db), visible)) {
      if (bus.service === 'parked') continue;
      const eta = arrivalsOf(bus, line, p).get(index);
      if (!eta) continue;
      arrivals.push({
        busId: bus.busId,
        busName: bus.busName,
        plateNumber: bus.plateNumber,
        service: bus.service,
        towardsName: line.names[runEnd(bus, line)] ?? null,
        fromName: bus.originStationName,
        seconds: Math.round(eta.seconds),
        stopsAway: eta.stopsAway,
      });
    }
    arrivals.sort((a, b) => a.seconds - b.seconds);
    return { stationId, stationName: line.names[index]!, arrivals };
  },

  /** For each bus on the road: when it reaches its next station and the end of its run. */
  async forBuses(visible: ReadonlySet<string> | null, db: SQLExecutor = getDb()): Promise<BusEta[]> {
    const line = await loadLine(db);
    const p = params();
    const result: BusEta[] = [];
    for (const bus of filterVisible(await trackingService.listPositions(db), visible)) {
      if (bus.service === 'parked') continue;
      const arrivals = arrivalsOf(bus, line, p);
      const next = [...arrivals.entries()].sort((a, b) => a[1].seconds - b[1].seconds)[0];
      const end = runEnd(bus, line);
      const toEnd = arrivals.get(end);
      const at = (i: number, seconds: number) => ({ stationId: line.ids[i]!, stationName: line.names[i]!, seconds: Math.round(seconds) });
      result.push({
        busId: bus.busId,
        next: next ? at(next[0], next[1].seconds) : null,
        destination: toEnd ? at(end, toEnd.seconds) : null,
      });
    }
    return result;
  },
};
