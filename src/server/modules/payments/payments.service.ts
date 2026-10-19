/**
 * Payments: checkout, and the verified-webhook path that is the ONLY way a ticket becomes paid (PAY-03).
 *
 * Webhook rules, in one transaction per event:
 *   1. the signature over the raw body must verify (PAY-03), else 401 and nothing is read
 *   2. lock the payment row, so redeliveries of one event are handled one after another
 *   3. an event id already stored is a replay: acknowledge it and change nothing (PAY-04)
 *   4. the amount must equal the ticket's fare (PAY-06); money that cannot be applied is kept and flagged for an
 *      admin (PAY-07) instead of being lost or silently applied
 *   5. record the event with what was done (insert-only evidence)
 */
import { createHash } from 'node:crypto';
import { env } from '@config/env';
import { getDb, transaction, type SQLExecutor } from '@core/database';
import {
  getMockProvider,
  getPaymentProvider,
  isMockEnabled,
  MOCK_METHODS,
  MOCK_SIGNATURE_HEADER,
  type HeaderReader,
  type MockMethod,
  type PaymentEvent,
  type PaymentProviderName,
} from '@integrations/payment';
import { ApiError } from '@lib/response';
import { clampPage, offsetOf } from '@shared/pagination';
import { qrPhPng } from '@lib/qrph-image';
import { authRepository } from '@modules/auth/auth.repository';
import { ticketMail } from '@modules/notifications/ticket-mail';
import { ticketsRepository } from '@modules/tickets/tickets.repository';
import type { TicketRow } from '@modules/tickets/tickets.types';
import { TICKET_STATUS_LABEL } from '@shared/tickets/status';
import { paymentsRepository } from './payments.repository';
import type { CheckoutView, PaymentRow, PaymentStatusView, WebhookOutcome } from './payments.types';

const KNOWN_PROVIDERS: readonly PaymentProviderName[] = ['mock', 'pisopay'];

const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');

function toCheckoutView(payment: PaymentRow): CheckoutView {
  return {
    paymentId: payment.id,
    ticketId: payment.ticket_id,
    provider: payment.provider,
    amountCentavos: payment.amount_centavos,
    checkoutUrl: payment.checkout_url,
    hasQr: payment.qr_payload !== null,
  };
}

/** How often one payment may be checked with the provider while a passenger waits (their page asks every few seconds). */
const INQUIRY_MIN_GAP_MS = 2500;
const lastInquiry = new Map<string, number>();

