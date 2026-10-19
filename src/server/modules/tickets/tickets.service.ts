/** Ticket rules: server-side fare, per-passenger limits, ownership, cancel, expiry (TKT-01..08). */
import { env } from '@config/env';
import { getDb, transaction } from '@core/database';
import { ApiError } from '@lib/response';
import { generateReferenceCode } from '@lib/reference-code';
import { qrPng } from '@lib/qr-image';
import { signTicketToken } from '@lib/qr-token';
import { faresService } from '@modules/fares';
import { ticketMail } from '@modules/notifications/ticket-mail';
import { stationsRepository } from '@modules/stations/stations.repository';
import { headingToId } from '@shared/tracking/stations';
import { paymentsRepository } from '@modules/payments/payments.repository';
import { endOfManilaDay } from '@shared/datetime/ph-time';
import { MAX_PENDING_TICKETS_PER_PASSENGER, TICKET_STATUS_LABEL } from '@shared/tickets/status';
import { ticketsRepository } from './tickets.repository';
import type { TicketRow, TicketView } from './tickets.types';

export function toTicketView(row: TicketRow): TicketView {
  return {
    id: row.id,
    referenceCode: row.reference_code,
    originStationId: row.origin_station_id,
    originName: row.origin_name,
    destinationStationId: row.destination_station_id,
    destinationName: row.destination_name,
    fareCentavos: row.fare_centavos,
    quantity: row.quantity,
    status: row.status,
    validUntil: row.valid_until.toISOString(),
    paidAt: row.paid_at ? row.paid_at.toISOString() : null,
    usedAt: row.used_at ? row.used_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    busId: row.bus_id,
    busName: row.bus_name,
    payBeforeAt: row.status === 'pending_payment' ? new Date(row.created_at.getTime() + env.tickets.pendingTtlMinutes * 60_000).toISOString() : null,
  };
}

const MAX_CODE_ATTEMPTS = 6;
const EMAIL_MIN_GAP_MS = 60_000;
const lastEmailed = new Map<string, number>();
const isUniqueViolation = (err: unknown) => (err as { code?: string }).code === '23505';

