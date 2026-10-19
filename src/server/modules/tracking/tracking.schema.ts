import { z } from '@hono/zod-openapi';

export const BusPosition = z.object({
  busId: z.uuid(),
  busName: z.string(),
  plateNumber: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  headingDegrees: z.number(),
  speedKmh: z.number(),
  distanceMeters: z.number(),
  direction: z.union([z.literal(1), z.literal(-1)]),
  nextStationId: z.uuid().nullable(),
  nextStationName: z.string().nullable(),
  atStation: z.boolean(),
  service: z.enum(['line', 'dispatch', 'parked']),
  originStationId: z.uuid().nullable(),
  originStationName: z.string().nullable(),
  destinationStationId: z.uuid().nullable(),
  destinationStationName: z.string().nullable(),
  konduktorName: z.string().nullable(),
  tripId: z.uuid().nullable(),
  dispatchedAt: z.string().nullable(),
  expectedDepartureAt: z.string().nullable(),
  plannedDestinationId: z.uuid().nullable(),
  plannedDestinationName: z.string().nullable(),
  headingToId: z.uuid().nullable(),
  headingToName: z.string().nullable(),
  updatedAt: z.string(),
});

export const TrackingSnapshot = z.object({ serverTime: z.string(), buses: z.array(BusPosition) });
export const TrackingSnapshotResponse = z.object({ success: z.literal(true), data: TrackingSnapshot, timestamp: z.string() });

export const WorkerStatusResponse = z.object({
  success: z.literal(true),
  data: z.object({ workerOnline: z.boolean() }),
  timestamp: z.string(),
});

export const AvailabilityResponse = z.object({
  success: z.literal(true),
  data: z.array(z.object({ stationId: z.uuid(), buses: z.array(BusPosition) })),
  timestamp: z.string(),
});

export const MyBus = z.object({
  bus: z.object({ id: z.uuid(), name: z.string(), plateNumber: z.string() }).nullable(),
  operation: z.enum(['no_bus', 'not_on_map', 'available', 'on_road']),
  station: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  expectedDepartureAt: z.string().nullable(),
  trip: z
    .object({ id: z.uuid(), originStationId: z.uuid(), originName: z.string(), destinationStationId: z.uuid(), destinationName: z.string(), dispatchedAt: z.string() })
    .nullable(),
  defaultDestination: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  plannedDestination: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  workerOnline: z.boolean(),
});
export const MyBusResponse = z.object({ success: z.literal(true), data: MyBus, timestamp: z.string() });

/** Whole minutes from now, or null to clear. Capped at 8 hours so a typo cannot promise a bus tomorrow. */
export const DepartureBody = z.object({ inMinutes: z.number().int().min(1).max(480).nullable() });

/** The station the next trip is headed to, or null for the default (the far end of the line). */
export const DestinationBody = z.object({ destinationId: z.uuid().nullable() });

/** Omit `destinationId` to send the bus to the planned destination, or else the far end of the line. */
export const DispatchBody = z.object({ destinationId: z.uuid().optional() });

export const DispatchResultResponse = z.object({
  success: z.literal(true),
  data: z.object({ tripId: z.uuid(), busName: z.string(), originName: z.string(), destinationName: z.string() }),
  timestamp: z.string(),
});
