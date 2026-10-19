export const PAYMENT_STATUSES = ['pending', 'succeeded', 'failed', 'cancelled', 'needs_review'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export type PaymentRow = {
  id: string;
  ticket_id: string;
  provider: 'mock' | 'pisopay';
  provider_ref: string;
  method: string | null;
  amount_centavos: number;
  checkout_url: string;
  status: PaymentStatus;
  review_reason: string | null;
  /** QR Ph checkouts: what PisoPay returned. Written once. */
  qr_payload: string | null;
  provider_reference_no: string | null;
  channel_code: string | null;
  created_at: Date;
  updated_at: Date;
};

/** A payment with its ticket's reference, for the admin list. */
export type PaymentAdminRow = Omit<PaymentRow, 'qr_payload' | 'provider_reference_no' | 'channel_code'> & { reference_code: string; origin_name: string; destination_name: string };

/** What the app did with a webhook event; stored on the event row as evidence. */
export type WebhookOutcome =
  | 'applied' // the ticket is now paid
  | 'duplicate' // this event id was already handled: nothing changed
  | 'payment_failed' // the provider reported a failed attempt
  | 'amount_mismatch' // paid amount differs from the fare: flagged, ticket NOT paid
  | 'ticket_not_payable' // money arrived but the ticket was cancelled / expired / already paid: flagged
  | 'paid_after_close' // money arrived for a checkout the app had already closed: flagged
  | 'already_settled' // the payment was already finished; nothing to do
  | 'unknown_payment' // no such checkout here
  | 'ignored'; // an event type the app does not act on

export type CheckoutView = {
  paymentId: string;
  ticketId: string;
  provider: 'mock' | 'pisopay';
  amountCentavos: number;
  /** An app path (mock, QR Ph) or an absolute provider URL. */
  checkoutUrl: string;
  /** True when the payment is a QR Ph code shown in the app (`GET /tickets/:id/payment-qr.png`). */
  hasQr: boolean;
};

/** Where a ticket's payment stands, as the ticket page needs it while the passenger scans and waits. */
export type PaymentStatusView = {
  ticketStatus: string;
  paymentStatus: PaymentStatus | null;
  provider: 'mock' | 'pisopay' | null;
  amountCentavos: number | null;
  channelCode: string | null;
  referenceNo: string | null;
  hasQr: boolean;
};
