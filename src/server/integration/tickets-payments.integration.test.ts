import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { endOfManilaDay } from '@shared/datetime/ph-time';
import { Session, setupTestApp } from './helpers';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
let payments: typeof import('@integrations/payment');
let tickets: typeof import('@modules/tickets');
let admin: Session;
let pax1: Session;
let pax2: Session;
const anon = () => new Session({ request: (p, i) => ctx.api.request(p, i) });
const db = () => ctx.db.getDb();

const st: string[] = []; // stations A, B, C, D (A→B costs 1700, A→C 1900)

type TicketBody = { id: string; referenceCode: string; status: string; fareCentavos: number; paidAt: string | null; validUntil: string; payBeforeAt: string | null };

async function newTicket(s: Session, from = 0, to = 1) {
  const res = await s.call('POST', '/tickets', { originId: st[from], destinationId: st[to] });
  expect(res.status).toBe(201);
  return res.body.data as TicketBody;
}
async function checkout(s: Session, ticketId: string) {
  const res = await s.call('POST', `/tickets/${ticketId}/checkout`);
  expect(res.status).toBe(200);
  return res.body.data as { paymentId: string; checkoutUrl: string; amountCentavos: number; ticketId: string };
}
const refOf = (checkoutUrl: string) => checkoutUrl.replace('/pay/mock/', '');
const ticketRow = async (id: string) => (await db().query<{ status: string; paid_at: Date | null; valid_until: Date }>('SELECT status, paid_at, valid_until FROM tickets WHERE id = $1', [id]))[0]!;
const paymentRow = async (id: string) => (await db().query<{ status: string; review_reason: string | null; method: string | null }>('SELECT status, review_reason, method FROM payments WHERE id = $1', [id]))[0]!;
const eventCount = async () => Number((await db().query<{ n: string }>('SELECT count(*) AS n FROM payment_events'))[0]!.n);

