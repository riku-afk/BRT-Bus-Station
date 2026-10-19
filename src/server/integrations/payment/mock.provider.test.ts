import { describe, expect, it } from 'vitest';
import { MockPaymentProvider, MOCK_SIGNATURE_HEADER, SIGNATURE_TOLERANCE_SECONDS } from './mock.provider';

const SECRET = 'test-webhook-secret-0123456789';
let clock = 1_800_000_000_000;
const provider = () => new MockPaymentProvider(SECRET, () => clock);
const headers = (value: string | null) => ({ get: (name: string) => (name.toLowerCase() === MOCK_SIGNATURE_HEADER ? value : null) });
const paid = (p: MockPaymentProvider, extra: { amountCentavos?: number } = {}) =>
  p.buildEvent({ providerRef: 'mock_cs_abc', kind: 'succeeded', amountCentavos: extra.amountCentavos ?? 1700, method: 'gcash' });

describe('mock payment provider: signatures (PAY-03)', () => {
  it('accepts a body it signed itself', () => {
    const p = provider();
    const body = paid(p);
    expect(p.verifyWebhook(body, headers(p.signBody(body)))).toBe(true);
  });

  it('refuses a missing, malformed or empty signature', () => {
    const p = provider();
    const body = paid(p);
    for (const bad of [null, '', 'garbage', 't=abc,v1=zz', `t=${Math.floor(clock / 1000)}`, `v1=${'0'.repeat(64)}`, `t=${Math.floor(clock / 1000)},v1=short`]) {
      expect(p.verifyWebhook(body, headers(bad))).toBe(false);
    }
  });

  it('refuses a body changed after signing (e.g. a different amount)', () => {
    const p = provider();
    const body = paid(p, { amountCentavos: 1700 });
    const signature = p.signBody(body);
    const tampered = body.replace('1700', '100');
    expect(tampered).not.toBe(body);
    expect(p.verifyWebhook(tampered, headers(signature))).toBe(false);
  });

  it('refuses a signature made with another secret', () => {
    const other = new MockPaymentProvider('some-other-secret-0123456789', () => clock);
    const body = paid(provider());
    expect(provider().verifyWebhook(body, headers(other.signBody(body)))).toBe(false);
  });

  it('refuses an old signature (replay window) but accepts one inside it', () => {
    const p = provider();
    const body = paid(p);
    const signature = p.signBody(body);
    clock += (SIGNATURE_TOLERANCE_SECONDS - 5) * 1000;
    expect(p.verifyWebhook(body, headers(signature))).toBe(true);
    clock += 10 * 1000;
    expect(p.verifyWebhook(body, headers(signature))).toBe(false);
    clock = 1_800_000_000_000;
  });

  it('refuses a signature dated in the future beyond the window', () => {
    const early = new MockPaymentProvider(SECRET, () => clock + 3600_000);
    const body = paid(provider());
    expect(provider().verifyWebhook(body, headers(early.signBody(body)))).toBe(false);
  });
});

describe('mock payment provider: events', () => {
  it('turns a paid event into the neutral shape', () => {
    const p = provider();
    const event = p.parseEvent(paid(p));
    expect(event).toMatchObject({ kind: 'succeeded', providerRef: 'mock_cs_abc', amountCentavos: 1700, method: 'gcash' });
    expect(event!.eventId).toMatch(/^evt_/);
  });

  it('turns a failed event into the neutral shape', () => {
    const p = provider();
    const event = p.parseEvent(p.buildEvent({ providerRef: 'mock_cs_x', kind: 'failed', amountCentavos: 500, method: 'maya' }));
    expect(event).toMatchObject({ kind: 'failed', providerRef: 'mock_cs_x', method: 'maya' });
  });

  it('gives every event its own id (the idempotency key)', () => {
    const p = provider();
    expect(p.parseEvent(paid(p))!.eventId).not.toBe(p.parseEvent(paid(p))!.eventId);
  });

  it('ignores event types it does not act on and rejects junk', () => {
    const p = provider();
    expect(p.parseEvent(JSON.stringify({ id: 'e1', type: 'something.else', data: { reference: 'r' } }))).toBeNull();
    expect(p.parseEvent('not json')).toBeNull();
    expect(p.parseEvent('{}')).toBeNull();
    expect(p.parseEvent(JSON.stringify({ id: 'e1', type: 'checkout_session.payment.paid', data: {} }))).toBeNull();
  });

  it('reports a missing amount as null rather than guessing', () => {
    const p = provider();
    const body = JSON.stringify({ id: 'e1', type: 'checkout_session.payment.paid', data: { reference: 'r' } });
    expect(p.parseEvent(body)!.amountCentavos).toBeNull();
  });

  it('creates a checkout that points at the demo payment page', async () => {
    const session = await provider().createCheckout();
    expect(session.providerRef).toMatch(/^mock_cs_/);
    expect(session.checkoutUrl).toBe(`/pay/mock/${session.providerRef}`);
  });
});
