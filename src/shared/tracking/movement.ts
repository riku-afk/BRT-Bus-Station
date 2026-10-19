/**
 * Bus movement along the line (TRK-01). Pure and deterministic: the simulator worker, the ETA calculation (P7)
 * and the tests all use it, and a real GPS source can replace it without touching consumers.
 *
 * A bus is at `distance` metres along the route and heads towards station `nextIndex`. On reaching a station it
 * dwells, then continues; at either end of the line it turns around.
 */
import type { TravelDirection } from './models';

export type MoveState = {
  distance: number;
  direction: TravelDirection;
  /** Index of the station the bus is heading for. */
  nextIndex: number;
  dwellRemaining: number;
  /** Index of the station the bus is currently stopped at, if any. */
  atStationIndex: number | null;
};

export type MoveParams = { speedMps: number; dwellSeconds: number };

export const kmhToMps = (kmh: number) => (kmh * 1000) / 3600;

/** Place a bus at `distance` heading `direction`; flips the direction if it is already at that end of the line. */
export function initialState(stationDistances: readonly number[], distance: number, direction: TravelDirection): MoveState {
  const n = stationDistances.length;
  if (n < 2) return { distance: 0, direction: 1, nextIndex: 0, dwellRemaining: 0, atStationIndex: null };
  const total = stationDistances[n - 1]!;
  const d = Math.min(Math.max(distance, 0), total);

  if (direction === 1) {
    const idx = stationDistances.findIndex((s) => s > d);
    return idx === -1
      ? { distance: d, direction: -1, nextIndex: n - 2, dwellRemaining: 0, atStationIndex: null }
      : { distance: d, direction: 1, nextIndex: idx, dwellRemaining: 0, atStationIndex: null };
  }
  let idx = -1;
  for (let i = n - 1; i >= 0; i--) {
    if (stationDistances[i]! < d) {
      idx = i;
      break;
    }
  }
  return idx === -1
    ? { distance: d, direction: 1, nextIndex: 1, dwellRemaining: 0, atStationIndex: null }
    : { distance: d, direction: -1, nextIndex: idx, dwellRemaining: 0, atStationIndex: null };
}

/** Advance a bus by `dtSeconds`. May cross several stations in one call (the leftover time is carried forward). */
export function advance(state: MoveState, stationDistances: readonly number[], params: MoveParams, dtSeconds: number): MoveState {
  const n = stationDistances.length;
  if (n < 2 || dtSeconds <= 0) return state;
  const s: MoveState = { ...state };
  let remaining = dtSeconds;

  // The guard only protects against pathological input (e.g. stations at identical coordinates with no dwell).
  for (let guard = 0; remaining > 1e-9 && guard < 10_000; guard++) {
    if (s.dwellRemaining > 0) {
      const used = Math.min(s.dwellRemaining, remaining);
      s.dwellRemaining -= used;
      remaining -= used;
      if (s.dwellRemaining <= 1e-9) {
        s.dwellRemaining = 0;
        s.atStationIndex = null;
      }
      continue;
    }
    if (params.speedMps <= 0) break;

    s.atStationIndex = null;
    const target = stationDistances[s.nextIndex]!;
    const gap = Math.abs(target - s.distance);
    const reach = params.speedMps * remaining;
    if (reach < gap) {
      s.distance += s.direction * reach;
      break;
    }

    // Arrive at the station, spend the travel time, and start dwelling.
    remaining -= gap / params.speedMps;
    s.distance = target;
    s.atStationIndex = s.nextIndex;
    s.dwellRemaining = params.dwellSeconds;
    if (s.nextIndex === n - 1) s.direction = -1;
    else if (s.nextIndex === 0) s.direction = 1;
    s.nextIndex += s.direction;
    if (s.dwellRemaining === 0) s.atStationIndex = null;
  }
  return s;
}
