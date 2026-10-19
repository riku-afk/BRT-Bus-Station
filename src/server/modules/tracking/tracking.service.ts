/**
 * Tracking: latest bus positions, the konduktor's control of their own bus, and the sink every position source writes to.
 * Consumers (API, SSE hub, ETA) read `bus_positions` only and never know which source produced a row (TRK-02).
 *
 * Who drives which bus:
 *   - a bus WITH an active konduktor is crewed: it waits parked at a station until that konduktor dispatches it;
 *   - a bus WITHOUT one runs the line by itself (the first `SIM_BUS_COUNT` of them).
 * Admins only monitor: they cannot dispatch (decision 16 Oct).
 */
import { env } from '@config/env';
import { getDb, transaction, type SQLExecutor } from '@core/database';
import type { PositionSink } from '@integrations/positions';
import { SimulatorSource, type SimulatorDeps } from '@integrations/positions';
import { ApiError } from '@lib/response';
import { stationsRepository } from '@modules/stations/stations.repository';
import type { AuthContext } from '@core/types';
import type { BusPosition, BusPositionUpdate, DispatchResult, MyBus, TrackingSnapshot, WorkerStatus } from '@shared/tracking/models';
import { farEndIndex, groupParkedByStation, headingToId } from '@shared/tracking/stations';
import { ticketsRepository } from '@modules/tickets/tickets.repository';
import { routeService } from '@modules/route/route.service';
import { trackingRepository } from './tracking.repository';
import type { MyBusRow, PositionRow } from './tracking.types';

export function toBusPosition(row: PositionRow, stations: readonly { id: string; name: string }[] = []): BusPosition {
  // Where a parked bus goes next (announced, else the far end of the line): also what a ticket bought on it is priced for.
  const headingId = row.service === 'parked' && row.origin_station_id ? headingToId(stations.map((s) => s.id), row.origin_station_id, row.planned_destination_id) : null;
  return {
    busId: row.bus_id,
    busName: row.bus_name,
    plateNumber: row.plate_number,
    latitude: row.latitude,
    longitude: row.longitude,
    headingDegrees: row.heading_degrees,
    speedKmh: row.speed_kmh,
    distanceMeters: row.distance_meters,
    direction: row.direction,
    nextStationId: row.next_station_id,
    nextStationName: row.next_station_name,
    atStation: row.at_station,
    service: row.service,
    originStationId: row.origin_station_id,
    originStationName: row.origin_station_name,
    destinationStationId: row.destination_station_id,
    destinationStationName: row.destination_station_name,
    konduktorName: row.konduktor_name,
    tripId: row.trip_id,
    dispatchedAt: row.dispatched_at ? row.dispatched_at.toISOString() : null,
    expectedDepartureAt: row.expected_departure_at ? row.expected_departure_at.toISOString() : null,
    plannedDestinationId: row.planned_destination_id,
    plannedDestinationName: row.planned_destination_name,
    headingToId: headingId,
    headingToName: headingId ? (stations.find((s) => s.id === headingId)?.name ?? null) : null,
    updatedAt: row.updated_at.toISOString(),
  };
}

const code = (err: unknown) => (err as { code?: string }).code;

/** Keep only the buses a viewer may see (`null` = all). */
export function filterVisible<T extends { busId: string }>(buses: readonly T[], visible: ReadonlySet<string> | null): T[] {
  return visible ? buses.filter((b) => visible.has(b.busId)) : [...buses];
}

/** A snapshot reduced to what a viewer may see. */
export function snapshotFor(snapshot: TrackingSnapshot, visible: ReadonlySet<string> | null): TrackingSnapshot {
  return visible ? { ...snapshot, buses: filterVisible(snapshot.buses, visible) } : snapshot;
}

