import { z } from '@hono/zod-openapi';

export const QuoteQuery = z.object({ origin: z.uuid(), destination: z.uuid() });

export const FareQuote = z.object({
  originId: z.uuid(),
  destinationId: z.uuid(),
  stationsTravelled: z.number().int(),
  fareCentavos: z.number().int(),
  source: z.enum(['computed', 'override']),
});

export const FareQuoteResponse = z.object({ success: z.literal(true), data: FareQuote, timestamp: z.string() });

// ₱1,000 ceiling guards against a typo of extra zeros.
const centavos = z.number().int().min(0).max(100_000);

export const FareSettings = z.object({ baseFareCentavos: centavos, perStationCentavos: centavos });
export const FareSettingsResponse = z.object({ success: z.literal(true), data: FareSettings, timestamp: z.string() });

export const FareOverride = z.object({
  originId: z.uuid(),
  destinationId: z.uuid(),
  originName: z.string(),
  destinationName: z.string(),
  fareCentavos: z.number().int(),
});
export const FareOverrideListResponse = z.object({ success: z.literal(true), data: z.array(FareOverride), timestamp: z.string() });

export const SetOverrideBody = z.object({ originId: z.uuid(), destinationId: z.uuid(), fareCentavos: centavos });
export const OverridePairQuery = z.object({ origin: z.uuid(), destination: z.uuid() });
