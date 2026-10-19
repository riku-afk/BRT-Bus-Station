import { createHash, createHmac } from 'node:crypto';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Session, setupTestApp } from './helpers';

/**
 * The whole PisoPay QR Ph path against the real app and database, with PisoPay's HTTP API stubbed: checkout (session,
 * token, transaction on a QR channel), the QR picture, the status check, and webhooks signed the way PisoPay signs them.
 * Proves the same money rules hold for the real adapter as for the mock.
 */

const USER = 'merchant_user';
const PASS = 'merchant_pass';
// PisoPay's sample QR Ph string.
const QR =
  '00020101021228530011ph.ppmi.p2m0111SRCPPHM2XXX0312MRCHNT-4GYET0503000520460105303608540520.005802PH5911RMS PISOPAY6013ParanaqueCity62610010ph.starpay0311RMS PISOPAY0509OR#P27AVD0708411135910803***88290012ph.ppmi.qrph0109OR#P27AVD6304E2E7';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
let admin: Session;
let pax: Session;
let other: Session;
const anon = () => new Session({ request: (p, i) => ctx.api.request(p, i) });
const db = () => ctx.db.getDb();
const st: string[] = [];
let resetChannelHealth: () => void = () => {};

/** What the stubbed PisoPay does. */
const pisopay = {
  down: new Set<string>(), // QR channels that refuse
  refuseToken: null as string | null,
  /** The transaction status the inquire endpoints report: 0 paid, 1 pending, 2 cancelled, 3 failed. */
  status: 1,
  amount: '19.00',
  fees: '0.00',
  reset() {
    this.down.clear();
    this.refuseToken = null;
    this.status = 1;
    this.amount = '19.00';
    this.fees = '0.00';
  },
};
const calls: { method: string; path: string; body: Record<string, unknown> | null }[] = [];
let referenceCounter = 0;

function stubPisoPay() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit) => {
      const path = new URL(url).pathname;
      const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
      calls.push({ method: String(init.method), path, body });
      const ok = (data: unknown) => new Response(JSON.stringify({ status: 0, message: 'Success', data }), { status: 200 });
      const no = (message: string) => new Response(JSON.stringify({ status: 1, message }), { status: 200 });
      if (path === '/api/v1/session') return ok({ session_id: 'sess-1' });
      if (path === '/api/v1/token') return pisopay.refuseToken ? no(pisopay.refuseToken) : ok({ url: 'https://payme.pisopay.test/x', pin: 'A', merchant_trace_no: body?.merchant_trace_no });
      if (path === '/api/v1/transaction') {
        const channel = String(body?.payment_channel_code);
        if (pisopay.down.has(channel)) return no('Channel not available');
        return ok({ amount: String(pisopay.amount), fees: pisopay.fees, referenceNo: `REF${++referenceCounter}`, channelCode: channel, qr: QR });
      }
      if (path.startsWith('/api/v1/transaction/reference/')) {
        return ok({ status: pisopay.status, reference_no: decodeURIComponent(path.split('/').pop()!), amount: pisopay.amount, fees: pisopay.fees, payment_channel_code: 'QR1' });
      }
      return new Response('{}', { status: 404 });
    }),
  );
}

const ticketRow = async (id: string) => (await db().query<{ status: string }>('SELECT status FROM tickets WHERE id = $1', [id]))[0]!;
const paymentRow = async (ticketId: string) =>
  (await db().query<{ id: string; status: string; provider: string; provider_ref: string; review_reason: string | null; method: string | null; qr_payload: string | null; provider_reference_no: string | null; channel_code: string | null; amount_centavos: number }>(
    'SELECT * FROM payments WHERE ticket_id = $1 ORDER BY created_at DESC', [ticketId]))[0]!;

async function newCheckout() {
  const t = (await pax.call('POST', '/tickets', { originId: st[0], destinationId: st[1] })).body.data as { id: string; fareCentavos: number };
  const res = await pax.call('POST', `/tickets/${t.id}/checkout`);
  return { ticket: t, res };
}
const pay = (id: string) => pax.call('GET', `/tickets/${id}/payment`);
// The status check is rate limited per payment (a couple of seconds) while a passenger waits; the tests clear it.
const unthrottle = () => vi.setSystemTime(Date.now() + 5000);

