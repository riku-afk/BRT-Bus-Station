import { z } from '@hono/zod-openapi';
import { PageQuery, pagedResponse } from '@lib/pagination';
import { SCAN_RESULTS } from '@shared/scans/models';

/** Either what the QR carried, or (manual fallback, SCN-08) the reference code a passenger reads out: exactly one. */
export const ScanBody = z
  .object({
    token: z.string().min(1).max(300).optional(),
    referenceCode: z.string().min(1).max(20).optional(),
  })
  .refine((v) => (v.token !== undefined) !== (v.referenceCode !== undefined), 'Send either a QR token or a reference code, not both');

const reason = z.enum(['bad_token', 'bad_code', 'unknown_ticket', 'not_paid', 'cancelled', 'wrong_station', 'wrong_bus', 'bus_not_at_station']).nullable();

export const ScanResponse = z.object({
  success: z.literal(true),
  data: z.object({
    result: z.enum(SCAN_RESULTS),
    reason,
    message: z.string(),
    ticket: z.object({ referenceCode: z.string(), originName: z.string(), destinationName: z.string(), fareCentavos: z.number().int(), quantity: z.number().int() }).nullable(),
    usedAt: z.string().nullable(),
    scannedAt: z.string(),
  }),
  timestamp: z.string(),
});

const Entry = z.object({
  id: z.uuid(),
  scannedAt: z.string(),
  result: z.enum(SCAN_RESULTS),
  reason,
  referenceCode: z.string().nullable(),
  originName: z.string().nullable(),
  destinationName: z.string().nullable(),
  busName: z.string().nullable(),
  quantity: z.number().int().nullable(),
});

/** `result`: only the scans that were accepted, only the ones that were refused, or all (the default). */
export const HistoryQuery = PageQuery.extend({ days: z.coerce.number().int().min(1).max(30).optional(), result: z.enum(['all', 'valid', 'rejected']).optional() });

export const HistoryResponse = z.object({
  success: z.literal(true),
  data: z.object({
    items: z.array(Entry),
    page: z.number().int(),
    pageSize: z.number().int(),
    total: z.number().int(),
    totalPages: z.number().int(),
    days: z.array(z.object({ date: z.string(), total: z.number().int(), valid: z.number().int(), rejected: z.number().int() })),
  }),
  timestamp: z.string(),
});

export const RideResponse = z.object({
  success: z.literal(true),
  data: z.object({ passengers: z.number().int(), tickets: z.number().int(), since: z.string().nullable(), atShelter: z.string().nullable(), canComplete: z.boolean() }),
  timestamp: z.string(),
});

export const RideCompletedResponse = z.object({
  success: z.literal(true),
  data: z.object({ passengers: z.number().int(), tickets: z.number().int(), completedAt: z.string() }),
  timestamp: z.string(),
});

export const AdminQuery = PageQuery.extend({
  konduktorId: z.uuid().optional(),
  busId: z.uuid().optional(),
  /** A Manila calendar day, `YYYY-MM-DD`. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
  result: z.enum(SCAN_RESULTS).optional(),
});

export const AdminResponse = pagedResponse(Entry.extend({ konduktorId: z.uuid(), konduktorName: z.string(), busId: z.uuid().nullable() }));