/** A webhook exactly as a provider would send it: raw JSON body and a signature header. */
function signedEvent(providerRef: string, kind: 'succeeded' | 'failed', amountCentavos: number, method: 'gcash' | 'maya' | 'qrph' = 'gcash') {
  const provider = payments.getMockProvider();
  const body = provider.buildEvent({ providerRef, kind, amountCentavos, method });
  return { body, signature: provider.signBody(body) };
}
const sendWebhook = async (body: string, signature: string | null, provider = 'mock') =>
  await ctx.api.request(`/payments/webhook/${provider}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(signature ? { 'x-brt-signature': signature } : {}) },
    body,
  });
async function webhook(providerRef: string, kind: 'succeeded' | 'failed', amountCentavos: number) {
  const { body, signature } = signedEvent(providerRef, kind, amountCentavos);
  const res = await sendWebhook(body, signature);
  return { status: res.status, json: (await res.json()) as { data?: { outcome: string }; error?: { code: string } }, body, signature };
}

beforeAll(async () => {
  ctx = await setupTestApp();
  payments = await import('@integrations/payment');
  tickets = await import('@modules/tickets');
  const { authService } = await import('@modules/auth');
  await authService.createUser({ email: 'admin@t.test', password: 'Password123', fullName: 'Admin', role: 'admin' });
  await authService.createUser({ email: 'pax1@t.test', password: 'Password123', fullName: 'Pax One', role: 'passenger' });
  await authService.createUser({ email: 'pax2@t.test', password: 'Password123', fullName: 'Pax Two', role: 'passenger' });
  await authService.createUser({ email: 'kond@t.test', password: 'Password123', fullName: 'Kond', role: 'konduktor' });
  admin = anon();
  await admin.call('POST', '/auth/login', { email: 'admin@t.test', password: 'Password123' });
  pax1 = anon();
  await pax1.call('POST', '/auth/login', { email: 'pax1@t.test', password: 'Password123' });
  pax2 = anon();
  await pax2.call('POST', '/auth/login', { email: 'pax2@t.test', password: 'Password123' });
  for (const [i, n] of ['A', 'B', 'C', 'D'].entries()) {
    st.push((await admin.call('POST', '/stations', { name: n, latitude: 14 + i * 0.01, longitude: 121 })).body.data.id);
  }
}, 120_000);

beforeEach(async () => {
  await db().query("UPDATE tickets SET status = 'cancelled' WHERE status = 'pending_payment'");
});

afterAll(async () => {
  await ctx?.close();
});

describe('creating tickets (TKT-01)', () => {
  it('creates a ticket awaiting payment with a server-computed fare, a reference code, and a pay-by time', async () => {
    const res = await pax1.call('POST', '/tickets', { originId: st[0], destinationId: st[2], fareCentavos: 1, passengerId: 'someone-else', status: 'paid' });
    expect(res.status).toBe(201);
    const t = res.body.data as TicketBody & { originName: string; destinationName: string };
    expect(t).toMatchObject({ status: 'pending_payment', fareCentavos: 1900, originName: 'A', destinationName: 'C', paidAt: null });
    expect(t.referenceCode).toMatch(/^BRT-[A-Z2-9]{6}$/);
    // Whatever the client claimed about price, owner or status was ignored.
    const mine = (await pax1.call('GET', '/tickets/mine')).body.data as TicketBody[];
    expect(mine.map((x) => x.id)).toContain(t.id);
    expect((await pax2.call('GET', '/tickets/mine')).body.data).toEqual([]);
    // Pay by: created + 15 minutes (TICKET_PENDING_TTL_MINUTES).
    const diff = new Date(t.payBeforeAt!).getTime() - Date.now();
    expect(diff).toBeGreaterThan(14 * 60_000);
    expect(diff).toBeLessThanOrEqual(15 * 60_000);
    await pax1.call('POST', `/tickets/${t.id}/cancel`);
  });

  it('is for passengers only', async () => {
    const body = { originId: st[0], destinationId: st[1] };
    expect((await anon().call('POST', '/tickets', body)).status).toBe(401);
    expect((await admin.call('POST', '/tickets', body)).status).toBe(403);
    const kond = anon();
    await kond.call('POST', '/auth/login', { email: 'kond@t.test', password: 'Password123' });
    expect((await kond.call('POST', '/tickets', body)).status).toBe(403);
    expect((await anon().call('GET', '/tickets/mine')).status).toBe(401);
    expect((await admin.call('GET', '/tickets/mine')).status).toBe(403);
  });

  it('validates the stations', async () => {
    expect((await pax1.call('POST', '/tickets', { originId: st[0], destinationId: st[0] })).status).toBe(400);
    expect((await pax1.call('POST', '/tickets', { originId: 'nope', destinationId: st[1] })).status).toBe(400);
    expect((await pax1.call('POST', '/tickets', { originId: st[0], destinationId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
    await admin.call('PATCH', `/stations/${st[3]}`, { isActive: false });
    expect((await pax1.call('POST', '/tickets', { originId: st[0], destinationId: st[3] })).status).toBe(400);
    await admin.call('PATCH', `/stations/${st[3]}`, { isActive: true });
  });

  it('freezes the fare: a later fare change does not touch an existing ticket (FARE-04)', async () => {
    const t = await newTicket(pax2, 0, 1);
    await admin.call('PUT', '/fares/settings', { baseFareCentavos: 5000, perStationCentavos: 500 });
    expect(((await pax2.call('GET', `/tickets/${t.id}`)).body.data as TicketBody).fareCentavos).toBe(1700);
    expect((await newTicket(pax2, 0, 1)).fareCentavos).toBe(5500);
    await admin.call('PUT', '/fares/settings', { baseFareCentavos: 1500, perStationCentavos: 200 });
    await db().query("UPDATE tickets SET status = 'cancelled' WHERE passenger_id = (SELECT id FROM users WHERE email = 'pax2@t.test')");
  });

  it('limits how many unpaid tickets one passenger can hold, and frees a slot when one is cancelled', async () => {
    await db().query("UPDATE tickets SET status = 'cancelled' WHERE status = 'pending_payment'");
    const made: TicketBody[] = [];
    for (let i = 0; i < 5; i++) made.push(await newTicket(pax1));
    const sixth = await pax1.call('POST', '/tickets', { originId: st[0], destinationId: st[1] });
    expect(sixth.status).toBe(409);
    expect(sixth.body.error.message).toMatch(/5 tickets waiting for payment/);
    // Another passenger is unaffected.
    expect((await pax2.call('POST', '/tickets', { originId: st[0], destinationId: st[1] })).status).toBe(201);
    await pax1.call('POST', `/tickets/${made[0]!.id}/cancel`);
    expect((await pax1.call('POST', '/tickets', { originId: st[0], destinationId: st[1] })).status).toBe(201);
    await db().query("UPDATE tickets SET status = 'cancelled' WHERE status = 'pending_payment'");
  });

  it('gives every ticket a different reference code', async () => {
    const codes = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const t = await newTicket(pax1);
      codes.add(t.referenceCode);
      await pax1.call('POST', `/tickets/${t.id}/cancel`);
    }
    expect(codes.size).toBe(4);
  });

  it("keeps passengers' tickets private (another passenger's ticket looks like it does not exist)", async () => {
    const t = await newTicket(pax1);
    expect((await pax2.call('GET', `/tickets/${t.id}`)).status).toBe(404);
    expect((await pax2.call('POST', `/tickets/${t.id}/cancel`)).status).toBe(404);
    expect((await pax2.call('POST', `/tickets/${t.id}/checkout`)).status).toBe(404);
    expect((await anon().call('GET', `/tickets/${t.id}`)).status).toBe(401);
    await pax1.call('POST', `/tickets/${t.id}/cancel`);
  });
});

describe('cancelling (TKT-06)', () => {
  it('lets the owner cancel an unpaid ticket once, and closes its checkout', async () => {
    const t = await newTicket(pax1);
    const co = await checkout(pax1, t.id);
    const cancelled = await pax1.call('POST', `/tickets/${t.id}/cancel`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data.status).toBe('cancelled');
    expect((await paymentRow(co.paymentId)).status).toBe('cancelled');
    const again = await pax1.call('POST', `/tickets/${t.id}/cancel`);
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/cancelled and cannot be cancelled/);
  });

  it('cannot cancel a paid ticket (no refunds in the POC)', async () => {
    const t = await newTicket(pax1);
    const co = await checkout(pax1, t.id);
    expect((await webhook(refOf(co.checkoutUrl), 'succeeded', t.fareCentavos)).json.data?.outcome).toBe('applied');
    const res = await pax1.call('POST', `/tickets/${t.id}/cancel`);
    expect(res.status).toBe(409);
    expect((await ticketRow(t.id)).status).toBe('paid');
  });
});

describe('checkout (PAY-02)', () => {
  it('returns the demo payment page for the ticket, priced from the ticket, and reuses it on a second click', async () => {
    const t = await newTicket(pax1, 0, 2);
    const first = await checkout(pax1, t.id);
    expect(first.checkoutUrl).toMatch(/^\/pay\/mock\/mock_cs_[A-Za-z0-9_-]+$/);
    expect(first.amountCentavos).toBe(1900);
    const second = await checkout(pax1, t.id);
    expect(second.paymentId).toBe(first.paymentId);
    expect(second.checkoutUrl).toBe(first.checkoutUrl);
    expect(await db().query("SELECT 1 FROM payments WHERE ticket_id = $1 AND status = 'pending'", [t.id])).toHaveLength(1);
  });

  it('never marks the ticket paid: not the checkout, not the demo page, not looking at the ticket (PAY-03)', async () => {
    const t = await newTicket(pax1);
    const co = await checkout(pax1, t.id);
    await anon().call('GET', `/payments/mock/sessions/${refOf(co.checkoutUrl)}`);
    await pax1.call('GET', `/tickets/${t.id}`);
    await pax1.call('GET', '/tickets/mine');
    expect((await ticketRow(t.id)).status).toBe('pending_payment');
    expect((await paymentRow(co.paymentId)).status).toBe('pending');
  });

  it('refuses a ticket that is not payable: cancelled, paid, or unpaid for too long', async () => {
    const cancelled = await newTicket(pax1);
    await pax1.call('POST', `/tickets/${cancelled.id}/cancel`);
    expect((await pax1.call('POST', `/tickets/${cancelled.id}/checkout`)).status).toBe(409);

    const paid = await newTicket(pax1);
    await webhook(refOf((await checkout(pax1, paid.id)).checkoutUrl), 'succeeded', paid.fareCentavos);
    const again = await pax1.call('POST', `/tickets/${paid.id}/checkout`);
    expect(again.status).toBe(409);
    expect(again.body.error.message).toMatch(/paid and cannot be paid/);

    const stale = await newTicket(pax1);
    await db().query("UPDATE tickets SET created_at = now() - interval '20 minutes' WHERE id = $1", [stale.id]);
    const late = await pax1.call('POST', `/tickets/${stale.id}/checkout`);
    expect(late.status).toBe(409);
    expect(late.body.error.message).toMatch(/not paid in time/);
  });
});

describe('the webhook is the only way a ticket becomes paid (PAY-03)', () => {
  it('rejects anything that is not properly signed, and changes nothing', async () => {
    const t = await newTicket(pax1);
    const co = await checkout(pax1, t.id);
    const ref = refOf(co.checkoutUrl);
    const before = await eventCount();
    const good = signedEvent(ref, 'succeeded', t.fareCentavos);

    // No signature, junk signature, someone else's secret, a signature that does not match the body.
    const outsider = new payments.MockPaymentProvider('an-attackers-guess-0123456789');
    const forged = outsider.signBody(good.body);
    const tampered = signedEvent(ref, 'succeeded', 100); // a different body, the first body's signature
    for (const [body, signature] of [
      [good.body, null],
      [good.body, 'garbage'],
      [good.body, forged],
      [tampered.body, good.signature],
    ] as const) {
      const res = await sendWebhook(body, signature);
      expect(res.status).toBe(401);
      expect(((await res.json()) as { error: { code: string } }).error.code).toBe('INVALID_SIGNATURE');
    }
    // A replayed capture from long ago.
    const old = new payments.MockPaymentProvider(process.env.PAYMENT_WEBHOOK_SECRET ?? 'dev-only-webhook-secret', () => Date.now() - 3600_000);
    expect((await sendWebhook(good.body, old.signBody(good.body))).status).toBe(401);

    expect((await ticketRow(t.id)).status).toBe('pending_payment');
    expect((await paymentRow(co.paymentId)).status).toBe('pending');
    expect(await eventCount()).toBe(before);
  });

  it('marks the ticket paid for a genuine event, with validity to the end of the Manila day', async () => {
    const t = await newTicket(pax1, 0, 2);
    const co = await checkout(pax1, t.id);
    const res = await webhook(refOf(co.checkoutUrl), 'succeeded', t.fareCentavos);
    expect(res.status).toBe(200);
    expect(res.json.data?.outcome).toBe('applied');

    const row = await ticketRow(t.id);
    expect(row.status).toBe('paid');
    expect(row.paid_at).not.toBeNull();
    expect(row.valid_until.getTime()).toBe(endOfManilaDay(row.paid_at!).getTime());
    expect(await paymentRow(co.paymentId)).toMatchObject({ status: 'succeeded', method: 'gcash', review_reason: null });
    const view = (await pax1.call('GET', `/tickets/${t.id}`)).body.data as TicketBody;
    expect(view).toMatchObject({ status: 'paid', payBeforeAt: null });
  });

  it('acknowledges a redelivery with 200 and changes nothing (PAY-04)', async () => {
    const t = await newTicket(pax1);
    const co = await checkout(pax1, t.id);
    const first = await webhook(refOf(co.checkoutUrl), 'succeeded', t.fareCentavos);
    expect(first.json.data?.outcome).toBe('applied');
    const paidAt = (await ticketRow(t.id)).paid_at!.getTime();
    const events = await eventCount();

    // The very same request again, then the same event with a fresh signature (as a retry would be).
    const same = await sendWebhook(first.body, first.signature);
    expect(same.status).toBe(200);
    expect(((await same.json()) as { data: { outcome: string } }).data.outcome).toBe('duplicate');
    const resigned = await sendWebhook(first.body, payments.getMockProvider().signBody(first.body));
    expect(((await resigned.json()) as { data: { outcome: string } }).data.outcome).toBe('duplicate');

    expect(await eventCount()).toBe(events);
    expect((await ticketRow(t.id)).paid_at!.getTime()).toBe(paidAt);
  });

  it('applies one event exactly once when five copies arrive at the same moment', async () => {
    const t = await newTicket(pax1);
    const co = await checkout(pax1, t.id);
    const { body, signature } = signedEvent(refOf(co.checkoutUrl), 'succeeded', t.fareCentavos);
    const results = await Promise.all(Array.from({ length: 5 }, () => sendWebhook(body, signature).then((r) => r.json() as Promise<{ data: { outcome: string } }>)));
    const outcomes = results.map((r) => r.data.outcome).sort();
    expect(outcomes).toEqual(['applied', 'duplicate', 'duplicate', 'duplicate', 'duplicate']);
    expect(await db().query('SELECT 1 FROM payment_events WHERE payment_id = $1', [co.paymentId])).toHaveLength(1);
    expect((await ticketRow(t.id)).status).toBe('paid');
  });

  it('does not accept an event whose amount is not the ticket fare, and flags it (PAY-06)', async () => {
    const t = await newTicket(pax1, 0, 1); // 1700
    const co = await checkout(pax1, t.id);
    const res = await webhook(refOf(co.checkoutUrl), 'succeeded', 100);
    expect(res.status).toBe(200);
    expect(res.json.data?.outcome).toBe('amount_mismatch');
    expect((await ticketRow(t.id)).status).toBe('pending_payment');
    expect(await paymentRow(co.paymentId)).toMatchObject({ status: 'needs_review', review_reason: 'amount_mismatch' });

    // An event that does not state an amount cannot be verified either.
    const t2 = await newTicket(pax1);
    const co2 = await checkout(pax1, t2.id);
    const provider = payments.getMockProvider();
    const body = JSON.stringify({ id: 'evt_noamount', type: 'checkout_session.payment.paid', data: { reference: refOf(co2.checkoutUrl) } });
    const noAmount = await sendWebhook(body, provider.signBody(body));
    expect(((await noAmount.json()) as { data: { outcome: string } }).data.outcome).toBe('amount_mismatch');
    expect((await ticketRow(t2.id)).status).toBe('pending_payment');
  });

  it('records a failed attempt without touching the ticket, which can still be paid', async () => {
    const t = await newTicket(pax1);
    const co = await checkout(pax1, t.id);
    expect((await webhook(refOf(co.checkoutUrl), 'failed', t.fareCentavos)).json.data?.outcome).toBe('payment_failed');
    expect(await paymentRow(co.paymentId)).toMatchObject({ status: 'failed' });
    expect((await ticketRow(t.id)).status).toBe('pending_payment');

    // A new checkout is allowed, and paying that one works.
    const retry = await checkout(pax1, t.id);
    expect(retry.paymentId).not.toBe(co.paymentId);
    expect((await webhook(refOf(retry.checkoutUrl), 'succeeded', t.fareCentavos)).json.data?.outcome).toBe('applied');
    expect((await ticketRow(t.id)).status).toBe('paid');
  });

  it('flags a second payment for a ticket that is already paid (a double charge)', async () => {
    const t = await newTicket(pax1);
    const first = await checkout(pax1, t.id);
    await webhook(refOf(first.checkoutUrl), 'failed', t.fareCentavos);
    const second = await checkout(pax1, t.id);
    // The first session is retried at the provider and succeeds, then so does the second.
    expect((await webhook(refOf(first.checkoutUrl), 'succeeded', t.fareCentavos)).json.data?.outcome).toBe('applied');
    const dup = await webhook(refOf(second.checkoutUrl), 'succeeded', t.fareCentavos);
    expect(dup.json.data?.outcome).toBe('ticket_not_payable');
    expect(await paymentRow(second.paymentId)).toMatchObject({ status: 'needs_review', review_reason: 'ticket_paid' });
    expect((await ticketRow(t.id)).status).toBe('paid');
  });

  it('keeps and flags money that arrives after the ticket was cancelled or expired (PAY-07)', async () => {
    const cancelled = await newTicket(pax1);
    const c1 = await checkout(pax1, cancelled.id);
    await pax1.call('POST', `/tickets/${cancelled.id}/cancel`);
    expect((await webhook(refOf(c1.checkoutUrl), 'succeeded', cancelled.fareCentavos)).json.data?.outcome).toBe('paid_after_close');
    expect(await paymentRow(c1.paymentId)).toMatchObject({ status: 'needs_review', review_reason: 'paid_after_close' });
    expect((await ticketRow(cancelled.id)).status).toBe('cancelled');

    const expired = await newTicket(pax1);
    const c2 = await checkout(pax1, expired.id);
    await db().query("UPDATE tickets SET created_at = now() - interval '20 minutes' WHERE id = $1", [expired.id]);
    await tickets.ticketsService.expireStale();
    expect((await ticketRow(expired.id)).status).toBe('expired');
    expect((await webhook(refOf(c2.checkoutUrl), 'succeeded', expired.fareCentavos)).json.data?.outcome).toBe('paid_after_close');
    expect((await ticketRow(expired.id)).status).toBe('expired');

    // And a checkout that was somehow still open when its ticket expired.
    const open = await newTicket(pax1);
    const c3 = await checkout(pax1, open.id);
    await db().query("UPDATE tickets SET status = 'expired' WHERE id = $1", [open.id]);
    expect((await webhook(refOf(c3.checkoutUrl), 'succeeded', open.fareCentavos)).json.data?.outcome).toBe('ticket_not_payable');
    expect(await paymentRow(c3.paymentId)).toMatchObject({ status: 'needs_review', review_reason: 'ticket_expired' });
  });

  it('records an event for a checkout it has never heard of, and does nothing else', async () => {
    const before = await eventCount();
    const res = await webhook('mock_cs_doesNotExistAnywhere', 'succeeded', 1700);
    expect(res.status).toBe(200);
    expect(res.json.data?.outcome).toBe('unknown_payment');
    expect(await eventCount()).toBe(before + 1);
    const rows = await db().query<{ payment_id: string | null }>("SELECT payment_id FROM payment_events WHERE outcome = 'unknown_payment'");
    expect(rows[0]!.payment_id).toBeNull();
  });

  it('ignores event types it does not act on, unknown providers, and oversized bodies', async () => {
    const provider = payments.getMockProvider();
    const other = JSON.stringify({ id: 'evt_other', type: 'something.else', data: { reference: 'x' } });
    const ignored = await sendWebhook(other, provider.signBody(other));
    expect(ignored.status).toBe(200);
    expect(((await ignored.json()) as { data: { outcome: string } }).data.outcome).toBe('ignored');

    const good = signedEvent('mock_cs_x', 'succeeded', 1);
    expect((await sendWebhook(good.body, good.signature, 'stripe')).status).toBe(404);
    expect((await sendWebhook(good.body, good.signature, 'maya')).status).toBe(404);

    const huge = 'x'.repeat(70_000);
    const big = await sendWebhook(huge, provider.signBody(huge));
    expect(big.status).toBe(413);
  });

  it('stores a hash of each event, never the payload', async () => {
    const cols = (await db().query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'payment_events'")).map((c) => c.column_name);
    expect(cols).not.toContain('payload');
    expect(cols).toContain('payload_hash');
    const rows = await db().query<{ payload_hash: string }>('SELECT payload_hash FROM payment_events LIMIT 3');
    for (const r of rows) expect(r.payload_hash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('evidence cannot be altered (PAY-05)', () => {
  it('refuses to update or delete a stored webhook event', async () => {
    await expect(db().query("UPDATE payment_events SET outcome = 'applied'")).rejects.toThrow(/insert-only/);
    await expect(db().query('DELETE FROM payment_events')).rejects.toThrow(/insert-only/);
  });

  it("refuses to change a payment's amount, ticket or reference, or to delete it, but lets its status move", async () => {
    const t = await newTicket(pax1);
    const co = await checkout(pax1, t.id);
    await expect(db().query('UPDATE payments SET amount_centavos = 1 WHERE id = $1', [co.paymentId])).rejects.toThrow(/cannot be changed/);
    await expect(db().query("UPDATE payments SET provider_ref = 'other' WHERE id = $1", [co.paymentId])).rejects.toThrow(/cannot be changed/);
    await expect(db().query('DELETE FROM payments WHERE id = $1', [co.paymentId])).rejects.toThrow(/cannot be deleted/);
    expect((await db().query("UPDATE payments SET status = 'cancelled' WHERE id = $1 RETURNING id", [co.paymentId])).length).toBe(1);
    await pax1.call('POST', `/tickets/${t.id}/cancel`);
  });
});

describe('the demo payment page (PAY-08)', () => {
  it('describes what is being paid, without needing a login', async () => {
    const t = await newTicket(pax1, 0, 2);
    const co = await checkout(pax1, t.id);
    const res = await anon().call('GET', `/payments/mock/sessions/${refOf(co.checkoutUrl)}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      payable: true,
      amountCentavos: 1900,
      referenceCode: t.referenceCode,
      originName: 'A',
      destinationName: 'C',
      returnPath: `/tickets/${t.id}?return=1`,
      methods: ['gcash', 'maya', 'qrph'],
    });
    expect((await anon().call('GET', '/payments/mock/sessions/mock_cs_notarealsession')).status).toBe(404);
  });

  it('Pay sends a SIGNED event through the real webhook path, and the ticket becomes paid', async () => {
    const t = await newTicket(pax1);
    const co = await checkout(pax1, t.id);
    const ref = refOf(co.checkoutUrl);
    const res = await anon().call('POST', `/payments/mock/sessions/${ref}/complete`, { outcome: 'paid', method: 'maya' });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ outcome: 'applied', returnPath: `/tickets/${t.id}?return=1` });
    expect((await ticketRow(t.id)).status).toBe('paid');
    expect(await paymentRow(co.paymentId)).toMatchObject({ status: 'succeeded', method: 'maya' });
    // It went through the webhook path: an event with its hash is on record.
    expect(await db().query('SELECT 1 FROM payment_events WHERE payment_id = $1', [co.paymentId])).toHaveLength(1);

    const again = await anon().call('POST', `/payments/mock/sessions/${ref}/complete`, { outcome: 'paid' });
    expect(again.status).toBe(409);
    expect((await anon().call('GET', `/payments/mock/sessions/${ref}`)).body.data.payable).toBe(false);
  });

  it('Fail leaves the ticket unpaid and payable by a new checkout', async () => {
    const t = await newTicket(pax1);
    const co = await checkout(pax1, t.id);
    const res = await anon().call('POST', `/payments/mock/sessions/${refOf(co.checkoutUrl)}/complete`, { outcome: 'failed' });
    expect(res.body.data.outcome).toBe('payment_failed');
    expect((await ticketRow(t.id)).status).toBe('pending_payment');
    const retry = await checkout(pax1, t.id);
    expect(retry.paymentId).not.toBe(co.paymentId);
  });

  it('refuses to pay a cancelled ticket', async () => {
    const t = await newTicket(pax1);
    const co = await checkout(pax1, t.id);
    await pax1.call('POST', `/tickets/${t.id}/cancel`);
    expect((await anon().call('GET', `/payments/mock/sessions/${refOf(co.checkoutUrl)}`)).body.data.payable).toBe(false);
    const res = await anon().call('POST', `/payments/mock/sessions/${refOf(co.checkoutUrl)}/complete`, { outcome: 'paid' });
    expect(res.status).toBe(409);
    expect((await ticketRow(t.id)).status).toBe('cancelled');
  });
});