/** A payment notice as PisoPay sends it, signed with the merchant credentials. */
function notice(traceNo: string, amount: string, over: Record<string, string> = {}) {
  const f = { traceNo, amount, status: '0', timestamp: String(Math.floor(Date.now() / 1000)), referenceNo: `NOTICE-${Math.random().toString(36).slice(2)}`, paymentChannelCode: 'QR1', ...over };
  const auth = createHash('sha256').update(`${USER}:${PASS}${f.timestamp}`).digest('hex').slice(0, 10);
  const message = f.status === '0' ? auth + f.traceNo + f.amount : auth + f.traceNo + f.status + f.amount;
  return JSON.stringify({ responseCode: '00', data: { ...f, hd: over.hd ?? createHmac('sha256', f.timestamp).update(message).digest('hex') } });
}
const send = (body: string, provider = 'pisopay') =>
  ctx.api.request(`/payments/webhook/${provider}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
const outcome = async (res: Response) => ((await res.json()) as { data: { outcome: string } }).data.outcome;
const decode = (png: Buffer) => {
  const image = PNG.sync.read(png);
  return jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data ?? null;
};

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  ctx = await setupTestApp();
  const { resetChannelHealth: reset } = await import('@integrations/payment/pisopay.provider');
  resetChannelHealth = reset;
  const { env } = await import('@config/env');
  (env.payment as { provider: string }).provider = 'pisopay';
  Object.assign(env.payment.pisopay, { username: USER, password: PASS, baseUrl: 'https://api-checkout.pisopay.test', processorName: 'BRTBusStation' });
  const { authService } = await import('@modules/auth');
  await authService.createUser({ email: 'admin@t.test', password: 'Password123', fullName: 'Admin', role: 'admin' });
  await authService.createUser({ email: 'pax@t.test', password: 'Password123', fullName: 'Pax One', role: 'passenger' });
  await authService.createUser({ email: 'other@t.test', password: 'Password123', fullName: 'Other', role: 'passenger' });
  const signIn = async (email: string) => {
    const s = anon();
    await s.call('POST', '/auth/login', { email, password: 'Password123' });
    return s;
  };
  admin = await signIn('admin@t.test');
  pax = await signIn('pax@t.test');
  other = await signIn('other@t.test');
  // A 1 station trip costs 19.00 here: A to B.
  for (const [i, n] of ['A', 'B'].entries()) st.push((await admin.call('POST', '/stations', { name: n, latitude: 14 + i * 0.01, longitude: 121 })).body.data.id);
  stubPisoPay();
}, 120_000);

beforeEach(async () => {
  resetChannelHealth(); // channels that failed in an earlier test must not change which one is tried first
  pisopay.reset();
  calls.length = 0;
  vi.setSystemTime(Date.now() + 10_000);
  await db().query("UPDATE tickets SET status = 'cancelled' WHERE status = 'pending_payment'");
});

afterAll(async () => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  await ctx?.close();
});

describe('QR Ph checkout', () => {
  it('buying a ticket gives a QR Ph payment straight away: session, token, then a QR on QR1, for exactly the fare', async () => {
    const { ticket, res } = await newCheckout();
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ provider: 'pisopay', hasQr: true, checkoutUrl: `/tickets/${ticket.id}` });

    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /api/v1/session', 'POST /api/v1/token', 'POST /api/v1/transaction']);
    expect(calls[1]!.body!.amount).toBe((ticket.fareCentavos / 100).toFixed(2));
    expect(calls[2]!.body!.payment_channel_code).toBe('QR1');
    expect(String(calls[1]!.body!.merchant_callback_url)).toMatch(/\/api\/payments\/webhook\/pisopay$/);

    const payment = await paymentRow(ticket.id);
    expect(payment).toMatchObject({ provider: 'pisopay', channel_code: 'QR1', qr_payload: QR, status: 'pending', amount_centavos: ticket.fareCentavos });
    expect(payment.provider_reference_no).toMatch(/^REF\d+$/);
    expect(payment.provider_ref).toBe(calls[1]!.body!.merchant_trace_no);
  });

  it('uses QR2 when QR1 is not available (and QR3 after that)', async () => {
    pisopay.down.add('QR1');
    expect((await paymentRow((await newCheckout()).ticket.id)).channel_code).toBe('QR2');
    pisopay.down.add('QR2');
    calls.length = 0;
    vi.setSystemTime(Date.now() + 10 * 60_000); // past the "recently failed" cooldown so the order is QR1, QR2, QR3 again
    const { ticket } = await newCheckout();
    expect((await paymentRow(ticket.id)).channel_code).toBe('QR3');
    expect(calls.filter((c) => c.path === '/api/v1/transaction').map((c) => c.body!.payment_channel_code)).toEqual(['QR1', 'QR2', 'QR3']);
  });

  it('serves the QR as a PNG with the QR Ph logo that scans back to the code PisoPay generated', async () => {
    const { ticket } = await newCheckout();
    const res = await pax.raw(`/tickets/${ticket.id}/payment-qr.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toMatch(/no-store/);
    expect(decode(Buffer.from(await res.arrayBuffer()))).toBe(QR);
  });

  it('the QR is private to the owner and only exists while the ticket awaits payment', async () => {
    const { ticket } = await newCheckout();
    expect((await other.raw(`/tickets/${ticket.id}/payment-qr.png`)).status).toBe(404);
    expect((await anon().raw(`/tickets/${ticket.id}/payment-qr.png`)).status).toBe(401);
    expect((await admin.raw(`/tickets/${ticket.id}/payment-qr.png`)).status).toBe(403);
    expect((await other.call('GET', `/tickets/${ticket.id}/payment`)).status).toBe(404);

    await pax.call('POST', `/tickets/${ticket.id}/cancel`);
    expect((await pax.raw(`/tickets/${ticket.id}/payment-qr.png`)).status).toBe(409);
  });

  it('clicking pay again reuses the open checkout and its QR', async () => {
    const { ticket, res } = await newCheckout();
    const again = await pax.call('POST', `/tickets/${ticket.id}/checkout`);
    expect(again.body.data.paymentId).toBe(res.body.data.paymentId);
    expect(calls.filter((c) => c.path === '/api/v1/token')).toHaveLength(1);
  });

  it('when PisoPay refuses, the passenger gets its message and the ticket stays unpaid and payable', async () => {
    pisopay.refuseToken = 'Amount below minimum';
    const { ticket, res } = await newCheckout();
    expect(res.status).toBe(502);
    expect(res.body.error.message).toContain('Amount below minimum');
    expect((await ticketRow(ticket.id)).status).toBe('pending_payment');
    expect(await db().query('SELECT 1 FROM payments WHERE ticket_id = $1', [ticket.id])).toHaveLength(0);

    pisopay.refuseToken = null;
    expect((await pax.call('POST', `/tickets/${ticket.id}/checkout`)).status).toBe(200);
  });

  it('what PisoPay returned is stored once and cannot be changed', async () => {
    const { ticket } = await newCheckout();
    const { id } = await paymentRow(ticket.id);
    await expect(db().query("UPDATE payments SET qr_payload = 'other' WHERE id = $1", [id])).rejects.toThrow(/cannot be changed/);
    await expect(db().query("UPDATE payments SET provider_reference_no = 'other' WHERE id = $1", [id])).rejects.toThrow(/cannot be changed/);
    await expect(db().query("UPDATE payments SET channel_code = 'QR9' WHERE id = $1", [id])).rejects.toThrow(/cannot be changed/);
  });

  it('the admin payments list never exposes the QR payload', async () => {
    await newCheckout();
    const list = (await admin.call('GET', '/payments')).body.data.items as Record<string, unknown>[];
    expect(list.length).toBeGreaterThan(0);
    expect(JSON.stringify(list)).not.toContain('qr_payload');
    expect(JSON.stringify(list)).not.toContain(QR);
  });
});