export const paymentsService = {
  /**
   * Start paying for the passenger's own `pending_payment` ticket (PAY-02). Clicking "pay" twice returns the same open
   * checkout instead of making a second one. The ticket row is locked so two clicks cannot race.
   */
  async createCheckout(ticketId: string, passengerId: string, clientIp = ''): Promise<CheckoutView> {
    return transaction(async (tx) => {
      const ticket = await ticketsRepository.findById(tx, ticketId, { forUpdate: true });
      if (!ticket || ticket.passenger_id !== passengerId) throw ApiError.notFound('Ticket not found');
      if (ticket.status !== 'pending_payment') {
        throw ApiError.conflict(`This ticket is ${TICKET_STATUS_LABEL[ticket.status].toLowerCase()} and cannot be paid`);
      }
      if (ticket.created_at.getTime() + env.tickets.pendingTtlMinutes * 60_000 <= Date.now()) {
        throw ApiError.conflict('This ticket was not paid in time and has expired. Please create a new one.');
      }

      const open = await paymentsRepository.findPendingForTicket(tx, ticket.id);
      if (open) return toCheckoutView(open);

      const provider = getPaymentProvider();
      const paymentId = crypto.randomUUID();
      const passenger = await authRepository.findById(tx, passengerId);
      if (!passenger) throw ApiError.notFound('Ticket not found');
      const session = await provider.createCheckout({
        paymentId,
        ticketId: ticket.id,
        referenceCode: ticket.reference_code,
        amountCentavos: ticket.fare_centavos,
        description: `Bus ticket ${ticket.origin_name} to ${ticket.destination_name}${ticket.quantity > 1 ? ` (${ticket.quantity} passengers)` : ''}`,
        // A hosted provider sends the passenger back to the ticket page, which only READS the ticket (it never marks paid);
        // the result itself arrives at the webhook.
        // The page that shows this payment: for QR Ph, the QR itself is on the ticket page.
        checkoutPath: `/tickets/${ticket.id}`,
        returnUrl: `${env.baseUrl}/tickets/${ticket.id}?return=1`,
        webhookUrl: `${env.baseUrl}/api/payments/webhook/${provider.name}`,
        expiresAt: new Date(ticket.created_at.getTime() + env.tickets.pendingTtlMinutes * 60_000),
        // Passengers have no phone number on file.
        customer: { name: passenger.full_name, email: passenger.email, phone: null },
        clientIp,
      });
      const payment = await paymentsRepository.insert(tx, {
        id: paymentId,
        ticketId: ticket.id,
        provider: provider.name,
        providerRef: session.providerRef,
        // The amount is the ticket's frozen fare, never anything the client sent.
        amountCentavos: ticket.fare_centavos,
        checkoutUrl: session.checkoutUrl,
        qr: session.qr,
      });
      return toCheckoutView(payment);
    });
  },

  /**
   * Where a ticket's payment stands, for the page showing its QR. While the payment is open this also ASKS the provider
   * (server to server, at most every couple of seconds) so the ticket turns paid even if the webhook is slow or cannot
   * reach us. What it learns goes through the same `settleEvent` as a webhook, so the rules are identical.
   */
  async paymentStatus(ticketId: string, passengerId: string): Promise<PaymentStatusView> {
    const ticket = await ticketsRepository.findById(getDb(), ticketId);
    if (!ticket || ticket.passenger_id !== passengerId) throw ApiError.notFound('Ticket not found');

    // The 15-minute window is enforced here too, not only by the expiry worker: a passenger who is still watching the QR
    // when it runs out must see the ticket as expired even if the worker is slow or not running.
    if (ticket.status === 'pending_payment' && ticket.created_at.getTime() + env.tickets.pendingTtlMinutes * 60_000 <= Date.now()) {
      await transaction(async (tx) => {
        const expired = await ticketsRepository.expireStalePending(tx, env.tickets.pendingTtlMinutes);
        await paymentsRepository.cancelPendingForTickets(tx, expired);
      });
      ticket.status = 'expired';
    }

    let payment = await paymentsRepository.findLatestForTicket(getDb(), ticketId);
    if (payment && payment.status === 'pending' && ticket.status === 'pending_payment') {
      await checkWithProvider(payment);
      payment = await paymentsRepository.findLatestForTicket(getDb(), ticketId);
    }
    const current = (await ticketsRepository.findById(getDb(), ticketId))!;
    return {
      ticketStatus: current.status,
      paymentStatus: payment?.status ?? null,
      provider: payment?.provider ?? null,
      amountCentavos: payment?.amount_centavos ?? null,
      channelCode: payment?.channel_code ?? null,
      referenceNo: payment?.provider_reference_no ?? null,
      hasQr: payment?.qr_payload != null,
    };
  },

  /** The QR Ph picture (with the logo) for the passenger's own open payment. Only while it can still be paid. */
  async paymentQr(ticketId: string, passengerId: string): Promise<Buffer> {
    const ticket = await ticketsRepository.findById(getDb(), ticketId);
    if (!ticket || ticket.passenger_id !== passengerId) throw ApiError.notFound('Ticket not found');
    const payment = await paymentsRepository.findPendingForTicket(getDb(), ticketId);
    const windowOver = ticket.created_at.getTime() + env.tickets.pendingTtlMinutes * 60_000 <= Date.now();
    if (ticket.status !== 'pending_payment' || windowOver || !payment?.qr_payload) throw ApiError.conflict('There is no QR code to pay with for this ticket right now');
    return qrPhPng(payment.qr_payload);
  },

  /** A provider calls this. `rawBody` must be the exact bytes received: the signature covers them. */
  async processWebhook(providerName: string, rawBody: string, headers: HeaderReader): Promise<{ outcome: WebhookOutcome }> {
    const name = KNOWN_PROVIDERS.find((p) => p === providerName);
    // Only the configured provider is live; a delivery for any other is simply unknown.
    if (!name || name !== env.payment.provider) throw ApiError.notFound('Unknown payment provider');
    const provider = getPaymentProvider(name);

    if (!provider.verifyWebhook(rawBody, headers)) throw new ApiError(401, 'INVALID_SIGNATURE', 'The webhook signature is not valid');
    const event = provider.parseEvent(rawBody);
    if (!event) return { outcome: 'ignored' };

    return settleEvent(provider.name, event, sha256(rawBody));
  },

  // ── Mock gateway (PAY-08): the demo payment page ───────────────────────────────────────────────────────────────

  /** What the demo payment page shows. The session id is long and random, so it works as the page's only secret. */
  async getMockSession(providerRef: string) {
    const { payment, ticket } = await loadMockSession(providerRef);
    return {
      providerRef,
      payable: payment.status === 'pending' && ticket.status === 'pending_payment',
      paymentStatus: payment.status,
      ticketStatus: ticket.status,
      amountCentavos: payment.amount_centavos,
      referenceCode: ticket.reference_code,
      originName: ticket.origin_name,
      destinationName: ticket.destination_name,
      returnPath: `/tickets/${ticket.id}?return=1`,
      methods: [...MOCK_METHODS],
    };
  },

  /**
   * The Pay / Fail buttons. They do not touch the ticket: they build an event, SIGN it, and send it through the same
   * webhook path a real provider uses, so signature checking, idempotency and the amount check all run.
   */
  async completeMockSession(providerRef: string, outcome: 'paid' | 'failed', method: MockMethod) {
    const { payment, ticket } = await loadMockSession(providerRef);
    if (payment.status !== 'pending') throw ApiError.conflict('This payment session is already closed');
    if (ticket.status !== 'pending_payment') {
      throw ApiError.conflict(`This ticket is ${TICKET_STATUS_LABEL[ticket.status].toLowerCase()} and can no longer be paid`);
    }

    const provider = getMockProvider();
    const body = provider.buildEvent({
      providerRef,
      kind: outcome === 'paid' ? 'succeeded' : 'failed',
      amountCentavos: payment.amount_centavos,
      method,
    });
    const signature = provider.signBody(body);
    const headers: HeaderReader = { get: (header) => (header.toLowerCase() === MOCK_SIGNATURE_HEADER ? signature : null) };
    const result = await paymentsService.processWebhook('mock', body, headers);
    // Success returns to the page that waits for confirmation; failure returns to the ticket with a plain message.
    return { outcome: result.outcome, returnPath: `/tickets/${ticket.id}?${outcome === 'paid' ? 'return=1' : 'failed=1'}` };
  },

  // ── Admin ────────────────────────────────────────────────────────────────────────────────────────────────────

  async listForAdmin(opts: { needsReviewOnly: boolean; page: number; pageSize: number }, db: SQLExecutor = getDb()) {
    const total = await paymentsRepository.countForAdmin(db, opts);
    const page = clampPage(opts.page, total, opts.pageSize);
    const rows = await paymentsRepository.listForAdmin(db, { needsReviewOnly: opts.needsReviewOnly, limit: opts.pageSize, offset: offsetOf(page, opts.pageSize) });
    return { rows, total, page, pageSize: opts.pageSize };
  },
};

