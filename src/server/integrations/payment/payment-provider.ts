/**
 * Payment gateway adapter (PAY-01). The app only ever talks to this interface:
 *
 *   mock       offline demo provider (default): a demo payment page whose buttons produce a signed webhook
 *   pisopay    PisoPay redirect checkout (phase P8), the same way the e-Notary system uses it
 *
 * A provider never marks anything paid. It creates a checkout, proves a webhook is genuine, and translates the
 * provider's event into this app's neutral shape; the payments service decides what the event means.
 */

export type PaymentProviderName = 'mock' | 'pisopay';

export type CheckoutRequest = {
  paymentId: string;
  ticketId: string;
  referenceCode: string;
  amountCentavos: number;
  description: string;
  /** Where the app shows this payment (the page the passenger is sent to). */
  checkoutPath: string;
  /** Hosted providers only (the mock ignores these): where the passenger returns to, and where the provider reports the result. */
  returnUrl: string;
  webhookUrl: string;
  /** When the checkout stops being payable (the ticket's pay-by time). */
  expiresAt: Date;
  /** Needed by the provider to take the payment; sent to it and nowhere else, never logged. */
  customer: { name: string; email: string; phone: string | null };
  clientIp: string;
};

/** A QR Ph code the provider generated for one payment (it already carries the amount). */
export type QrCheckout = {
  /** The EMV QR Ph string, encoded as is into the picture. */
  payload: string;
  /** The provider's reference number for the payment, used to ask whether it was paid. */
  referenceNo: string;
  /** Which provider channel produced it, e.g. QR1. */
  channelCode: string;
};

export type CheckoutSession = {
  /** The provider's id for this checkout; webhooks refer to it. */
  providerRef: string;
  /** Where to send the passenger: an absolute URL for a real provider, an app path for the mock. */
  checkoutUrl: string;
  /** Present when the payment is a QR code shown in this app instead of a hosted provider page. */
  qr?: QrCheckout;
};

/** What asking the provider "was this paid?" returned. */
export type InquiryResult = {
  state: 'paid' | 'pending' | 'cancelled' | 'failed';
  /** The same event a webhook for this payment would carry (paid / failed); null while pending. */
  event: PaymentEvent | null;
  /** A short stable text hashed into the evidence record. Never the provider's raw body (it holds customer details). */
  evidence: string;
};

/** A provider event in the app's own terms. */
export type PaymentEvent = {
  /** Unique per event, stable across redeliveries: the idempotency key. */
  eventId: string;
  kind: 'succeeded' | 'failed';
  providerRef: string;
  /** What the provider says was paid, in centavos. `null` if the event does not say. */
  amountCentavos: number | null;
  method: string | null;
};

export type HeaderReader = { get(name: string): string | null | undefined };

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  /** True only if the signature over the RAW request body is valid. Never throws on bad input. */
  verifyWebhook(rawBody: string, headers: HeaderReader): boolean;
  /** `null` for events this app does not act on. Only call after `verifyWebhook` returned true. */
  parseEvent(rawBody: string): PaymentEvent | null;
  /** Ask the provider about one payment (server to server). Providers whose results arrive only by webhook omit this. */
  inquire?(payment: { providerRef: string; referenceNo: string | null }): Promise<InquiryResult>;
}