export const trackingService = {
  async listPositions(db: SQLExecutor = getDb()): Promise<BusPosition[]> {
    const [rows, stations] = await Promise.all([trackingRepository.listPositions(db), stationsRepository.list(db, { includeInactive: false })]);
    return rows.map((row) => toBusPosition(row, stations));
  },

  async snapshot(db: SQLExecutor = getDb()): Promise<TrackingSnapshot> {
    return { serverTime: new Date().toISOString(), buses: await trackingService.listPositions(db) };
  },

  /**
   * Which buses this viewer may see. Passengers, admins and signed-out visitors see every bus; a KONDUKTOR sees only their
   * own (decision 16 Oct), so the other crews' buses are never sent to them: not by the list, not by the live stream.
   * `null` means all buses.
   */
  async visibleBusIds(auth: AuthContext | null, db: SQLExecutor = getDb()): Promise<ReadonlySet<string> | null> {
    if (auth?.user.role !== 'konduktor') return null;
    const mine = await trackingRepository.findMyBus(db, auth.user.id);
    return new Set(mine ? [mine.bus_id] : []);
  },

  /** The sink every position source writes to: upsert, optionally drop the rest, then notify the live feed. */
  async recordPositions(updates: readonly BusPositionUpdate[], options: { replace?: boolean } = {}): Promise<void> {
    await transaction(async (tx) => {
      await trackingRepository.upsertPositions(tx, updates);
      if (options.replace) await trackingRepository.deleteExcept(tx, updates.map((u) => u.busId));
      // pg_notify inside the transaction: listeners are only woken once the rows are committed.
      await trackingRepository.notify(tx);
    });
  },

  async workerStatus(db: SQLExecutor = getDb()): Promise<WorkerStatus> {
    return { workerOnline: await trackingRepository.workerOnline(db) };
  },

  /** Which buses are waiting at which station right now (STN-07). Only stations with at least one are listed. */
  async availability(visible: ReadonlySet<string> | null = null, db: SQLExecutor = getDb()): Promise<{ stationId: string; buses: BusPosition[] }[]> {
    const grouped = groupParkedByStation(filterVisible(await trackingService.listPositions(db), visible));
    return [...grouped.entries()].map(([stationId, buses]) => ({ stationId, buses }));
  },

  // ── A konduktor controls their own bus (KON-04, KON-05, TRK-08) ─────────────────────────────────────────────

  /**
   * The signed-in konduktor's bus. The bus is found from the session and the assignment, never from the request (GEN-05):
   * a konduktor can only ever see and control the bus they are assigned to.
   */
  async myBus(userId: string, db: SQLExecutor = getDb()): Promise<MyBus> {
    const [row, workerOnline] = await Promise.all([trackingRepository.findMyBus(db, userId), trackingRepository.workerOnline(db)]);
    if (!row) {
      return { bus: null, operation: 'no_bus', station: null, expectedDepartureAt: null, trip: null, defaultDestination: null, plannedDestination: null, workerOnline };
    }
    const bus = { id: row.bus_id, name: row.bus_name, plateNumber: row.plate_number };

    if (row.trip_id && row.trip_created_at) {
      return {
        bus,
        operation: 'on_road',
        station: null,
        // While on the road this is the time it will leave the shelter it is driving to.
        expectedDepartureAt: row.expected_departure_at ? row.expected_departure_at.toISOString() : null,
        trip: {
          id: row.trip_id,
          originStationId: row.trip_origin_station_id ?? '',
          originName: row.trip_origin_name ?? '',
          destinationStationId: row.trip_destination_station_id ?? '',
          destinationName: row.trip_destination_name ?? '',
          dispatchedAt: row.trip_created_at.toISOString(),
        },
        defaultDestination: null,
        plannedDestination: null,
        workerOnline,
      };
    }
    if (row.bus_status === 'active' && row.av_status === 'available' && row.station_id) {
      const stations = await stationsRepository.list(db, { includeInactive: false });
      const here = stations.findIndex((s) => s.id === row.station_id);
      const far = here >= 0 && stations.length >= 2 ? stations[farEndIndex(here, stations.length)] : undefined;
      return {
        bus,
        operation: 'available',
        station: { id: row.station_id, name: row.station_name ?? '' },
        expectedDepartureAt: row.expected_departure_at ? row.expected_departure_at.toISOString() : null,
        trip: null,
        defaultDestination: far ? { id: far.id, name: far.name } : null,
        plannedDestination: row.planned_destination_id && row.planned_destination_name ? { id: row.planned_destination_id, name: row.planned_destination_name } : null,
        workerOnline,
      };
    }
    return { bus, operation: 'not_on_map', station: null, expectedDepartureAt: null, trip: null, defaultDestination: null, plannedDestination: null, workerOnline };
  },

  /** While the bus waits at a station, say roughly when it leaves, so passengers there can plan. `null` clears it. */
  async setMyDeparture(userId: string, inMinutes: number | null): Promise<MyBus> {
    await transaction(async (tx) => {
      const mine = await requireMyBus(tx, userId);
      const availability = await trackingRepository.lockAvailability(tx, mine.bus_id);
      // Allowed while waiting (leaving this shelter) and while driving (leaving the shelter it is going to).
      if (!availability) throw notAvailable(undefined);
      await trackingRepository.setExpectedDeparture(tx, mine.bus_id, inMinutes);
      // Wake the live feed now rather than waiting for the next simulator tick.
      await trackingRepository.notify(tx);
    });
    return trackingService.myBus(userId);
  },

  /**
   * Say where the next trip is headed while the bus waits, so passengers at the shelter see "Headed to X". `null` goes back
   * to the default (the far end of the line). Dispatching without choosing a station then sends the bus to this one.
   */
  async setMyDestination(userId: string, destinationId: string | null): Promise<MyBus> {
    await transaction(async (tx) => {
      const mine = await requireMyBus(tx, userId);
      const availability = await trackingRepository.lockAvailability(tx, mine.bus_id);
      if (!availability || availability.status !== 'available' || !availability.station_id) throw notAvailable(availability?.status);
      if (destinationId !== null) {
        const stations = await stationsRepository.list(tx, { includeInactive: false });
        if (!stations.some((s) => s.id === destinationId)) {
          const known = await stationsRepository.findById(tx, destinationId);
          throw known ? ApiError.badRequest('That station is not in service') : ApiError.notFound('Station not found');
        }
        if (destinationId === availability.station_id) throw ApiError.badRequest('Choose a different station: your bus is already here');
      }
      await refuseIfTicketsSoldElsewhere(tx, availability, destinationId);
      await trackingRepository.setPlannedDestination(tx, mine.bus_id, destinationId);
      // Passengers watching the shelter see it at once.
      await trackingRepository.notify(tx);
    });
    return trackingService.myBus(userId);
  },

  /**
   * Send my bus from the station it is parked at to another: the far end of the line unless a station is given. The bus
   * leaves on the worker's next tick and becomes available again at the destination when it arrives. A bus that is
   * already on the road cannot be dispatched again.
   */
  async dispatchMyBus(userId: string, destinationId?: string): Promise<DispatchResult> {
    return transaction(async (tx) => {
      const mine = await requireMyBus(tx, userId);
      if (mine.bus_status !== 'active') throw ApiError.conflict(`${mine.bus_name} is not in service`);
      // The lock makes a second tap, or a second device, wait; it then finds the bus already on the road.
      const availability = await trackingRepository.lockAvailability(tx, mine.bus_id);
      if (!availability || availability.status !== 'available' || !availability.station_id) throw notAvailable(availability?.status);

      const stations = await stationsRepository.list(tx, { includeInactive: false });
      const originIndex = stations.findIndex((s) => s.id === availability.station_id);
      if (originIndex < 0) throw ApiError.conflict('Your bus is parked at a station that is not in service. Please wait a moment.');
      const origin = stations[originIndex]!;

      // An explicit choice wins; otherwise the destination the konduktor announced; otherwise the far end of the line.
      const chosenId = destinationId ?? availability.planned_destination_id ?? undefined;
      let destination = chosenId ? stations.find((s) => s.id === chosenId) : stations[farEndIndex(originIndex, stations.length)];
      if (chosenId && !destination) {
        const known = await stationsRepository.findById(tx, chosenId);
        throw known ? ApiError.badRequest('That station is not in service') : ApiError.notFound('Station not found');
      }
      destination = destination!;
      if (destination.id === origin.id) throw ApiError.badRequest('Choose a different station: your bus is already here');
      await refuseIfTicketsSoldElsewhere(tx, availability, destination.id);

      try {
        const trip = await trackingRepository.insertTrip(tx, {
          busId: mine.bus_id,
          originStationId: origin.id,
          destinationStationId: destination.id,
          dispatchedBy: userId,
        });
        await trackingRepository.markOnRoad(tx, mine.bus_id);
        return { tripId: trip.id, busName: mine.bus_name, originName: origin.name, destinationName: destination.name };
      } catch (err) {
        // The unique index on active trips: a second dispatch that raced past the lock.
        if (code(err) === '23505') throw ApiError.conflict('Your bus is already on the road');
        throw err;
      }
    });
  },

  /** Used by the worker on a clean shutdown, so a restart starts from a clean slate. */
  async cancelActiveTrips(): Promise<void> {
    await trackingRepository.cancelAllActiveTrips(getDb());
  },
};

