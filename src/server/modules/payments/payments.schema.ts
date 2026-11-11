import { z } from '@hono/zod-openapi';
import { PageQuery, pagedResponse } from '@lib/pagination';
import { MOCK_METHODS } from '@integrations/payment';
import { PAYMENT_STATUSES } from './payments.types';

export const ProviderRefParam = z.object({ ref: z.string().min(8).max(200) });

export const MockSessionResponse = z.object({
  success: z.literal(true),
  data: z.object({
    providerRef: z.string(),
    payable: z.boolean(),
    paymentStatus: z.enum(PAYMENT_STATUSES),
    ticketStatus: z.string(),
    amountCentavos: z.number().int(),
    referenceCode: z.string(),
    originName: z.string(),
    destinationName: z.string(),
    returnPath: z.string(),
    methods: z.array(z.enum(MOCK_METHODS)),
  }),
  timestamp: z.string(),
});

export const MockCompleteBody = z.object({
  outcome: z.enum(['paid', 'failed']),
  method: z.enum(MOCK_METHODS).default('gcash'),
});

export const MockCompleteResponse = z.object({
  success: z.literal(true),
  data: z.object({ outcome: z.string(), returnPath: z.string() }),
  timestamp: z.string(),
});

const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

/** The admin filter, shared by the list, the report and the CSV export. `needsReview=true` is kept for older callers. */
export const AdminFilterQuery = z.object({
  status: z.enum(PAYMENT_STATUSES).optional(),
  provider: z.enum(['mock', 'pisopay']).optional(),
  method: z.string().trim().min(1).max(40).optional(),
  from: Day.optional().openapi({ description: 'First Manila day, inclusive' }),
  to: Day.optional().openapi({ description: 'Last Manila day, inclusive' }),
  q: z.string().trim().min(1).max(40).optional().openapi({ description: 'Part of a ticket reference code' }),
  needsReview: z.enum(['true', 'false']).optional(),
});
export const AdminListQuery = PageQuery.extend(AdminFilterQuery.shape);

const Money = z.number().int();
export const AdminReportResponse = z.object({
  success: z.literal(true),
  data: z.object({
    totals: z.object({
      count: z.number().int(),
      amountCentavos: Money,
      paidCount: z.number().int(),
      paidCentavos: Money,
      pendingCentavos: Money,
      needsReviewCount: z.number().int(),
      needsReviewCentavos: Money,
    }),
    byStatus: z.array(z.object({ status: z.enum(PAYMENT_STATUSES), count: z.number().int(), amountCentavos: Money })),
    byMethod: z.array(z.object({ method: z.string(), count: z.number().int(), amountCentavos: Money })),
    byDay: z.array(z.object({ day: z.string(), count: z.number().int(), paidCount: z.number().int(), paidCentavos: Money })),
    methods: z.array(z.string()),
  }),
  timestamp: z.string(),
});

export const AdminPaymentView = z.object({
  id: z.uuid(),
  ticketId: z.uuid(),
  referenceCode: z.string(),
  originName: z.string(),
  destinationName: z.string(),
  provider: z.enum(['mock', 'pisopay']),
  method: z.string().nullable(),
  amountCentavos: z.number().int(),
  status: z.enum(PAYMENT_STATUSES),
  reviewReason: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export const AdminPaymentListResponse = pagedResponse(AdminPaymentView);
