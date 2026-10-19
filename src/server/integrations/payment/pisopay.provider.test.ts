import { createHash, createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { eventIdFor, formatExpiry, PisoPayPaymentProvider, resetChannelHealth, traceNoFor } from './pisopay.provider';

/**
 * Contract tests. The request / response shapes follow PisoPay's developer guide (embedded type: session, token,
 * transaction; the inquire endpoints) and the sample response PisoPay gave us; the webhook signature follows the e-Notary
 * system's working `PisoPayService.php`. Replace the samples with sandbox captures when available.
 */

const USER = 'merchant_user';
const PASS = 'merchant_pass';

// PisoPay's sample QR Ph payload for ₱20.00.
const QR =
  '00020101021228530011ph.ppmi.p2m0111SRCPPHM2XXX0312MRCHNT-4GYET0503000520460105303608540520.005802PH5911RMS PISOPAY6013ParanaqueCity62610010ph.starpay0311RMS PISOPAY0509OR#P27AVD0708411135910803***88290012ph.ppmi.qrph0109OR#P27AVD6304E2E7';

beforeEach(() => resetChannelHealth());

type Handler = (path: string, init: RequestInit) => Response | Promise<Response>;
const make = (handler?: Handler, extra: { channels?: string[]; now?: () => number } = {}) =>
  new PisoPayPaymentProvider({
    baseUrl: 'https://api-checkout.example.test/',
    username: USER,
    password: PASS,
    processorName: 'BRTBusStation',
    channels: extra.channels,
    now: extra.now,
    fetchFn: handler ? async (url, init) => handler(new URL(url).pathname, init) : undefined,
  });

const ok = (data: unknown, message = 'Success') => new Response(JSON.stringify({ status: 0, message, data }), { status: 200 });
const refused = (message: string) => new Response(JSON.stringify({ status: 1, message }), { status: 200 });

/** A PisoPay that works: session, token and a transaction for any channel. */
const happy = (calls: { path: string; method: string; body: Record<string, unknown> | null }[] = []): Handler => (path, init) => {
  calls.push({ path, method: String(init.method), body: init.body ? JSON.parse(String(init.body)) : null });
  if (path === '/api/v1/session') return ok({ session_id: 'sess-1' }, 'Success Saving Session');
  if (path === '/api/v1/token') return ok({ url: 'https://payme.pisopay.test/abc', pin: 'NJQQQ2', merchant_trace_no: 'x', transaction_id: '1' }, 'Success Token Initiate');
  const channel = JSON.parse(String(init.body)).payment_channel_code;
  return ok({ amount: '33.00', amountWithoutFees: '33.00', fees: '0.00', referenceNo: `REF-${channel}`, channelCode: channel, qr: QR }, 'Success Generating Reference Number');
};

/** The signature exactly as PisoPay (and e-Notary's PHP) computes it, written out independently of the adapter. */
function hdFor(f: { timestamp: string; traceNo: string; amount: string; status: string }) {
  const auth = createHash('sha256').update(`${USER}:${PASS}${f.timestamp}`).digest('hex').slice(0, 10);
  const message = f.status === '0' ? auth + f.traceNo + f.amount : auth + f.traceNo + f.status + f.amount;
  return createHmac('sha256', f.timestamp).update(message).digest('hex');
}

const webhook = (overrides: Record<string, unknown> = {}, wrap = true) => {
  const base = { traceNo: 'BRT0123456789ABC', amount: '33.00', status: '0', timestamp: '1800000000', referenceNo: 'REF-1', transactionId: 'T-1', paymentChannelCode: 'QR1' };
  const fields: Record<string, unknown> = { ...base, ...overrides };
  if (!('hd' in overrides)) fields.hd = hdFor(fields as { timestamp: string; traceNo: string; amount: string; status: string });
  return JSON.stringify(wrap ? { responseCode: '00', responseMessage: 'OK', data: fields } : fields);
};

const request = {
  paymentId: '01234567-89ab-cdef-0000-000000000000',
  ticketId: 't-1',
  referenceCode: 'BRT-ABC234',
  amountCentavos: 3300,
  description: 'Bus ticket S3 to S12',
  checkoutPath: '/tickets/t-1',
  returnUrl: 'https://brt.example/tickets/t-1?return=1',
  webhookUrl: 'https://brt.example/api/payments/webhook/pisopay',
  expiresAt: new Date('2026-10-16T08:15:00Z'),
  customer: { name: 'Pax One', email: 'pax1@brt.test', phone: null },
  clientIp: '203.0.113.9',
};

describe('PisoPay: creating a QR Ph checkout (session, token, transaction)', () => {
  it('registers the payment for the exact fare, then asks for a QR on QR1', async () => {
    const calls: { path: string; method: string; body: Record<string, unknown> | null }[] = [];
    const checkout = await make(happy(calls)).createCheckout(request);

    expect(checkout).toEqual({ providerRef: traceNoFor(request.paymentId), checkoutUrl: '/tickets/t-1', qr: { payload: QR, referenceNo: 'REF-QR1', channelCode: 'QR1' } });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /api/v1/session', 'POST /api/v1/token', 'POST /api/v1/transaction']);

    const token = calls[1]!.body!;
    expect(token).toMatchObject({
      session_id: 'sess-1',
      merchant_trace_no: traceNoFor(request.paymentId),
      amount: '33.00',
      delivery_fees: '0.00',
      transaction_type: 'CASHIN',
      processor_name: 'BRTBusStation',
      customer_name: 'Pax One',
      customer_email: 'pax1@brt.test',
      customer_phone: '',
      merchant_callback_url: request.webhookUrl,
      callback_url: request.returnUrl,
      ip_address: '203.0.113.9',
      expiry_date: '2026-10-16 16:15:00', // Manila time
    });
    expect(JSON.parse(String(token.details))).toEqual([{ payment: [{ name: 'Bus ticket S3 to S12', price: 33, quantity: 1 }], name: null }]);
  });

  it('signs the transaction request with PisoPay\'s hd / hd2 pair', async () => {
    const calls: { path: string; method: string; body: Record<string, unknown> | null }[] = [];
    await make(happy(calls), { now: () => 1_800_000_000_000 }).createCheckout(request);
    const txn = calls[2]!.body!;
    const trace = traceNoFor(request.paymentId);
    const hd = createHash('sha256').update(`1800000000${trace}QR1`).digest('hex');
    expect(txn).toMatchObject({ merchant_trace_no: trace, payment_channel_code: 'QR1', ip_address: '203.0.113.9', t: '1800000000', sms: 'OFF', hd });
    expect(txn.hd2).toBe(createHmac('sha256', '1800000000').update(`${hd.slice(-30)}${trace}`).digest('hex'));
  });

  it('every call carries the merchant credentials as Basic auth', async () => {
    const seen: string[] = [];
    await make((path, init) => {
      seen.push((init.headers as Record<string, string>).Authorization!);
      return happy()(path, init);
    }).createCheckout(request);
    expect(seen).toHaveLength(3);
    for (const header of seen) expect(header).toBe(`Basic ${Buffer.from(`${USER}:${PASS}`).toString('base64')}`);
  });

  it('the trace number is 17 characters (PisoPay allows 20) and stable for a payment', () => {
    expect(traceNoFor(request.paymentId)).toBe('BRT0123456789ABCD'.slice(0, 17));
    expect(traceNoFor(request.paymentId)).toHaveLength(17);
  });

  it('formats the expiry as Manila wall-clock time', () => {
    expect(formatExpiry(new Date('2026-10-16T16:30:05Z'))).toBe('2026-10-17 00:30:05');
    expect(formatExpiry(new Date('2026-10-16T00:00:00Z'))).toBe('2026-10-16 08:00:00');
  });
});

describe('PisoPay: choosing a QR channel', () => {
  /** QR1 is down; the others work. */
  const channelDown = (...down: string[]): Handler => (path, init) => {
    if (path === '/api/v1/transaction' && down.includes(JSON.parse(String(init.body)).payment_channel_code)) return refused('Channel not available');
    return happy()(path, init);
  };
  const channelsTried = (log: string[]): Handler => (path, init) => {
    if (path === '/api/v1/transaction') log.push(JSON.parse(String(init.body)).payment_channel_code);
    return channelDown('QR1')(path, init);
  };

  it('falls back to QR2 when QR1 is not available, then QR3', async () => {
    const tried: string[] = [];
    expect((await make(channelsTried(tried)).createCheckout(request)).qr?.channelCode).toBe('QR2');
    expect(tried).toEqual(['QR1', 'QR2']);

    resetChannelHealth();
    const both: string[] = [];
    const handler: Handler = (path, init) => {
      if (path === '/api/v1/transaction') both.push(JSON.parse(String(init.body)).payment_channel_code);
      return channelDown('QR1', 'QR2')(path, init);
    };
    expect((await make(handler).createCheckout(request)).qr?.channelCode).toBe('QR3');
    expect(both).toEqual(['QR1', 'QR2', 'QR3']);
  });

  it('treats a "success" with no QR as an unusable channel', async () => {
    const handler: Handler = (path, init) => {
      if (path === '/api/v1/transaction' && JSON.parse(String(init.body)).payment_channel_code === 'QR1') return ok({ referenceNo: 'R1', channelCode: 'QR1' });
      return happy()(path, init);
    };
    expect((await make(handler).createCheckout(request)).qr?.channelCode).toBe('QR2');
  });

  it('a channel that just failed is tried last for a while, so a down channel does not slow every checkout', async () => {
    let clock = 1_000_000;
    const log: string[] = [];
    const provider = make(channelsTried(log), { now: () => clock });
    await provider.createCheckout(request); // QR1 fails, QR2 works
    log.length = 0;
    await provider.createCheckout(request);
    expect(log).toEqual(['QR2']); // QR2 first now, and it works: QR1 is not retried

    clock += 6 * 60_000; // the cooldown is over
    log.length = 0;
    await provider.createCheckout(request);
    expect(log).toEqual(['QR1', 'QR2']); // QR1 gets another chance (and fails again)
  });

  it('fails clearly when every channel refuses', async () => {
    const error = await make(channelDown('QR1', 'QR2', 'QR3')).createCheckout(request).catch((e) => e as Error);
    expect(error).toMatchObject({ statusCode: 502, code: 'PAYMENT_PROVIDER_ERROR' });
    expect((error as Error).message).toContain('Channel not available');
  });

  it('only uses the channels it is configured for', async () => {
    const tried: string[] = [];
    const handler: Handler = (path, init) => {
      if (path === '/api/v1/transaction') tried.push(JSON.parse(String(init.body)).payment_channel_code);
      return happy()(path, init);
    };
    await make(handler, { channels: ['QR2'] }).createCheckout(request);
    expect(tried).toEqual(['QR2']);
  });

  it('does not burn through the channels when PisoPay itself is unreachable', async () => {
    let transactions = 0;
    const provider = new PisoPayPaymentProvider({
      baseUrl: 'https://x.test',
      username: USER,
      password: PASS,
      processorName: 'p',
      fetchFn: async (url) => {
        const path = new URL(url).pathname;
        if (path === '/api/v1/transaction') {
          transactions++;
          throw new Error('ECONNRESET');
        }
        return happy()(path, { method: 'GET' });
      },
    });
    await expect(provider.createCheckout(request)).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_UNREACHABLE' });
    expect(transactions).toBe(1);
  });
});

describe('PisoPay: refusals before the QR step', () => {
  it('passes on PisoPay\'s reason, without leaking the credentials', async () => {
    const error = await make(() => new Response(JSON.stringify({ status: 5, message: 'Invalid credentials' }), { status: 401 })).createCheckout(request).catch((e) => e as Error);
    expect(error).toMatchObject({ statusCode: 502, code: 'PAYMENT_PROVIDER_ERROR' });
    expect((error as Error).message).toContain('Invalid credentials');
    expect(JSON.stringify(error)).not.toContain(PASS);
  });

  it('a non-zero PisoPay status is a refusal even on HTTP 200 (e.g. an amount below the minimum)', async () => {
    const handler: Handler = (path, init) => (path === '/api/v1/token' ? refused('Amount below minimum') : happy()(path, init));
    await expect(make(handler).createCheckout(request)).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_ERROR', message: expect.stringContaining('Amount below minimum') });
  });

  it('fails clearly when unreachable or when the session has no id', async () => {
    await expect(make(async () => Promise.reject(new Error('ECONNRESET'))).createCheckout(request)).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_UNREACHABLE' });
    await expect(make(() => ok({})).createCheckout(request)).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_ERROR' });
  });
});

describe('PisoPay: asking whether a payment was made', () => {
  const inquiry = (row: Record<string, unknown> | Record<string, unknown>[]): Handler => () => ok(row);

  it('asks by reference number, and reads status 0 as paid with the fare (amount minus fees) in centavos', async () => {
    const paths: string[] = [];
    const provider = make((path) => {
      paths.push(path);
      return ok({ status: 0, reference_no: 'REF-QR1', merchant_trace_no: 'BRT0123456789ABC', amount: '35.00', fees: '2.00', payment_channel_code: 'QR1' });
    });
    const result = await provider.inquire({ providerRef: 'BRT0123456789ABC', referenceNo: 'REF-QR1' });
    expect(paths).toEqual(['/api/v1/transaction/reference/REF-QR1']);
    expect(result.state).toBe('paid');
    expect(result.event).toEqual({ eventId: 'BRT0123456789ABC:0:REF-QR1', kind: 'succeeded', providerRef: 'BRT0123456789ABC', amountCentavos: 3300, method: 'pisopay_qr1' });
  });

  it('uses the SAME event id as the webhook for the same payment, so whichever arrives second is a duplicate', async () => {
    const result = await make(inquiry({ status: 0, reference_no: 'REF-1', amount: '33.00', fees: '0.00' })).inquire({ providerRef: 'BRT0123456789ABC', referenceNo: 'REF-1' });
    expect(result.event?.eventId).toBe(make().parseEvent(webhook())!.eventId);
    expect(result.event?.eventId).toBe(eventIdFor('BRT0123456789ABC', '0', 'REF-1'));
  });

  it('reads pending, cancelled and failed / expired', async () => {
    const ask = (status: number) => make(inquiry({ status, reference_no: 'R', amount: '33.00', fees: '0.00' })).inquire({ providerRef: 'T', referenceNo: 'R' });
    expect((await ask(1)).state).toBe('pending');
    expect((await ask(1)).event).toBeNull();
    expect((await ask(2)).state).toBe('cancelled');
    expect((await ask(3)).state).toBe('failed');
    expect((await ask(3)).event).toMatchObject({ kind: 'failed', amountCentavos: null });
  });

  it('falls back to the trace number when there is no reference, and a paid row among several wins', async () => {
    const paths: string[] = [];
    const provider = make((path) => {
      paths.push(path);
      return ok([
        { status: 3, reference_no: 'OLD', amount: '33.00', fees: '0.00' },
        { status: 0, reference_no: 'NEW', amount: '33.00', fees: '0.00' },
      ]);
    });
    const result = await provider.inquire({ providerRef: 'BRT0123456789ABC', referenceNo: null });
    expect(paths).toEqual(['/api/v1/transaction/trace/BRT0123456789ABC']);
    expect(result.state).toBe('paid');
    expect(result.event?.eventId).toBe('BRT0123456789ABC:0:NEW');
  });

  it('says pending when PisoPay has no transaction yet, and throws when PisoPay refuses', async () => {
    expect((await make(inquiry([])).inquire({ providerRef: 'T', referenceNo: null })).state).toBe('pending');
    await expect(make(() => refused('Not found')).inquire({ providerRef: 'T', referenceNo: 'R' })).rejects.toMatchObject({ code: 'PAYMENT_PROVIDER_ERROR' });
  });

  it('has no fare when the amount is missing, and ignores nonsense fees', async () => {
    expect((await make(inquiry({ status: 0, reference_no: 'R' })).inquire({ providerRef: 'T', referenceNo: 'R' })).event?.amountCentavos).toBeNull();
    // Fees larger than the amount (or negative) would make the fare look bigger or negative: they are ignored.
    expect((await make(inquiry({ status: 0, reference_no: 'R', amount: '33.00', fees: '-5.00' })).inquire({ providerRef: 'T', referenceNo: 'R' })).event?.amountCentavos).toBe(3300);
    expect((await make(inquiry({ status: 0, reference_no: 'R', amount: '33.00', fees: '99.00' })).inquire({ providerRef: 'T', referenceNo: 'R' })).event?.amountCentavos).toBe(3300);
  });
});

describe('PisoPay: webhook signature (PAY-03)', () => {
  it('accepts a payment notice signed with the merchant credentials (wrapped in `data`, or flat)', () => {
    expect(make().verifyWebhook(webhook())).toBe(true);
    expect(make().verifyWebhook(webhook({}, false))).toBe(true);
  });

  it('uses the longer message (with the status) for a non-success status', () => {
    expect(make().verifyWebhook(webhook({ status: '2' }))).toBe(true);
    const wrong = hdFor({ timestamp: '1800000000', traceNo: 'BRT0123456789ABC', amount: '33.00', status: '0' });
    expect(make().verifyWebhook(webhook({ status: '2', hd: wrong }))).toBe(false);
  });

  it('refuses a notice signed with other credentials, or with no / broken signature or fields', () => {
    const other = createHmac('sha256', '1800000000').update('x').digest('hex');
    expect(make().verifyWebhook(webhook({ hd: other }))).toBe(false);
    expect(make().verifyWebhook(webhook({ hd: 'short' }))).toBe(false);
    for (const missing of ['hd', 'timestamp', 'traceNo', 'amount', 'status']) {
      const body = JSON.parse(webhook());
      delete body.data[missing];
      expect(make().verifyWebhook(JSON.stringify(body)), missing).toBe(false);
    }
    for (const bad of ['', 'not json', '[]', '"x"', '{}', '{"data":{}}']) expect(make().verifyWebhook(bad), bad).toBe(false);
  });

  it('refuses a notice changed after signing: a different amount, trace number, status or timestamp', () => {
    const good = JSON.parse(webhook());
    for (const [field, value] of [['amount', '1.00'], ['traceNo', 'BRTFFFFFFFFFFFFF'], ['status', '1'], ['timestamp', '1800000001']] as const) {
      const tampered = { ...good, data: { ...good.data, [field]: value } };
      expect(make().verifyWebhook(JSON.stringify(tampered)), field).toBe(false);
    }
  });

  it('the signature is tied to the credentials: a provider with a different password refuses it', () => {
    const other = new PisoPayPaymentProvider({ baseUrl: 'https://x.test', username: USER, password: 'different', processorName: 'p' });
    expect(other.verifyWebhook(webhook())).toBe(false);
  });

  it('accepts amounts as numbers too (the signature uses the number as PHP would print it)', () => {
    expect(make().verifyWebhook(webhook({ amount: 33 }))).toBe(true);
    expect(make().verifyWebhook(webhook({ amount: 33.5 }))).toBe(true);
  });
});

describe('PisoPay: reading webhook events', () => {
  it('turns status 0 into a success with our trace number, the amount paid in centavos and the channel', () => {
    expect(make().parseEvent(webhook())).toEqual({ eventId: 'BRT0123456789ABC:0:REF-1', kind: 'succeeded', providerRef: 'BRT0123456789ABC', amountCentavos: 3300, method: 'pisopay_qr1' });
  });

  it('reports the amount actually paid, less any fees', () => {
    expect(make().parseEvent(webhook({ amount: '0.99' }))?.amountCentavos).toBe(99);
    expect(make().parseEvent(webhook({ amount: '1234.5' }))?.amountCentavos).toBe(123450);
    expect(make().parseEvent(webhook({ amount: 'abc' }))?.amountCentavos).toBeNull();
    expect(make().parseEvent(webhook({ amount: '35.00', otherFeesTotal: '2.00' }))?.amountCentavos).toBe(3300);
    expect(make().parseEvent(webhook({ amount: '33.00', otherFeesTotal: '-9.00' }))?.amountCentavos).toBe(3300);
  });

  it('the same payment redelivered has the same event id; a different PisoPay reference does not', () => {
    const a = make().parseEvent(webhook())!;
    expect(make().parseEvent(webhook())!.eventId).toBe(a.eventId);
    expect(make().parseEvent(webhook({ referenceNo: 'REF-2' }))!.eventId).not.toBe(a.eventId);
  });

  it('ignores any status other than 0, and bad input', () => {
    for (const status of ['1', '2', '-1']) expect(make().parseEvent(webhook({ status }))).toBeNull();
    for (const bad of ['', 'not json', '[]', '{}', webhook({ traceNo: '' })]) expect(make().parseEvent(bad), bad).toBeNull();
  });
});

describe('vi sanity', () => {
  it('has fake timers available (the clock is injected, not global)', () => {
    expect(vi.isFakeTimers()).toBe(false);
  });
});
