/**
 * Mock payment provider (PAY-01, PAY-08): works with no internet and no account, but follows the same rules as a real
 * gateway so the whole flow is exercised:
 *
 *   - checkout gives the passenger a demo payment page (an app route) instead of a provider site
 *   - its Pay / Fail buttons do NOT touch the ticket: the server builds an event, SIGNS it with the webhook secret and
 *     sends it through the very same webhook path a real provider would use
 *   - the signature is HMAC-SHA256 over `<timestamp>.<raw body>` in an `x-brt-signature: t=…,v1=…` header, with a
 *     replay window, compared in constant time
 */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { CheckoutSession, HeaderReader, PaymentEvent, PaymentProvider } from './payment-provider';

export const MOCK_SIGNATURE_HEADER = 'x-brt-signature';
/** A signed event older than this is refused, so a captured request cannot be replayed much later. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

export const MOCK_METHODS = ['gcash', 'maya', 'qrph'] as const;
export type MockMethod = (typeof MOCK_METHODS)[number];

const EventSchema = z.object({
  id: z.string().min(1).max(100),
  type: z.string(),
  data: z.object({
    reference: z.string().min(1).max(200),
    amount: z.number().int().nonnegative().nullable().optional(),
    method: z.string().max(40).nullable().optional(),
  }),
});

export const mockCheckoutPath = (providerRef: string) => `/pay/mock/${providerRef}`;

export class MockPaymentProvider implements PaymentProvider {
  readonly name = 'mock' as const;

  constructor(
    private readonly secret: string,
    private readonly now: () => number = () => Date.now(),
  ) {}

  // The mock needs nothing from the request: it just mints a session id and points at the demo page.
  async createCheckout(): Promise<CheckoutSession> {
    const providerRef = `mock_cs_${randomBytes(18).toString('base64url')}`;
    return { providerRef, checkoutUrl: mockCheckoutPath(providerRef) };
  }

  private sign(timestamp: number, rawBody: string): string {
    return createHmac('sha256', this.secret).update(`${timestamp}.${rawBody}`).digest('hex');
  }

  /** Header value for a body: what the mock gateway attaches to the events it sends. */
  signBody(rawBody: string): string {
    const t = Math.floor(this.now() / 1000);
    return `t=${t},v1=${this.sign(t, rawBody)}`;
  }

  verifyWebhook(rawBody: string, headers: HeaderReader): boolean {
    const header = headers.get(MOCK_SIGNATURE_HEADER);
    if (!header) return false;
    const parts = Object.fromEntries(header.split(',').map((p) => p.trim().split('=', 2) as [string, string]));
    const t = Number(parts.t);
    const given = parts.v1;
    if (!Number.isInteger(t) || !given || !/^[0-9a-f]{64}$/.test(given)) return false;
    if (Math.abs(this.now() / 1000 - t) > SIGNATURE_TOLERANCE_SECONDS) return false;
    const expected = Buffer.from(this.sign(t, rawBody), 'hex');
    const actual = Buffer.from(given, 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  parseEvent(rawBody: string): PaymentEvent | null {
    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return null;
    }
    const parsed = EventSchema.safeParse(json);
    if (!parsed.success) return null;
    const { id, type, data } = parsed.data;
    const kind = type === 'checkout_session.payment.paid' ? 'succeeded' : type === 'checkout_session.payment.failed' ? 'failed' : null;
    if (!kind) return null;
    return { eventId: id, kind, providerRef: data.reference, amountCentavos: data.amount ?? null, method: data.method ?? null };
  }

  /** What the mock gateway sends after the passenger presses Pay / Fail. */
  buildEvent(input: { providerRef: string; kind: 'succeeded' | 'failed'; amountCentavos: number; method: MockMethod }): string {
    return JSON.stringify({
      id: `evt_${randomBytes(12).toString('base64url')}`,
      type: input.kind === 'succeeded' ? 'checkout_session.payment.paid' : 'checkout_session.payment.failed',
      data: { reference: input.providerRef, amount: input.amountCentavos, method: input.method },
    });
  }
}
