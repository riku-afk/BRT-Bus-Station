import { z } from '@hono/zod-openapi';
import { APP_ENVIRONMENTS } from '@shared/app-info';

const envelope = <T extends z.ZodType>(data: T) => z.object({ success: z.literal(true), data, timestamp: z.string() });

export const HealthResponse = envelope(z.object({ status: z.literal('ok'), uptimeSeconds: z.number() }));

export const DatabaseHealthResponse = envelope(z.object({ status: z.enum(['ok', 'unavailable']) }));

export const SystemInfoResponse = envelope(
  z.object({
    softwareName: z.string(),
    version: z.string(),
    versionLabel: z.string(),
    environment: z.enum(APP_ENVIRONMENTS),
    showPocBanner: z.boolean(),
    pocDisclosure: z.string(),
    paymentProvider: z.string(),
  }),
);