export const ticketsService = {
  /**
   * Create a `pending_payment` ticket (TKT-01). The fare is computed here from the stations and frozen on the ticket
   * (FARE-04); the client never sends one. The passenger is whoever is signed in.
   */
  async create(input: { passengerId: string; originId: string; destinationId: string; quantity?: number }): Promise<TicketView> {
    const quantity = input.quantity ?? 1;
    // Validates both stations (exist, in service, different) and prices the trip.
    const quote = await faresService.quote(input.originId, input.destinationId);
    const db = getDb();

    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      try {
        const id = await ticketsRepository.insertPending(db, {
          referenceCode: generateReferenceCode(),
          passengerId: input.passengerId,
          originId: input.originId,
          destinationId: input.destinationId,
          // The total for everyone on the ticket: one fare per passenger, frozen now (FARE-04).
          fareCentavos: quote.fareCentavos * quantity,
          quantity,
          // Placeholder: the real validity is set when the payment lands, to the end of that day.
          validUntil: endOfManilaDay(new Date()),
          maxPending: MAX_PENDING_TICKETS_PER_PASSENGER,
        });
        if (id === null) {
          throw ApiError.conflict(`You already have ${MAX_PENDING_TICKETS_PER_PASSENGER} tickets waiting for payment. Pay for or cancel one first.`);
        }
        return toTicketView((await ticketsRepository.findById(db, id))!);
      } catch (err) {
        // The only unique column besides the id is the reference code: pick another and try again.
        if (isUniqueViolation(err)) continue;
        throw err;
      }
    }
    throw new Error('Could not generate a unique ticket reference');
  },

  /**
   * Buy a ticket on a bus that is waiting at a shelter. The ticket is for that bus: its shelter is where the passenger boards and
   * its destination is where the bus is headed (the one its konduktor announced, or the far end of the line), exactly as passengers
   * were shown. The bus's availability row is read under a shared lock, so its konduktor cannot change the destination or dispatch
   * between this check and the ticket existing.
   */
  async createForBus(input: { passengerId: string; busId: string; quantity?: number }): Promise<TicketView> {
    const quantity = input.quantity ?? 1;
    for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
      try {
        const id = await transaction(async (tx) => {
          const bus = await ticketsRepository.findBusForSale(tx, input.busId);
          if (!bus) throw ApiError.notFound('Bus not found');
          if (bus.status !== 'active' || !bus.has_konduktor) throw ApiError.conflict('This bus is not taking passengers right now');
          if (bus.av_status !== 'available' || !bus.station_id) throw ApiError.conflict('This bus has left the shelter, so tickets can no longer be bought for it');

          const stations = await stationsRepository.list(tx, { includeInactive: false });
          const destinationId = headingToId(stations.map((s) => s.id), bus.station_id, bus.planned_destination_id);
          if (!destinationId) throw ApiError.conflict('This bus has no destination yet. Please try again in a moment.');
          const quote = await faresService.quote(bus.station_id, destinationId);

          const created = await ticketsRepository.insertPending(tx, {
            referenceCode: generateReferenceCode(),
            passengerId: input.passengerId,
            originId: bus.station_id,
            destinationId,
            fareCentavos: quote.fareCentavos * quantity,
            quantity,
            validUntil: endOfManilaDay(new Date()),
            maxPending: MAX_PENDING_TICKETS_PER_PASSENGER,
            busId: bus.id,
            busName: bus.name,
          });
          if (created === null) throw ApiError.conflict(`You already have ${MAX_PENDING_TICKETS_PER_PASSENGER} tickets waiting for payment. Pay for or cancel one first.`);
          return created;
        });
        return toTicketView((await ticketsRepository.findById(getDb(), id))!);
      } catch (err) {
        if (isUniqueViolation(err)) continue;
        throw err;
      }
    }
    throw new Error('Could not generate a unique ticket reference');
  },

  /** Email the owner their paid ticket again. Own tickets only, paid only, and not more often than once a minute per ticket. */
  async emailMine(passengerId: string, ticketId: string): Promise<{ sent: boolean }> {
    const row = await ticketsRepository.findById(getDb(), ticketId);
    if (!row || row.passenger_id !== passengerId) throw ApiError.notFound('Ticket not found');
    if (row.status !== 'paid') throw ApiError.conflict('Only a paid ticket that has not been used can be emailed');
    const last = lastEmailed.get(ticketId) ?? 0;
    if (Date.now() - last < EMAIL_MIN_GAP_MS) throw new ApiError(429, 'RATE_LIMITED', 'The ticket was just emailed. Please wait a minute before asking again.');
    lastEmailed.set(ticketId, Date.now());
    const sent = await ticketMail.sendPaidTicket(ticketId);
    // A failed attempt does not count against the limit: they can try again straight away.
    if (!sent) lastEmailed.delete(ticketId);
    return { sent };
  },

  async listMine(passengerId: string): Promise<TicketView[]> {
    return (await ticketsRepository.listByPassenger(getDb(), passengerId, 100)).map(toTicketView);
  },

  /** Someone else's ticket is reported as not found, so ticket ids cannot be probed. */
  async getMine(passengerId: string, ticketId: string): Promise<TicketView> {
    const row = await ticketsRepository.findById(getDb(), ticketId);
    if (!row || row.passenger_id !== passengerId) throw ApiError.notFound('Ticket not found');
    return toTicketView(row);
  },

  /**
   * The ticket's QR code as a PNG (QR-01, QR-03). Only for the owner, and only while the ticket is PAID (QR-04): a used,
   * expired or unpaid ticket has no QR to show. The signed token is created here and goes straight into the image; it is
   * never returned as text and never logged.
   */
  async qrFor(passengerId: string, ticketId: string): Promise<Buffer> {
    const ticket = await ticketsService.getMine(passengerId, ticketId);
    if (ticket.status !== 'paid') {
      throw ApiError.conflict(`This ticket is ${TICKET_STATUS_LABEL[ticket.status].toLowerCase()}: a QR code is only available while it is paid`);
    }
    return qrPng(signTicketToken(ticket.id));
  },

  /** TKT-06: the owner cancels a ticket they have not paid for. No refunds in the POC, so a paid ticket cannot be cancelled. */
  async cancelMine(passengerId: string, ticketId: string): Promise<TicketView> {
    return transaction(async (tx) => {
      const row = await ticketsRepository.findById(tx, ticketId, { forUpdate: true });
      if (!row || row.passenger_id !== passengerId) throw ApiError.notFound('Ticket not found');
      if (!(await ticketsRepository.cancelPending(tx, ticketId, passengerId))) {
        throw ApiError.conflict(`This ticket is ${TICKET_STATUS_LABEL[row.status].toLowerCase()} and cannot be cancelled`);
      }
      // Close its open checkout; if the customer pays it anyway, the webhook flags the money for review.
      await paymentsRepository.cancelPendingForTickets(tx, [ticketId]);
      return toTicketView((await ticketsRepository.findById(tx, ticketId))!);
    });
  },

  /**
   * TKT-07 / TKT-04, for the expiry worker: unpaid tickets older than the window become `expired` (and their open
   * checkouts are closed); paid tickets whose day has ended become `expired`. Idempotent and safe to run concurrently:
   * every change is a conditional update that skips rows another process is working on.
   */
  async expireStale(): Promise<{ unpaid: number; lapsed: number }> {
    return transaction(async (tx) => {
      const unpaidIds = await ticketsRepository.expireStalePending(tx, env.tickets.pendingTtlMinutes);
      await paymentsRepository.cancelPendingForTickets(tx, unpaidIds);
      const lapsed = await ticketsRepository.expireLapsedPaid(tx);
      return { unpaid: unpaidIds.length, lapsed };
    });
  },
};