/**
 * Apply one provider event (from a webhook, or from asking the provider) to its payment and ticket, exactly once.
 * Everything the webhook has always guaranteed lives here, so both ways in share it: the ticket row is locked before its
 * payment, a repeated event id changes nothing, and the amount must equal the ticket's fare.
 */
async function settleEvent(providerName: PaymentProviderName, event: PaymentEvent, payloadHash: string): Promise<{ outcome: WebhookOutcome }> {
  const base = { provider: providerName, eventId: event.eventId, eventType: event.kind, payloadHash };
  let paidTicketId: string | null = null;

  const result = await transaction(async (tx) => {
    // Find which ticket this is about without locking anything yet.
    const found = await paymentsRepository.findByProviderRef(tx, providerName, event.providerRef);
    if (!found) {
      await paymentsRepository.insertEvent(tx, { ...base, paymentId: null, outcome: 'unknown_payment' });
      return { outcome: 'unknown_payment' as const };
    }

    // LOCK ORDER: the ticket first, then its payment, everywhere (cancel, checkout, the expiry worker and here). Taking
    // them in the opposite order here once deadlocked against the expiry worker, which also locks the ticket first.
    const ticket = (await ticketsRepository.findById(tx, found.ticket_id, { forUpdate: true }))!;
    // Re-read the payment under its lock: it may have changed while we waited for the ticket.
    const payment = (await paymentsRepository.findByProviderRef(tx, providerName, event.providerRef, { forUpdate: true }))!;

    // A redelivery (providers retry), or the same notice arriving by webhook AND by status check: already handled.
    if (await paymentsRepository.eventExists(tx, providerName, event.eventId)) return { outcome: 'duplicate' as const };

    const outcome = event.kind === 'failed' ? await applyFailure(tx, payment, event) : await applySuccess(tx, payment, ticket, event);

    // Insert-only evidence. If two copies somehow got past the lock, the unique (provider, event_id) refuses the second.
    await paymentsRepository.insertEvent(tx, { ...base, paymentId: payment.id, outcome });
    if (outcome === 'applied') paidTicketId = ticket.id;
    return { outcome };
  });

  // The payment is confirmed and committed. Only now is the ticket emailed, in the background: a mail problem can never touch it.
  if (paidTicketId) void ticketMail.sendPaidTicket(paidTicketId);
  return result;
}

