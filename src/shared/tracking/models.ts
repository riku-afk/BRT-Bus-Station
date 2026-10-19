/** Tracking contracts shared by the API, the simulator worker and both maps. Browser-safe. */

/** 1 = towards the last station of the line, -1 = towards the first. */
export type TravelDirection = 1 | -1;

/**
 *   line      a bus with no konduktor: runs the whole line back and forth automatically
 *   dispatch  a crewed bus on the road: its konduktor sent it from one station to another
 *   parked    a crewed bus waiting at a station, available to passengers
 */
export type BusService = 'line' | 'dispatch' | 'parked';

/** What a position source (simulator now, konduktor GPS later) reports for one bus. */
export type BusPositionUpdate = {
  busId: string;
  latitude: number;
  longitude: number;
  headingDegrees: number;
  speedKmh: number;
  /** Metres along the route from the first active station. */
  distanceMeters: number;
  direction: TravelDirection;
  /** The station the bus is heading for next (the destination, for a dispatched bus). */
  nextStationId: string | null;
  /** True while the bus is stopped at a station. */
  atStation: boolean;
  service: BusService;
  /** Where the current run started (or, for a parked bus, the station it waits at) and where it ends. */
  originStationId: string | null;
  destinationStationId: string | null;
  /** The dispatch this bus is making, if any. */
  tripId: string | null;
};

/** A bus position as the API and SSE feed return it. Deliberately has no passenger count (GEN-01). */
export type BusPosition = BusPositionUpdate & {
  busName: string;
  plateNumber: string;
  nextStationName: string | null;
  originStationName: string | null;
  destinationStationName: string | null;
  /** The konduktor in charge of this bus, if it has one. */
  konduktorName: string | null;
  /** When a dispatched bus was sent out. */
  dispatchedAt: string | null;
  /**
   * Roughly when the konduktor expects to leave. Set by the konduktor; not a computed ETA. While parked it is the departure from
   * where the bus waits; while on the road it is the departure from the shelter it is driving to.
   */
  expectedDepartureAt: string | null;
  /** While parked: where the konduktor says the next trip is headed, if they have said. Null means "not said yet". */
  plannedDestinationId: string | null;
  plannedDestinationName: string | null;
  /**
   * While parked: where this bus goes next, as passengers should read it: the announced destination, or the far end of the line
   * if none. This is also the destination a ticket bought on the bus is priced for. Null when not parked.
   */
  headingToId: string | null;
  headingToName: string | null;
  updatedAt: string;
};

export type TrackingSnapshot = { serverTime: string; buses: BusPosition[] };

/** Whether the simulator worker has checked in recently. Buses only move (and parked buses only appear) while it runs. */
export type WorkerStatus = { workerOnline: boolean };

/** A konduktor's own bus: where it is and what they can do (KON-04). */
export type MyBus = {
  bus: { id: string; name: string; plateNumber: string } | null;
  /**
   *   no_bus      no bus is assigned to this konduktor
   *   not_on_map  assigned, but the simulator has not placed the bus yet
   *   available   parked at `station`, waiting for the konduktor to dispatch it
   *   on_road     dispatched; it becomes available again, automatically, when it arrives
   */
  operation: 'no_bus' | 'not_on_map' | 'available' | 'on_road';
  station: { id: string; name: string } | null;
  expectedDepartureAt: string | null;
  trip: { id: string; originStationId: string; originName: string; destinationStationId: string; destinationName: string; dispatchedAt: string } | null;
  /** Where "Dispatch" sends the bus if the konduktor does not pick a station: the far end of the line. */
  defaultDestination: { id: string; name: string } | null;
  /** The destination the konduktor has chosen for the next trip (passengers see it); null = not chosen, so the default. */
  plannedDestination: { id: string; name: string } | null;
  workerOnline: boolean;
};

export type DispatchResult = {
  tripId: string;
  busName: string;
  originName: string;
  destinationName: string;
};

/** Demand at a station, from tickets bought there. Counts only: no list of passengers (GEN-01). */
export type StationDemand = {
  stationId: string;
  /** Paid, not yet used or expired: tickets that start at this station. */
  validTickets: number;
  /** Tickets bought today (Asia/Manila) that start here, used or not. */
  soldToday: number;
  /** Valid tickets from here, split by where they are going. */
  byDestination: { stationId: string; count: number }[];
};