describe('the expiry worker (TKT-07, TKT-04)', () => {
  it('expires unpaid tickets past the window and closes their checkouts, leaving fresh ones alone', async () => {
    await db().query("UPDATE tickets SET status = 'cancelled' WHERE status = 'pending_payment'");
    const old = await newTicket(pax1);
    const oldCo = await checkout(pax1, old.id);
    const fresh = await newTicket(pax1);
    const freshCo = await checkout(pax1, fresh.id);
    await db().query("UPDATE tickets SET created_at = now() - interval '16 minutes' WHERE id = $1", [old.id]);

    const result = await tickets.ticketsService.expireStale();
    expect(result.unpaid).toBe(1);
    expect((await ticketRow(old.id)).status).toBe('expired');
    expect((await paymentRow(oldCo.paymentId)).status).toBe('cancelled');
    expect((await ticketRow(fresh.id)).status).toBe('pending_payment');
    expect((await paymentRow(freshCo.paymentId)).status).toBe('pending');
    await pax1.call('POST', `/tickets/${fresh.id}/cancel`);
  });

  it('expires paid tickets once their day has ended, and never touches used ones', async () => {
    const paid = await newTicket(pax1);
    await webhook(refOf((await checkout(pax1, paid.id)).checkoutUrl), 'succeeded', paid.fareCentavos);
    const used = await newTicket(pax1);
    await webhook(refOf((await checkout(pax1, used.id)).checkoutUrl), 'succeeded', used.fareCentavos);
    await db().query("UPDATE tickets SET status = 'used', used_at = now() WHERE id = $1", [used.id]);
    await db().query("UPDATE tickets SET valid_until = now() - interval '1 minute' WHERE id IN ($1, $2)", [paid.id, used.id]);

    const result = await tickets.ticketsService.expireStale();
    expect(result.lapsed).toBe(1);
    expect((await ticketRow(paid.id)).status).toBe('expired');
    expect((await ticketRow(used.id)).status).toBe('used');
  });

  it('is idempotent and safe to run twice at once', async () => {
    await db().query("UPDATE tickets SET status = 'cancelled' WHERE status = 'pending_payment'");
    const ids: string[] = [];
    for (let i = 0; i < 4; i++) ids.push((await newTicket(pax2)).id);
    await db().query("UPDATE tickets SET created_at = now() - interval '30 minutes' WHERE id = ANY($1::uuid[])", [ids]);

    const [a, b] = await Promise.all([tickets.ticketsService.expireStale(), tickets.ticketsService.expireStale()]);
    expect(a.unpaid + b.unpaid).toBe(4); // each ticket expired exactly once between them
    expect(await tickets.ticketsService.expireStale()).toEqual({ unpaid: 0, lapsed: 0 });
    for (const id of ids) expect((await ticketRow(id)).status).toBe('expired');
  });

  it('does not expire a ticket that a payment is applying at that moment', async () => {
    const t = await newTicket(pax2);
    const co = await checkout(pax2, t.id);
    await db().query("UPDATE tickets SET created_at = now() - interval '30 minutes' WHERE id = $1", [t.id]);
    // The webhook and the worker race: whichever wins, the ticket ends in one consistent state, never both.
    const [hook] = await Promise.all([webhook(refOf(co.checkoutUrl), 'succeeded', t.fareCentavos), tickets.ticketsService.expireStale()]);
    const finalTicket = await ticketRow(t.id);
    const finalPayment = await paymentRow(co.paymentId);
    if (hook.json.data?.outcome === 'applied') {
      expect(finalTicket.status).toBe('paid');
      expect(finalPayment.status).toBe('succeeded');
    } else {
      expect(finalTicket.status).toBe('expired');
      expect(['needs_review', 'cancelled']).toContain(finalPayment.status);
    }
  });
});

