/**
 * Simulated buses (TRK-01, TRK-08). Two kinds of bus, told apart by whether they have a konduktor:
 *
 *   un-crewed   run the whole line back and forth automatically, pausing at each station and turning around at both
 *               ends, whenever the worker runs (up to `busCount` of them).
 *   crewed      wait PARKED at a station until their konduktor dispatches them. A dispatch is a trip from the bus's
 *               station to another: the bus leaves at once, drives non-stop, dwells at the destination, and is then
 *               parked there again (available) for the konduktor to dispatch next.
 *
 * All input comes through `SimulatorDeps`, so the tick logic is unit tested without a database or timers.
 */
import { buildRoutePath, positionAlongPath, type LatLng } from '@shared/geo/route';
import type { BusPositionUpdate, TravelDirection } from '@shared/tracking/models';
import { advance, initialState, kmhToMps, type MoveState } from '@shared/tracking/movement';
import { startTrip, stepTrip, type TripRun } from '@shared/tracking/trip';
import type { BusPositionSource, PositionSink } from './position-source';

export type SimStation = { id: string; name: string; latitude: number; longitude: number };
export type SimBus = { id: string; name: string };
/** A dispatched trip waiting to run or running. */
export type SimTrip = { id: string; busId: string; originStationId: string; destinationStationId: string };
/** A crewed bus's stored state: where it is parked, or `on_road` while a trip runs. */
export type SimParking = { busId: string; stationId: string | null; status: 'available' | 'on_road' };

export type SimulatorDeps = {
  now(): number;
  /** Active stations in line order. */
  loadStations(): Promise<SimStation[]>;
  /** The road between each pair of neighbouring stations (one entry per pair; null = straight line). Optional: no roads, straight lines. */
  loadLegs?(stations: readonly SimStation[]): Promise<(readonly LatLng[] | null)[]>;
  /** Buses with no konduktor: they run the line by themselves. */
  loadAutoBuses(limit: number): Promise<SimBus[]>;
  /** Buses with a konduktor: parked or dispatched. */
  loadCrewedBuses(): Promise<SimBus[]>;
  loadParking(): Promise<SimParking[]>;
  /** Dispatched trips that are en route (the database is the queue: the worker picks them up here). */
  loadActiveTrips(): Promise<SimTrip[]>;
  /** Park a bus at a station as `available` (first placement, a re-park after a restart, or after its station left service). */
  parkBus(busId: string, stationId: string): Promise<void>;
  /** `completed` also parks the bus at the destination, `cancelled` back at the origin: the dependency does both. */
  finishTrip(trip: SimTrip, status: 'completed' | 'cancelled'): Promise<void>;
  /** Tell the admin panel the worker is alive. */
  heartbeat(): Promise<void>;
  config: { busCount: number; speedKmh: number; dwellSeconds: number; tickMs: number };
};

/** A tick is never allowed to simulate more than this, so a stalled worker does not teleport the buses. */
const MAX_STEP_SECONDS = 5;

type TripRuntime = { trip: SimTrip; run: TripRun };

export class SimulatorSource implements BusPositionSource {
  readonly name = 'simulator' as const;

  private sink: PositionSink | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private running = false;

  private lineStates = new Map<string, MoveState>();
  private tripRuns = new Map<string, TripRuntime>();
  private lastTickAt: number | null = null;
  private lastStationsKey = '';

  constructor(private readonly deps: SimulatorDeps) {}

