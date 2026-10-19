/**
 * PisoPay adapter (PAY-01, P8), QR Ph. Follows PisoPay's "embedded" flow (the same calls the e-Notary system's
 * `PisoPayService.php` makes), so the QR is shown inside this app instead of sending the passenger to PisoPay's page:
 *
 *   checkout   GET  /api/v1/session       -> session_id
 *              POST /api/v1/token         -> registers the payment (amount, trace number, customer, callback URLs)
 *              POST /api/v1/transaction   -> for a QR channel (QR1 / QR2 / QR3) returns `referenceNo` and `qr`, the EMV
 *                                            QR Ph string that already carries the amount
 *              HTTP Basic auth (merchant API username / password) on every call.
 *   channels   QR1 is tried first; if PisoPay refuses it (channel not active, down) the next one (QR2, then QR3) is tried.
 *              A channel that just failed is tried last for a few minutes, so a down channel does not slow every checkout.
 *   status     GET /api/v1/transaction/reference/{referenceNo}: transaction status 0 paid, 1 pending, 2 cancelled, 3 failed
 *              or expired. The app asks while the passenger waits, and PisoPay also calls the webhook.
 *   webhook    PisoPay POSTs the result with an `hd` signature (per PisoPay's docs, as implemented in e-Notary):
 *                auth = first 10 chars of sha256("<username>:<password>" + timestamp)
 *                hd   = HMAC-SHA256(key = timestamp, message = auth + traceNo + amount)                for status 0 (paid)
 *                       HMAC-SHA256(key = timestamp, message = auth + traceNo + status + amount)       otherwise
 *
 * A provider never marks anything paid: it proves an event is genuine (signature) or reports what PisoPay says over its
 * own authenticated API. The payments service still checks the amount against the ticket's frozen fare, and the webhook
 * and the status check produce the SAME event id for one payment, so whichever arrives second is a harmless duplicate.
 *
 * Deliberate differences from the PHP version: TLS certificates are verified, and request / response bodies (which carry
 * the passenger's name and email) are never logged or stored.
 */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { ApiError } from '@lib/response';
import { MANILA_TZ } from '@shared/datetime/ph-time';
import type { CheckoutRequest, CheckoutSession, InquiryResult, PaymentEvent, PaymentProvider } from './payment-provider';

const REQUEST_TIMEOUT_MS = 30_000;
/** How long a channel that just failed is tried last. */
const CHANNEL_COOLDOWN_MS = 5 * 60_000;

