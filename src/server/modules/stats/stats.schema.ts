import { z } from '@hono/zod-openapi';
import { STATS_WINDOWS } from '@shared/stats/models';

export const StatsQuery = z.object({
  days: z.coerce
    .number()
    .int()
    .refine((n): n is (typeof STATS_WINDOWS)[number] => (STATS_WINDOWS as readonly number[]).includes(n), 'days must be 7, 14 or 30')
    .optional(),
});

const Day = z.object({
  date: z.string(),
  ticketsSold: z.number().int(),
  passengers: z.number().int(),
  salesCentavos: z.number().int(),
  scansAccepted: z.number().int(),
  scansRefused: z.number().int(),
});

export const StatsResponse = z.object({
  success: z.literal(true),
  data: z.object({
    days: z.array(Day),
    today: Day,
    totals: z.object({ ticketsSold: z.number().int(), passengers: z.number().int(), salesCentavos: z.number().int(), scansAccepted: z.number().int(), scansRefused: z.number().int() }),
    byStatus: z.object({ pending_payment: z.number().int(), paid: z.number().int(), used: z.number().int(), expired: z.number().int(), cancelled: z.number().int() }),
    topRoutes: z.array(z.object({ originName: z.string(), destinationName: z.string(), tickets: z.number().int(), passengers: z.number().int(), salesCentavos: z.number().int() })),
    paymentsNeedingReview: z.number().int(),
  }),
  timestamp: z.string(),
});