  async start(sink: PositionSink): Promise<void> {
    this.sink = sink;
    this.running = true;
    const loop = async () => {
      if (!this.running) return;
      try {
        await this.tick();
      } catch (err) {
        console.error(`[simulator] tick failed: ${(err as Error).message}`);
      }
      if (this.running) {
        this.timer = setTimeout(loop, this.deps.config.tickMs);
      }
    };
    await loop();
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** One simulation step. Public so tests can drive it without timers. */
  async tick(): Promise<void> {
    if (!this.sink) throw new Error('SimulatorSource.tick() called before start()');
    const { config } = this.deps;
    await this.deps.heartbeat();

    const [stations, autoBusesAll, crewed, parkingRows, trips] = await Promise.all([
      this.deps.loadStations(),
      this.deps.loadAutoBuses(config.busCount),
      this.deps.loadCrewedBuses(),
      this.deps.loadParking(),
      this.deps.loadActiveTrips(),
    ]);

    const now = this.deps.now();
    const dt = this.lastTickAt === null ? 0 : Math.min(Math.max((now - this.lastTickAt) / 1000, 0), MAX_STEP_SECONDS);
    this.lastTickAt = now;

    // A line needs two stations; with fewer there is nothing to drive on and no trip can run.
    if (stations.length < 2) {
      const hadBuses = this.lineStates.size > 0 || this.tripRuns.size > 0 || crewed.length > 0;
      this.lineStates.clear();
      this.tripRuns.clear();
      this.lastStationsKey = '';
      for (const trip of trips) await this.deps.finishTrip(trip, 'cancelled');
      if (hadBuses) await this.sink.publish([], { replace: true });
      return;
    }

    const points: LatLng[] = stations.map((s) => ({ latitude: s.latitude, longitude: s.longitude }));
    // Buses drive along the road, so every distance below is measured along the road, not along a straight line.
    const route = buildRoutePath(points, (await this.deps.loadLegs?.(stations)) ?? []);
    const dists = route.stationDistances;
    const indexOf = new Map(stations.map((s, i) => [s.id, i]));
    const first = stations[0]!;
    const last = stations[stations.length - 1]!;
    // The length of the road is part of the key: when the real road arrives (it was a straight line until then) every distance
    // along the line changes, and buses are placed on it afresh instead of keeping distances measured on the old line.
    const stationsKey = stations.map((s) => `${s.id}:${s.latitude}:${s.longitude}`).join('|') + `|${Math.round(route.totalMeters)}`;
    const lineChanged = stationsKey !== this.lastStationsKey && this.lastStationsKey !== '';
    this.lastStationsKey = stationsKey;
    const params = { speedMps: kmhToMps(config.speedKmh), dwellSeconds: config.dwellSeconds };

    const updates: BusPositionUpdate[] = [];
    const crewedIds = new Set(crewed.map((b) => b.id));
    const parkingByBus = new Map(parkingRows.map((p) => [p.busId, p]));

    const parkedUpdate = (stationIndex: number, busId: string): BusPositionUpdate => {
      const station = stations[stationIndex]!;
      return {
        busId,
        latitude: station.latitude,
        longitude: station.longitude,
        headingDegrees: 0,
        speedKmh: 0,
        distanceMeters: dists[stationIndex]!,
        direction: 1,
        nextStationId: null,
        atStation: true,
        service: 'parked',
        originStationId: station.id,
        destinationStationId: null,
        tripId: null,
      };
    };

    // ── Dispatched trips (crewed buses on the road) ─────────────────────────────────────────────────────────────
    // A trip that is no longer en route (cancelled elsewhere) drops out here.
    for (const id of [...this.tripRuns.keys()]) if (!trips.some((t) => t.id === id)) this.tripRuns.delete(id);
    const onRoad = new Set<string>();
    /** Buses whose trip ended this tick: parked at their destination in the same update. */
    const arrived = new Map<string, number>();

    for (const trip of trips) {
      const originIndex = indexOf.get(trip.originStationId);
      const destinationIndex = indexOf.get(trip.destinationStationId);
      // The bus lost its konduktor, or a station on the trip left service: the trip cannot continue.
      if (!crewedIds.has(trip.busId) || originIndex === undefined || destinationIndex === undefined || originIndex === destinationIndex) {
        this.tripRuns.delete(trip.id);
        await this.deps.finishTrip(trip, 'cancelled');
        continue;
      }
      let runtime = this.tripRuns.get(trip.id);
      if (!runtime || lineChanged) {
        // New trip, or the line changed under it: (re)start from the origin. The konduktor pressed Dispatch, so the bus
        // leaves at once (no waiting at the origin).
        runtime = { trip, run: startTrip(dists, originIndex, destinationIndex, 0) };
        this.tripRuns.set(trip.id, runtime);
      } else {
        const stepped = stepTrip(runtime.run, params, dt);
        runtime.run = stepped.run;
        if (stepped.finished) {
          this.tripRuns.delete(trip.id);
          await this.deps.finishTrip(trip, 'completed');
          arrived.set(trip.busId, destinationIndex);
          continue;
        }
      }
      const { state, dir } = runtime.run;
      const pos = positionAlongPath(route, state.distance);
      const atStation = state.atStationIndex !== null;
      onRoad.add(trip.busId);
      updates.push({
        busId: trip.busId,
        latitude: pos.latitude,
        longitude: pos.longitude,
        headingDegrees: dir === 1 ? pos.headingDegrees : (pos.headingDegrees + 180) % 360,
        speedKmh: atStation ? 0 : config.speedKmh,
        distanceMeters: state.distance,
        direction: dir,
        nextStationId: trip.destinationStationId,
        atStation,
        service: 'dispatch',
        originStationId: trip.originStationId,
        destinationStationId: trip.destinationStationId,
        tripId: trip.id,
      });
    }

    // ── Crewed buses that are not on the road: parked ───────────────────────────────────────────────────────────
    for (const [rank, bus] of crewed.entries()) {
      if (onRoad.has(bus.id)) continue;
      const justArrived = arrived.get(bus.id);
      if (justArrived !== undefined) {
        updates.push(parkedUpdate(justArrived, bus.id));
        continue;
      }
      const stored = parkingByBus.get(bus.id);
      const known = stored?.stationId ? indexOf.get(stored.stationId) : undefined;
      // First placement: spread the crewed buses along the line.
      const index = known ?? Math.min(stations.length - 1, Math.floor(((rank + 0.5) / crewed.length) * stations.length));
      // Park (again) when it has never been placed, its trip vanished (worker restart), or its station left service.
      if (!stored || stored.status === 'on_road' || known === undefined) await this.deps.parkBus(bus.id, stations[index]!.id);
      updates.push(parkedUpdate(index, bus.id));
    }

    // ── Un-crewed buses: the line, automatically ────────────────────────────────────────────────────────────────
    const autoBuses = autoBusesAll.filter((b) => !crewedIds.has(b.id));
    for (const id of [...this.lineStates.keys()]) if (!autoBuses.some((b) => b.id === id)) this.lineStates.delete(id);
    autoBuses.forEach((bus, rank) => {
      if (this.lineStates.has(bus.id)) return;
      // New buses are placed evenly along the line, alternating direction.
      const distance = ((rank + 0.5) / autoBuses.length) * route.totalMeters;
      this.lineStates.set(bus.id, initialState(dists, distance, rank % 2 === 0 ? 1 : -1));
    });
    // The line changed (a station was moved, added or removed): keep each bus where it is, re-aimed at the new line.
    if (lineChanged) for (const [id, s] of this.lineStates) this.lineStates.set(id, initialState(dists, s.distance, s.direction));
    for (const [id, s] of this.lineStates) this.lineStates.set(id, advance(s, dists, params, dt));

    for (const bus of autoBuses) {
      const state = this.lineStates.get(bus.id)!;
      const pos = positionAlongPath(route, state.distance);
      const atStation = state.atStationIndex !== null;
      const dir: TravelDirection = state.direction;
      updates.push({
        busId: bus.id,
        latitude: pos.latitude,
        longitude: pos.longitude,
        headingDegrees: dir === 1 ? pos.headingDegrees : (pos.headingDegrees + 180) % 360,
        speedKmh: atStation ? 0 : config.speedKmh,
        distanceMeters: state.distance,
        direction: dir,
        nextStationId: stations[state.nextIndex]?.id ?? null,
        atStation,
        service: 'line',
        // Each pass is a run from one terminal to the other.
        originStationId: dir === 1 ? first.id : last.id,
        destinationStationId: dir === 1 ? last.id : first.id,
        tripId: null,
      });
    }

    await this.sink.publish(updates, { replace: true });
  }
}
