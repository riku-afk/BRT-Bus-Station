import { z } from '@hono/zod-openapi';

const At = z.object({ stationId: z.uuid(), stationName: z.string(), seconds: z.number().int().min(0) });

export const BusEtasResponse = z.object({
  success: z.literal(true),
  data: z.array(z.object({ busId: z.uuid(), next: At.nullable(), destination: At.nullable() })),
  timestamp: z.string(),
});

export const StationArrivalsResponse = z.object({
  success: z.literal(true),
  data: z.object({
    stationId: z.uuid(),
    stationName: z.string(),
    arrivals: z.array(
      z.object({
        busId: z.uuid(),
        busName: z.string(),
        plateNumber: z.string(),
        service: z.enum(['line', 'dispatch']),
        towardsName: z.string().nullable(),
        fromName: z.string().nullable(),
        seconds: z.number().int().min(0),
        stopsAway: z.number().int().min(1),
      }),
    ),
  }),
  timestamp: z.string(),
});