describe('the 15-minute payment window', () => {
  it('PisoPay is told the checkout expires when the ticket does (15 minutes after it was bought)', async () => {
    const { ticket } = await newCheckout();
    const created = (await db().query<{ created_at: Date }>('SELECT created_at FROM tickets WHERE id = $1', [ticket.id]))[0]!.created_at;
    const token = calls.find((c) => c.path === '/api/v1/token')!.body!;
    const { formatExpiry } = await import('@integrations/payment');
    expect(token.expiry_date).toBe(formatExpiry(new Date(created.getTime() + 15 * 60_000)));
  });

  it('when the window runs out the passenger sees an expired ticket and the QR is gone, even if the expiry worker has not run', async () => {
    const { ticket } = await newCheckout();
    expect((await pay(ticket.id)).body.data.ticketStatus).toBe('pending_payment');
    await db().query("UPDATE tickets SET created_at = created_at - interval '16 minutes' WHERE id = $1", [ticket.id]);

    expect((await pax.raw(`/tickets/${ticket.id}/payment-qr.png`)).status).toBe(409);
    const res = await pay(ticket.id);
    expect(res.body.data).toMatchObject({ ticketStatus: 'expired', paymentStatus: 'cancelled' });
    expect((await ticketRow(ticket.id)).status).toBe('expired');
    expect((await pax.call('POST', `/tickets/${ticket.id}/checkout`)).status).toBe(409);
  });

  it('a payment that still arrives after the window is kept for review, never lost', async () => {
    const { ticket } = await newCheckout();
    const trace = (await paymentRow(ticket.id)).provider_ref;
    await db().query("UPDATE tickets SET created_at = created_at - interval '16 minutes' WHERE id = $1", [ticket.id]);
    await pay(ticket.id); // the window is enforced, the ticket expires
    expect(await outcome(await send(notice(trace, (ticket.fareCentavos / 100).toFixed(2))))).toBe('paid_after_close');
    expect((await ticketRow(ticket.id)).status).toBe('expired');
    expect((await paymentRow(ticket.id)).status).toBe('needs_review');
  });
});