describe('payments and the expiry worker never deadlock', () => {
  it('survives a webhook and the worker acting on the same ticket at the same moment, over and over', async () => {
    // Both lock the ticket before its payment. (They once locked in opposite orders and deadlocked now and then.)
    const results = { applied: 0, closed: 0 };
    for (let i = 0; i < 20; i++) {
      const t = await newTicket(pax2);
      const co = await checkout(pax2, t.id);
      await db().query("UPDATE tickets SET created_at = now() - interval '30 minutes' WHERE id = $1", [t.id]);

      const [hook, worker] = await Promise.allSettled([webhook(refOf(co.checkoutUrl), 'succeeded', t.fareCentavos), tickets.ticketsService.expireStale()]);
      expect(worker.status, `worker pass ${i}`).toBe('fulfilled');
      expect(hook.status, `webhook ${i}`).toBe('fulfilled');
      if (hook.status === 'fulfilled') expect(hook.value.status).toBe(200);

      // One consistent outcome: paid, or expired with the money flagged. Never both, never neither.
      const ticket = await ticketRow(t.id);
      const payment = await paymentRow(co.paymentId);
      if (ticket.status === 'paid') {
        expect(payment.status).toBe('succeeded');
        results.applied++;
      } else {
        expect(ticket.status).toBe('expired');
        expect(['needs_review', 'cancelled']).toContain(payment.status);
        results.closed++;
      }
    }
    expect(results.applied + results.closed).toBe(20);
  }, 60_000);
});

