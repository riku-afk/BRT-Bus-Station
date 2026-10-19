import { z } from '@hono/zod-openapi';

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);
const name = z.string().trim().min(1, 'Name is required').max(120);

export const StationView = z.object({
  id: z.uuid(),
  name: z.string(),
  sequence: z.number().int(),
  latitude: z.number(),
  longitude: z.number(),
  isActive: z.boolean(),
  distanceMeters: z.number(),
});

export const IdParam = z.object({ id: z.uuid() });

export const ListQuery = z.object({ includeInactive: z.enum(['true', 'false']).optional() });

export const CreateStationBody = z.object({
  name,
  latitude: lat,
  longitude: lng,
  /** 1-based position on the line; omit to append at the end. */
  sequence: z.number().int().min(1).optional(),
});

export const UpdateStationBody = z
  .object({ name: name.optional(), latitude: lat.optional(), longitude: lng.optional(), isActive: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const ReorderBody = z.object({ ids: z.array(z.uuid()).min(1).max(500) });

export const StationResponse = z.object({ success: z.literal(true), data: StationView, timestamp: z.string() });
export const StationListResponse = z.object({ success: z.literal(true), data: z.array(StationView), timestamp: z.string() });

export const StationDemand = z.object({
  stationId: z.uuid(),
  validTickets: z.number().int(),
  soldToday: z.number().int(),
  byDestination: z.array(z.object({ stationId: z.uuid(), count: z.number().int() })),
});
export const StationDemandResponse = z.object({ success: z.literal(true), data: z.array(StationDemand), timestamp: z.string() });