describe('checking the payment with PisoPay', () => {
  it('stays pending while PisoPay says pending', async () => {
    const { ticket } = await newCheckout();
    const res = await pay(ticket.id);
    expect(res.body.data).toMatchObject({ ticketStatus: 'pending_payment', paymentStatus: 'pending', provider: 'pisopay', hasQr: true, channelCode: 'QR1' });
    expect(calls.some((c) => c.path.startsWith('/api/v1/transaction/reference/'))).toBe(true);
  });

  it('marks the ticket paid when PisoPay says it was paid, with no webhook needed', async () => {
    const { ticket } = await newCheckout();
    pisopay.status = 0;
    pisopay.amount = (ticket.fareCentavos / 100).toFixed(2);
    const res = await pay(ticket.id);
    expect(res.body.data).toMatchObject({ ticketStatus: 'paid', paymentStatus: 'succeeded' });
    expect((await ticketRow(ticket.id)).status).toBe('paid');
    expect((await paymentRow(ticket.id)).method).toBe('pisopay_qr1');
  });

  it('the fare is the amount minus PisoPay fees', async () => {
    const { ticket } = await newCheckout();
    pisopay.status = 0;
    pisopay.amount = ((ticket.fareCentavos + 200) / 100).toFixed(2);
    pisopay.fees = '2.00';
    expect((await pay(ticket.id)).body.data.ticketStatus).toBe('paid');
  });

  it('a payment of the wrong amount is kept for review and does not pay the ticket', async () => {
    const { ticket } = await newCheckout();
    pisopay.status = 0;
    pisopay.amount = '1.00';
    const res = await pay(ticket.id);
    expect(res.body.data).toMatchObject({ ticketStatus: 'pending_payment', paymentStatus: 'needs_review' });
    expect(await paymentRow(ticket.id)).toMatchObject({ status: 'needs_review', review_reason: 'amount_mismatch' });
  });

  it('is asked at most every couple of seconds per payment, however often the page polls', async () => {
    const { ticket } = await newCheckout();
    calls.length = 0;
    await pay(ticket.id);
    await pay(ticket.id);
    await pay(ticket.id);
    expect(calls.filter((c) => c.path.startsWith('/api/v1/transaction/reference/'))).toHaveLength(1);
    unthrottle();
    await pay(ticket.id);
    expect(calls.filter((c) => c.path.startsWith('/api/v1/transaction/reference/'))).toHaveLength(2);
  });

  it('the webhook and the status check for one payment are applied once: the second is a duplicate, not a double payment', async () => {
    const { ticket } = await newCheckout();
    const payment = await paymentRow(ticket.id);
    pisopay.status = 0;
    pisopay.amount = (ticket.fareCentavos / 100).toFixed(2);
    expect((await pay(ticket.id)).body.data.ticketStatus).toBe('paid');

    const hook = await send(notice(payment.provider_ref, pisopay.amount, { referenceNo: payment.provider_reference_no! }));
    expect(await outcome(hook)).toBe('duplicate');
    expect((await paymentRow(ticket.id)).status).toBe('succeeded'); // not flagged as a double payment
    expect(await db().query('SELECT 1 FROM payment_events WHERE payment_id = $1', [payment.id])).toHaveLength(1);
  });

  it('a failed or expired payment at PisoPay is marked failed, and the passenger can start a fresh QR', async () => {
    const { ticket } = await newCheckout();
    pisopay.status = 3;
    expect((await pay(ticket.id)).body.data).toMatchObject({ ticketStatus: 'pending_payment', paymentStatus: 'failed' });

    pisopay.status = 1;
    const again = await pax.call('POST', `/tickets/${ticket.id}/checkout`);
    expect(again.status).toBe(200);
    expect(again.body.data.paymentId).not.toBe((await db().query<{ id: string }>("SELECT id FROM payments WHERE ticket_id = $1 AND status = 'failed'", [ticket.id]))[0]!.id);
    expect((await paymentRow(ticket.id)).status).toBe('pending');
  });

  it('PisoPay being down leaves things as they were (the webhook may still arrive)', async () => {
    const { ticket } = await newCheckout();
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('ECONNRESET'))));
    unthrottle();
    const res = await pay(ticket.id);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ ticketStatus: 'pending_payment', paymentStatus: 'pending' });
    stubPisoPay();
  });
});

