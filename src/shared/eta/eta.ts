/**
 * Arrival estimates (ETA-01, ETA-03). Pure: distance, speed and dwell in, seconds out, so the server and the tests share it
 * and a real GPS source can feed it later.
 *
 * Model (matches the simulator): a bus travels along the route at `speedKmh`.
 *   - a LINE bus stops at every station on its way: each intermediate stop costs `dwellSeconds`;
 *   - a DISPATCHED bus drives non-stop to its destination, so it has no intermediate stops;
 *   - a bus that is stopped at a station right now is not "arriving" there; the time left in its own stop is not known,
 *     so it is ignored (the estimate is at most one dwell short, never wildly off).
 * Only stations AHEAD in the bus's current direction have an ETA; turning around at the end of the line is not predicted.
 */
import type { TravelDirection } from '../tracking/models';

export type EtaParams = { speedKmh: number; dwellSeconds: number };

/** Positions closer than this are "the same place" (metres): the bus is at that station, not heading for it. */
const AT_STATION_METERS = 1;

export type StationEta = {
  /** Index into the station distance list. */
  stationIndex: number;
  seconds: number;
  /** 1 for the next station, 2 for the one after, and so on. */
  stopsAway: number;
};

const metersPerSecond = (kmh: number) => (kmh * 1000) / 3600;

/** Seconds to cover `meters` at `speedKmh`; Infinity if the bus is not moving at all. */
export function travelSeconds(meters: number, speedKmh: number): number {
  if (meters <= 0) return 0;
  const mps = metersPerSecond(speedKmh);
  return mps > 0 ? meters / mps : Number.POSITIVE_INFINITY;
}

/**
 * A LINE bus: the ETA to every station ahead of it in its direction, nearest first.
 * `stationDistances` are metres along the route, ascending.
 */
export function lineEtas(
  stationDistances: readonly number[],
  bus: { distanceMeters: number; direction: TravelDirection },
  params: EtaParams,
): StationEta[] {
  const ahead: number[] = [];
  if (bus.direction === 1) {
    for (let i = 0; i < stationDistances.length; i++) if (stationDistances[i]! - bus.distanceMeters > AT_STATION_METERS) ahead.push(i);
  } else {
    for (let i = stationDistances.length - 1; i >= 0; i--) if (bus.distanceMeters - stationDistances[i]! > AT_STATION_METERS) ahead.push(i);
  }

  const etas: StationEta[] = [];
  let seconds = 0;
  let from = bus.distanceMeters;
  ahead.forEach((index, k) => {
    const at = stationDistances[index]!;
    seconds += travelSeconds(Math.abs(at - from), params.speedKmh) + (k > 0 ? params.dwellSeconds : 0);
    from = at;
    etas.push({ stationIndex: index, seconds, stopsAway: k + 1 });
  });
  return etas;
}

/** A DISPATCHED bus: non-stop to `destinationIndex`. Null if the station is unknown. */
export function dispatchEta(
  stationDistances: readonly number[],
  bus: { distanceMeters: number },
  destinationIndex: number,
  params: EtaParams,
): number | null {
  const target = stationDistances[destinationIndex];
  if (target === undefined) return null;
  const gap = Math.abs(target - bus.distanceMeters);
  return gap <= AT_STATION_METERS ? 0 : travelSeconds(gap, params.speedKmh);
}

/** Whole minutes to show, rounded up (a bus 20 seconds away is "1 min", not "0 min"). */
export function etaMinutes(seconds: number): number {
  return Math.max(0, Math.ceil(seconds / 60));
}

/** How an ETA reads to a person. Under a minute is "Arriving now". */
export function formatEta(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return 'No estimate';
  if (seconds < 45) return 'Arriving now';
  const minutes = etaMinutes(seconds);
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** What `GET /eta/buses` reports for one bus on the road. */
export type BusEta = {
  busId: string;
  /** The next station it will reach (line buses), or its destination (dispatched buses). */
  next: { stationId: string; stationName: string; seconds: number } | null;
  /** The end of the run it is on. */
  destination: { stationId: string; stationName: string; seconds: number } | null;
};

/** One row of `GET /eta/stations/:id`: a bus that will reach that station, soonest first. */
export type StationArrival = {
  busId: string;
  busName: string;
  plateNumber: string;
  service: 'line' | 'dispatch';
  /** Where it is heading overall: the end of its run. */
  towardsName: string | null;
  fromName: string | null;
  seconds: number;
  /** Stations it passes before this one, plus this one (1 = the very next). */
  stopsAway: number;
};

export type StationArrivals = { stationId: string; stationName: string; arrivals: StationArrival[] };