async function requireMyBus(db: SQLExecutor, userId: string): Promise<MyBusRow> {
  const row = await trackingRepository.findMyBus(db, userId);
  if (!row) throw ApiError.conflict('No bus is assigned to you. Ask an admin to assign one.');
  return row;
}

/**
 * Once passengers hold tickets on this bus for this wait, the bus goes where those tickets say. Choosing (or dispatching to) any
 * other station is refused, so nobody pays for one trip and gets driven on another.
 */
async function refuseIfTicketsSoldElsewhere(db: SQLExecutor, availability: { bus_id: string; station_id: string | null; parked_at?: Date }, newDestinationId: string | null): Promise<void> {
  if (!availability.station_id || !availability.parked_at) return;
  const stations = await stationsRepository.list(db, { includeInactive: false });
  const planned = newDestinationId;
  const effective = headingToId(stations.map((s) => s.id), availability.station_id, planned);
  const sold = await ticketsRepository.soldDestinations(db, availability.bus_id, availability.station_id, availability.parked_at, env.tickets.pendingTtlMinutes);
  const elsewhere = sold.find((id) => id !== effective);
  if (elsewhere) {
    const name = stations.find((s) => s.id === elsewhere)?.name ?? 'another station';
    throw ApiError.conflict(`Passengers have already bought tickets to ${name}, so this bus has to go there.`);
  }
}