describe('PisoPay webhook', () => {
  const traceOf = async (ticketId: string) => (await paymentRow(ticketId)).provider_ref;
  const fare = (t: { fareCentavos: number }) => (t.fareCentavos / 100).toFixed(2);

  it('a correctly signed payment for the right amount marks the ticket paid', async () => {
    const { ticket } = await newCheckout();
    const res = await send(notice(await traceOf(ticket.id), fare(ticket)));
    expect(res.status).toBe(200);
    expect(await outcome(res)).toBe('applied');
    expect((await ticketRow(ticket.id)).status).toBe('paid');
    expect(await paymentRow(ticket.id)).toMatchObject({ status: 'succeeded', method: 'pisopay_qr1' });
  });

  it('a redelivered notice changes nothing', async () => {
    const { ticket } = await newCheckout();
    const body = notice(await traceOf(ticket.id), fare(ticket), { referenceNo: 'REF-FIXED' });
    expect(await outcome(await send(body))).toBe('applied');
    expect(await outcome(await send(body))).toBe('duplicate');
  });

  it('an amount that does not match the fare is kept for review and does not pay the ticket', async () => {
    const { ticket } = await newCheckout();
    expect(await outcome(await send(notice(await traceOf(ticket.id), '1.00')))).toBe('amount_mismatch');
    expect((await ticketRow(ticket.id)).status).toBe('pending_payment');
    expect(await paymentRow(ticket.id)).toMatchObject({ status: 'needs_review', review_reason: 'amount_mismatch' });
  });

  it('a forged or tampered notice is refused and changes nothing', async () => {
    const { ticket } = await newCheckout();
    const trace = await traceOf(ticket.id);
    const forged = JSON.parse(notice(trace, fare(ticket)));
    forged.data.hd = createHmac('sha256', forged.data.timestamp).update('guess').digest('hex');
    expect((await send(JSON.stringify(forged))).status).toBe(401);
    const cheap = JSON.parse(notice(trace, '1.00'));
    cheap.data.amount = fare(ticket);
    expect((await send(JSON.stringify(cheap))).status).toBe(401);
    const unsigned = JSON.parse(notice(trace, fare(ticket)));
    delete unsigned.data.hd;
    expect((await send(JSON.stringify(unsigned))).status).toBe(401);
    expect((await send('not json')).status).toBe(401);
    expect((await ticketRow(ticket.id)).status).toBe('pending_payment');
    expect((await paymentRow(ticket.id)).status).toBe('pending');
  });

  it('a validly signed notice for a payment we never made pays nothing', async () => {
    const res = await send(notice('BRTDOESNOTEXIST00', '19.00'));
    expect(res.status).toBe(200);
    expect(await outcome(res)).toBe('unknown_payment');
  });

  it('other statuses are ignored, and the mock endpoint does nothing while PisoPay is the provider', async () => {
    const { ticket } = await newCheckout();
    const trace = await traceOf(ticket.id);
    expect(await outcome(await send(notice(trace, '19.00', { status: '2' })))).toBe('ignored');
    expect((await ticketRow(ticket.id)).status).toBe('pending_payment');
    expect((await send(notice(trace, '19.00'), 'mock')).status).toBe(404);
  });
});
