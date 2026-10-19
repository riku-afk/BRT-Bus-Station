import { z } from '@hono/zod-openapi';
import { MAX_TICKET_QUANTITY, TICKET_STATUSES } from '@shared/tickets/status';

export const TicketView = z.object({
  id: z.uuid(),
  referenceCode: z.string(),
  originStationId: z.uuid(),
  originName: z.string(),
  destinationStationId: z.uuid(),
  destinationName: z.string(),
  fareCentavos: z.number().int(),
  quantity: z.number().int(),
  status: z.enum(TICKET_STATUSES),
  validUntil: z.string(),
  paidAt: z.string().nullable(),
  usedAt: z.string().nullable(),
  createdAt: z.string(),
  busId: z.uuid().nullable(),
  busName: z.string().nullable(),
  payBeforeAt: z.string().nullable(),
});

/** The client says only WHERE. The fare is never accepted from the request (FARE-04). */
/** How many passengers one purchase covers. The fare is for ONE person: the server multiplies it, the client never sends a total. */
const Quantity = z.number().int().min(1).max(MAX_TICKET_QUANTITY).optional();
export const CreateTicketBody = z.union([
  // Buy on a bus that is waiting at a shelter: the shelter and the destination are the bus's.
  z.object({ busId: z.uuid(), quantity: Quantity }),
  z.object({ originId: z.uuid(), destinationId: z.uuid(), quantity: Quantity }),
]);
export const IdParam = z.object({ id: z.uuid() });

export const TicketResponse = z.object({ success: z.literal(true), data: TicketView, timestamp: z.string() });
export const TicketListResponse = z.object({ success: z.literal(true), data: z.array(TicketView), timestamp: z.string() });

export const CheckoutResponse = z.object({
  success: z.literal(true),
  data: z.object({
    paymentId: z.uuid(),
    ticketId: z.uuid(),
    provider: z.enum(['mock', 'pisopay']),
    amountCentavos: z.number().int(),
    checkoutUrl: z.string(),
    hasQr: z.boolean(),
  }),
  timestamp: z.string(),
});

export const EmailSentResponse = z.object({ success: z.literal(true), data: z.object({ sent: z.boolean() }), timestamp: z.string() });

export const PaymentStatusResponse = z.object({
  success: z.literal(true),
  data: z.object({
    ticketStatus: z.string(),
    paymentStatus: z.enum(['pending', 'succeeded', 'failed', 'cancelled', 'needs_review']).nullable(),
    provider: z.enum(['mock', 'pisopay']).nullable(),
    amountCentavos: z.number().int().nullable(),
    channelCode: z.string().nullable(),
    referenceNo: z.string().nullable(),
    hasQr: z.boolean(),
  }),
  timestamp: z.string(),
});
