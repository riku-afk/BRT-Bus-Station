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

export const AdminListQuery = PageQuery.extend({ needsReview: z.enum(['true', 'false']).optional() });

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