describe('payments for admins', () => {
  it('lists recent payments and the ones needing review, for admins only', async () => {
    expect((await anon().call('GET', '/payments')).status).toBe(401);
    expect((await pax1.call('GET', '/payments')).status).toBe(403);

    type Row = { status: string; referenceCode: string; reviewReason: string | null; amountCentavos: number };
    const first = (await admin.call('GET', '/payments')).body.data as { items: Row[]; page: number; pageSize: number; total: number; totalPages: number };
    const all = first.items;
    expect(first.total).toBeGreaterThan(5);
    expect(first.pageSize).toBe(10);
    expect(all.length).toBe(Math.min(10, first.total));
    expect(first.totalPages).toBe(Math.ceil(first.total / 10));
    expect(all.every((p) => /^BRT-/.test(p.referenceCode))).toBe(true);

    const flagged = (await admin.call('GET', '/payments?needsReview=true&pageSize=50')).body.data.items as Row[];
    expect(flagged.length).toBeGreaterThan(0);
    expect(flagged.every((p) => p.status === 'needs_review' && p.reviewReason)).toBe(true);
    expect(new Set(flagged.map((p) => p.reviewReason))).toEqual(new Set(['amount_mismatch', 'ticket_paid', 'paid_after_close', 'ticket_expired']));
  });
});

describe('the whole purchase, as a passenger does it', () => {
  it('buy → pay with the demo page → paid, and it shows up in station demand', async () => {
    const t = await newTicket(pax2, 1, 3); // from station B
    const demandBefore = ((await admin.call('GET', '/stations/demand')).body.data as { stationId: string; validTickets: number }[]).find((d) => d.stationId === st[1])!.validTickets;

    const co = await checkout(pax2, t.id);
    expect(((await pax2.call('GET', `/tickets/${t.id}`)).body.data as TicketBody).status).toBe('pending_payment');
    await anon().call('POST', `/payments/mock/sessions/${refOf(co.checkoutUrl)}/complete`, { outcome: 'paid', method: 'qrph' });

    const view = (await pax2.call('GET', `/tickets/${t.id}`)).body.data as TicketBody;
    expect(view.status).toBe('paid');
    expect(new Date(view.validUntil).getTime()).toBeGreaterThan(Date.now());
    const demandAfter = ((await admin.call('GET', '/stations/demand')).body.data as { stationId: string; validTickets: number }[]).find((d) => d.stationId === st[1])!.validTickets;
    expect(demandAfter).toBe(demandBefore + 1);
  });
});