/** Ask the provider about an open payment and apply the answer. Errors and rate limits are swallowed: the next poll retries. */
async function checkWithProvider(payment: PaymentRow): Promise<void> {
  if (payment.provider !== env.payment.provider) return;
  const provider = getPaymentProvider(payment.provider);
  if (!provider.inquire) return;
  const last = lastInquiry.get(payment.id) ?? 0;
  if (Date.now() - last < INQUIRY_MIN_GAP_MS) return;
  lastInquiry.set(payment.id, Date.now());
  try {
    const result = await provider.inquire({ providerRef: payment.provider_ref, referenceNo: payment.provider_reference_no });
    if (result.event) await settleEvent(provider.name, result.event, sha256(result.evidence));
  } catch {
    // PisoPay unreachable or refused: nothing to apply. The webhook may still arrive, and the page asks again shortly.
  }
}

async function loadMockSession(providerRef: string): Promise<{ payment: PaymentRow; ticket: TicketRow }> {
  if (!isMockEnabled()) throw ApiError.notFound('Not found');
  const db = getDb();
  const payment = await paymentsRepository.findByProviderRef(db, 'mock', providerRef);
  if (!payment) throw ApiError.notFound('Payment session not found');
  const ticket = (await ticketsRepository.findById(db, payment.ticket_id))!;
  return { payment, ticket };
}

/** The provider reports a failed attempt. The ticket is untouched: it can still be paid until it expires. */
async function applyFailure(tx: SQLExecutor, payment: PaymentRow, event: PaymentEvent): Promise<WebhookOutcome> {
  const moved = await paymentsRepository.setStatus(tx, payment.id, ['pending'], 'failed', { method: event.method });
  return moved ? 'payment_failed' : 'already_settled';
}

/** The provider reports money received. Decides whether it pays the ticket or has to be flagged for an admin. */
async function applySuccess(tx: SQLExecutor, payment: PaymentRow, ticket: TicketRow, event: PaymentEvent): Promise<WebhookOutcome> {
  if (payment.status === 'succeeded' || payment.status === 'needs_review') return 'already_settled';

  // The app closed this checkout (ticket cancelled or expired) but the customer paid anyway: keep the evidence, flag it.
  if (payment.status === 'cancelled') {
    await paymentsRepository.setStatus(tx, payment.id, ['cancelled'], 'needs_review', { reviewReason: 'paid_after_close', method: event.method });
    return 'paid_after_close';
  }

  // PAY-06: what was paid must be exactly the ticket's fare. A missing amount cannot be verified, so it is flagged too.
  if (event.amountCentavos === null || event.amountCentavos !== ticket.fare_centavos || payment.amount_centavos !== ticket.fare_centavos) {
    await paymentsRepository.setStatus(tx, payment.id, ['pending', 'failed'], 'needs_review', { reviewReason: 'amount_mismatch', method: event.method });
    return 'amount_mismatch';
  }

  // The single place a ticket becomes paid: conditional on it still awaiting payment.
  if (await ticketsRepository.markPaid(tx, ticket.id)) {
    await paymentsRepository.setStatus(tx, payment.id, ['pending', 'failed'], 'succeeded', { method: event.method });
    return 'applied';
  }

  // PAY-07: money for a ticket that is cancelled, expired or already paid.
  await paymentsRepository.setStatus(tx, payment.id, ['pending', 'failed'], 'needs_review', { reviewReason: `ticket_${ticket.status}`, method: event.method });
  return 'ticket_not_payable';
}