type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type PisoPayOptions = {
  baseUrl: string;
  username: string;
  password: string;
  /** The `processor_name` PisoPay has registered for this merchant (e-Notary uses "eNotary"). */
  processorName: string;
  /** QR channels in order of preference. Default QR1, QR2, QR3. */
  channels?: readonly string[];
  fetchFn?: FetchLike;
  now?: () => number;
};

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : typeof v === 'number' ? String(v) : null);
const num = (v: unknown): number | null => {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** `merchant_trace_no`: "BRT" + 14 hex characters of the payment id = 17 characters, within PisoPay's 20-character limit. */
export const traceNoFor = (paymentId: string) => `BRT${paymentId.replace(/-/g, '').slice(0, 14).toUpperCase()}`;

/** PisoPay's expiry format, `YYYY-MM-DD HH:mm:ss`, in Manila time. */
export function formatExpiry(at: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: MANILA_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/** Pesos on the wire to whole centavos. */
const toCentavos = (pesos: number) => Math.round(pesos * 100);

/** The event id for one payment notice. The webhook and the status check both use this, so they dedupe against each other. */
export const eventIdFor = (traceNo: string, status: string, referenceNo: string | null) => `${traceNo}:${status}:${referenceNo ?? ''}`.slice(0, 100);

/** Channels that failed recently, shared by every provider instance in the process. */
const failedChannels = new Map<string, number>();
/** Test hook: forget which channels failed. */
export const resetChannelHealth = () => failedChannels.clear();

export class PisoPayPaymentProvider implements PaymentProvider {
  readonly name = 'pisopay' as const;
  private readonly fetchFn: FetchLike;
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly channels: readonly string[];
  private readonly now: () => number;

  constructor(private readonly options: PisoPayOptions) {
    this.fetchFn = options.fetchFn ?? ((url, init) => fetch(url, init));
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.authHeader = `Basic ${Buffer.from(`${options.username}:${options.password}`).toString('base64')}`;
    this.channels = options.channels && options.channels.length > 0 ? options.channels : ['QR1', 'QR2', 'QR3'];
    this.now = options.now ?? (() => Date.now());
  }

  /** One call to PisoPay. Returns PisoPay's JSON body, or throws an `ApiError` the passenger can be shown. */
  private async call(method: 'GET' | 'POST', path: string, body?: unknown): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: this.authHeader, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      throw new ApiError(502, 'PAYMENT_PROVIDER_UNREACHABLE', 'The payment provider could not be reached. Please try again.');
    }
    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      // handled below
    }
    const record = isRecord(json) ? json : null;
    // PisoPay answers {status: 0, message, data: {...}} on success; `message` explains a refusal.
    if (!res.ok || !record || String(record.status ?? '-1') !== '0') {
      const message = record ? str(record.message) : null;
      throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', message ? `The payment provider refused the request: ${message}` : 'The payment provider could not complete the request.');
    }
    return record;
  }

  /** Channels in the order to try: configured order, but any that failed in the last few minutes go last. */
  private channelOrder(): string[] {
    const now = this.now();
    const healthy = this.channels.filter((c) => now - (failedChannels.get(c) ?? -Infinity) >= CHANNEL_COOLDOWN_MS);
    const recentlyFailed = this.channels.filter((c) => !healthy.includes(c));
    return [...healthy, ...recentlyFailed];
  }

  /** Ask PisoPay for a reference number and QR on one channel. */
  private async transaction(traceNo: string, channel: string, clientIp: string): Promise<{ referenceNo: string; qr: string }> {
    // hd = sha256(t + trace + channel); hd2 = hmac_sha256(last 30 chars of hd + trace, key = t)  (PisoPay's anti-tamper pair)
    const t = String(Math.floor(this.now() / 1000));
    const hd = createHash('sha256').update(`${t}${traceNo}${channel}`).digest('hex');
    const hd2 = createHmac('sha256', t).update(`${hd.slice(-30)}${traceNo}`).digest('hex');
    const response = await this.call('POST', '/api/v1/transaction', { merchant_trace_no: traceNo, payment_channel_code: channel, ip_address: clientIp || '127.0.0.1', t, sms: 'OFF', hd, hd2 });
    const data = isRecord(response.data) ? response.data : response;
    const referenceNo = str(data.referenceNo);
    const qr = str(data.qr);
    // A channel that answers "success" without a QR cannot be used for this.
    if (!referenceNo || !qr || !qr.startsWith('0002')) throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', `Channel ${channel} did not return a QR Ph code.`);
    return { referenceNo, qr };
  }

  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    // Step 1: a session.
    const session = await this.call('GET', '/api/v1/session');
    const sessionData = isRecord(session.data) ? session.data : session;
    const sessionId = str(sessionData.session_id);
    if (!sessionId) throw new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'The payment provider answered in an unexpected way.');

    // Step 2: register the payment (a token).
    const traceNo = traceNoFor(request.paymentId);
    const amount = (request.amountCentavos / 100).toFixed(2);
    await this.call('POST', '/api/v1/token', {
      session_id: sessionId,
      merchant_trace_no: traceNo,
      amount,
      delivery_fees: '0.00',
      transaction_type: 'CASHIN',
      processor_name: this.options.processorName,
      customer_name: request.customer.name,
      customer_email: request.customer.email,
      customer_phone: request.customer.phone ?? '',
      customer_address: 'PH',
      merchant_callback_url: request.webhookUrl,
      callback_url: request.returnUrl,
      ip_address: request.clientIp || '127.0.0.1',
      expiry_date: formatExpiry(request.expiresAt),
      // PisoPay wants this as a JSON string, as e-Notary sends it.
      details: JSON.stringify([{ payment: [{ name: request.description.slice(0, 120), price: Number(amount), quantity: 1 }], name: null }]),
    });

    // Step 3: the QR, on the best channel that works.
    let lastError: unknown = null;
    for (const channel of this.channelOrder()) {
      try {
        const { referenceNo, qr } = await this.transaction(traceNo, channel, request.clientIp);
        failedChannels.delete(channel);
        return { providerRef: traceNo, checkoutUrl: request.checkoutPath, qr: { payload: qr, referenceNo, channelCode: channel } };
      } catch (error) {
        lastError = error;
        // An unreachable PisoPay will not be any better on the next channel, and says nothing about this one.
        if (error instanceof ApiError && error.code === 'PAYMENT_PROVIDER_UNREACHABLE') throw error;
        failedChannels.set(channel, this.now());
      }
    }
    throw lastError instanceof ApiError ? lastError : new ApiError(502, 'PAYMENT_PROVIDER_ERROR', 'No QR Ph channel is available right now. Please try again.');
  }

  /** Ask PisoPay whether a payment was made (the status check by reference number, or by trace number as a fallback). */
  async inquire(payment: { providerRef: string; referenceNo: string | null }): Promise<InquiryResult> {
    const response = payment.referenceNo
      ? await this.call('GET', `/api/v1/transaction/reference/${encodeURIComponent(payment.referenceNo)}`)
      : await this.call('GET', `/api/v1/transaction/trace/${encodeURIComponent(payment.providerRef)}`);

    // By trace number PisoPay may return several transactions: a paid one wins, otherwise the first.
    const data = response.data;
    const rows = Array.isArray(data) ? data.filter(isRecord) : isRecord(data) ? [data] : [];
    const row = rows.find((r) => str(r.status) === '0') ?? rows[0];
    if (!row) return { state: 'pending', event: null, evidence: 'no transaction' };

    const status = str(row.status) ?? '-1';
    const referenceNo = str(row.reference_no) ?? payment.referenceNo;
    // `amount` is what was charged; `fees` is the part of it that is PisoPay's, not the fare.
    const charged = num(row.amount);
    const fees = num(row.fees) ?? 0;
    const principal = charged === null ? null : toCentavos(charged - (fees >= 0 && fees <= charged ? fees : 0));
    const channel = str(row.payment_channel_code);
    const method = (channel ? `pisopay_${channel}` : 'pisopay').toLowerCase().slice(0, 40);
    const evidence = `inquiry:${payment.providerRef}:${status}:${referenceNo ?? ''}`;

    if (status === '0') return { state: 'paid', event: { eventId: eventIdFor(payment.providerRef, '0', referenceNo), kind: 'succeeded', providerRef: payment.providerRef, amountCentavos: principal, method }, evidence };
    if (status === '2' || status === '3') {
      return { state: status === '2' ? 'cancelled' : 'failed', event: { eventId: eventIdFor(payment.providerRef, status, referenceNo), kind: 'failed', providerRef: payment.providerRef, amountCentavos: null, method }, evidence };
    }
    return { state: 'pending', event: null, evidence };
  }

  /** The fields PisoPay puts in the webhook, whether wrapped in `data` or flat. */
  private fields(rawBody: string): Record<string, unknown> | null {
    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return null;
    }
    if (!isRecord(json)) return null;
    return isRecord(json.data) ? json.data : json;
  }

  verifyWebhook(rawBody: string): boolean {
    const f = this.fields(rawBody);
    if (!f) return false;
    const hd = str(f.hd);
    const timestamp = str(f.timestamp);
    const traceNo = str(f.traceNo);
    const amount = str(f.amount);
    const status = str(f.status);
    if (!hd || !timestamp || !traceNo || !amount || status === null || !/^[0-9a-f]{64}$/i.test(hd)) return false;

    const auth = createHash('sha256').update(`${this.options.username}:${this.options.password}${timestamp}`).digest('hex').slice(0, 10);
    const message = status === '0' ? `${auth}${traceNo}${amount}` : `${auth}${traceNo}${status}${amount}`;
    const expected = createHmac('sha256', timestamp).update(message).digest();
    const actual = Buffer.from(hd, 'hex');
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }

  parseEvent(rawBody: string): PaymentEvent | null {
    const f = this.fields(rawBody);
    if (!f) return null;
    // Like e-Notary, only status 0 ("payment successful") is acted on. Any other status is acknowledged and ignored; the
    // status check picks up cancelled / failed payments.
    if (str(f.status) !== '0') return null;
    const traceNo = str(f.traceNo);
    if (!traceNo) return null;

    const charged = num(f.amount);
    const fees = num(f.otherFeesTotal) ?? 0;
    const amountCentavos = charged !== null && charged >= 0 ? toCentavos(charged - (fees >= 0 && fees <= charged ? fees : 0)) : null;
    const channel = str(f.paymentChannelCode);
    const referenceNo = str(f.referenceNo) ?? str(f.transactionId);
    return { eventId: eventIdFor(traceNo, '0', referenceNo), kind: 'succeeded', providerRef: traceNo, amountCentavos, method: (channel ? `pisopay_${channel}` : 'pisopay').toLowerCase().slice(0, 40) };
  }
}
