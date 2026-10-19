/**
 * A dispatched trip (TRK-08): one bus runs from one station to another, then goes out of service.
 *
 * It reuses the line's movement logic on a two-station mini-route [origin, destination], so the bus runs non-stop
 * between the two (express), dwelling at the origin before it leaves and at the destination before it finishes.
 * Distances stay true distances along the whole route, so positions need no conversion.
 */
import type { TravelDirection } from './models';
import { advance, initialState, type MoveParams, type MoveState } from './movement';

export type TripRun = {
  /** [nearer the start of the line, further], in metres along the route. */
  span: readonly [number, number];
  /** Direction of the trip along the line. */
  dir: TravelDirection;
  state: MoveState;
  /** True once the bus has reached its destination. */
  arrived: boolean;
};

/** `originIndex` and `destinationIndex` index into `stationDistances` and must differ. */
export function startTrip(
  stationDistances: readonly number[],
  originIndex: number,
  destinationIndex: number,
  dwellSeconds: number,
): TripRun {
  const origin = stationDistances[originIndex]!;
  const destination = stationDistances[destinationIndex]!;
  const dir: TravelDirection = destination >= origin ? 1 : -1;
  const span = [Math.min(origin, destination), Math.max(origin, destination)] as const;
  const base = initialState(span, dir === 1 ? span[0] : span[1], dir);
  // The bus waits at its origin for the dwell time (boarding), then departs.
  const state: MoveState = {
    ...base,
    dwellRemaining: dwellSeconds,
    atStationIndex: dwellSeconds > 0 ? (dir === 1 ? 0 : 1) : null,
  };
  return { span, dir, state, arrived: false };
}

/**
 * Advance a trip. `finished` becomes true once the bus has arrived and finished dwelling at the destination.
 * Steps in slices of at most a second and stops as soon as the trip finishes, so even a very large `dtSeconds`
 * cannot carry the bus through the destination and back.
 */
export function stepTrip(run: TripRun, params: MoveParams, dtSeconds: number): { run: TripRun; finished: boolean } {
  let current = run;
  let remaining = dtSeconds;
  while (remaining > 1e-9) {
    const slice = Math.min(remaining, 1);
    const state = advance(current.state, current.span, params, slice);
    // On the two-station mini-route the direction flips exactly when the bus reaches the destination.
    const arrived = current.arrived || state.direction !== current.dir;
    current = { ...current, state, arrived };
    remaining -= slice;
    if (arrived && state.atStationIndex === null) return { run: current, finished: true };
  }
  return { run: current, finished: false };
}

/** How far along a run is, 0–1, given the distances of its two ends. */
export function runProgress(distance: number, originDistance: number, destinationDistance: number): number {
  const length = destinationDistance - originDistance;
  if (length === 0) return 1;
  return Math.min(Math.max((distance - originDistance) / length, 0), 1);
}
