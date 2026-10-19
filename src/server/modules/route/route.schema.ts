import { z } from '@hono/zod-openapi';

export const RouteResponse = z.object({
  success: z.literal(true),
  data: z.object({
    /** The road, [latitude, longitude] pairs from the first shelter to the last. */
    points: z.array(z.tuple([z.number(), z.number()])),
    totalMeters: z.number(),
    /** How far along the road each active shelter is, in line order. */
    stationDistances: z.array(z.number()),
    /** How many of the legs between neighbouring shelters follow a real road (the rest are straight lines). */
    roadLegs: z.number().int(),
    legs: z.number().int(),
  }),
  timestamp: z.string(),
});