function notAvailable(status: 'available' | 'on_road' | undefined): ApiError {
  return status === 'on_road'
    ? ApiError.conflict('Your bus is on the road. It becomes available again when it arrives.')
    : ApiError.conflict('Your bus is not on the map yet. The simulator needs to be running.');
}

/** The sink as an object, for `BusPositionSource.start(sink)`. */
export const positionSink: PositionSink = {
  publish: (updates, options) => trackingService.recordPositions(updates, options),
};

/** Wires the simulator to the database and the environment. Used by scripts/bus-simulator-worker.ts. */
export function createSimulator(): SimulatorSource {
  const deps: SimulatorDeps = {
    now: () => Date.now(),
    config: env.simulator,
    loadLegs: (stations) => routeService.legsFor(getDb(), stations),
    loadStations: async () =>
      (await stationsRepository.list(getDb(), { includeInactive: false })).map((s) => ({
        id: s.id,
        name: s.name,
        latitude: s.latitude,
        longitude: s.longitude,
      })),
    loadAutoBuses: (limit) => trackingRepository.listAutoBuses(getDb(), limit),
    loadCrewedBuses: () => trackingRepository.listCrewedBuses(getDb()),
    loadParking: async () => (await trackingRepository.listParking(getDb())).map((p) => ({ busId: p.bus_id, stationId: p.station_id, status: p.status })),
    loadActiveTrips: async () =>
      (await trackingRepository.listActiveTrips(getDb())).map((t) => ({
        id: t.id,
        busId: t.bus_id,
        originStationId: t.origin_station_id,
        destinationStationId: t.destination_station_id,
      })),
    parkBus: (busId, stationId) => trackingRepository.parkBus(getDb(), busId, stationId),
    // The trip ends and the bus is parked (available) at its destination in one step, or back at its origin if cancelled.
    finishTrip: (trip, status) =>
      transaction(async (tx) => {
        if (await trackingRepository.finishTrip(tx, trip.id, status)) {
          await trackingRepository.parkBus(tx, trip.busId, status === 'completed' ? trip.destinationStationId : trip.originStationId);
        }
      }),
    heartbeat: () => trackingRepository.heartbeat(getDb()),
  };
  return new SimulatorSource(deps);
}
