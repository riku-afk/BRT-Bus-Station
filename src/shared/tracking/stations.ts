import type { BusPosition } from './models';

/**
 * "Dispatch to the end of the line": the terminal a bus at `index` is farthest from, so it always makes a real trip.
 * At either terminal that is the other terminal; in the middle it is the farther one (the last on a tie).
 * Indexes are positions in the active-station list, `count` its length (at least 2).
 */
export function farEndIndex(index: number, count: number): number {
  if (count < 2) throw new Error('A line needs at least two stations');
  const last = count - 1;
  if (index <= 0) return last;
  if (index >= last) return 0;
  return index < last / 2 ? last : 0;
}

/**
 * Where a bus waiting at `hereId` is headed: the destination its konduktor announced, if it is a different station in service,
 * otherwise the far end of the line. One rule for what passengers are shown, what a ticket is priced for, and where dispatch goes.
 */
export function headingToId(stationIds: readonly string[], hereId: string, plannedId: string | null): string | null {
  if (plannedId && plannedId !== hereId && stationIds.includes(plannedId)) return plannedId;
  const here = stationIds.indexOf(hereId);
  if (here < 0 || stationIds.length < 2) return null;
  return stationIds[farEndIndex(here, stationIds.length)] ?? null;
}

/** Buses waiting at each station (parked, available), by station id, in the order given. */
export function groupParkedByStation(buses: readonly BusPosition[]): Map<string, BusPosition[]> {
  const byStation = new Map<string, BusPosition[]>();
  for (const bus of buses) {
    if (bus.service !== 'parked' || !bus.originStationId) continue;
    const list = byStation.get(bus.originStationId) ?? [];
    list.push(bus);
    byStation.set(bus.originStationId, list);
  }
  return byStation;
}
