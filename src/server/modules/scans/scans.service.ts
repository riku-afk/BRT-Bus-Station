/**
 * Scanning a ticket (SCN-01..07). What happens when a konduktor scans, in order:
 *
 *   1. who is scanning comes from the SESSION (a konduktor, and their assigned bus if any), never from the request;
 *   2. the QR token's signature is verified BEFORE the database is touched (a forged code never reaches a query);
 *   3. the ticket row is locked, so two scans of one ticket take turns;
 *   4. a ticket is only good at the shelter where it was bought, which is where the passenger boards: the scanning
 *      konduktor's bus must be waiting at that shelter, or the scan is refused (wrong_station / bus_not_at_station);
 *   5. a paid, unexpired ticket is marked used by ONE conditional UPDATE (`... WHERE status='paid' AND valid_until >= now()`),
 *      so of any number of simultaneous scans exactly one is valid and the rest see "already used";
 *   6. the scan itself is recorded, whatever the result, in the same transaction (insert-only evidence).
 *
 * The scanned token is never logged or stored (GEN-06), and the konduktor is never told who the passenger is.
 */
import { getDb, transaction, type SQLExecutor } from '@core/database';
import { ApiError } from '@lib/response';
import { REFERENCE_PATTERN } from '@lib/reference-code';
import { verifyTicketToken } from '@lib/qr-token';
import { ticketsRepository } from '@modules/tickets/tickets.repository';
import { clampPage, offsetOf, toPage, type Page } from '@shared/pagination';
import {
  scanMessage,
  type AdminScanEntry,
  type ScanHistoryPage,
  type ScanHistoryEntry,
  type ScanReason,
  type ScanResponse,
  type ScanResult,
} from '@shared/scans/models';
import { scansRepository } from './scans.repository';
import type { AdminScanRow, ScannedTicket, ScanRow, ScannerRow } from './scans.types';

const toEntry = (row: ScanRow): ScanHistoryEntry => ({
  id: row.id,
  scannedAt: row.scanned_at.toISOString(),
  result: row.result,
  reason: row.reason,
  referenceCode: row.reference_code,
  originName: row.origin_name,
  destinationName: row.destination_name,
  busName: row.bus_name,
  quantity: row.quantity,
});

export const scansService = {
  /** Check one ticket. `token` is what the QR carries; `referenceCode` is the manual fallback for a failed camera (SCN-08). */
  async scan(userId: string, input: { token?: string; referenceCode?: string }): Promise<ScanResponse> {
    const db = getDb();
    const scanner = await scansRepository.findScanner(db, userId);
    if (!scanner) throw ApiError.forbidden('Only konduktors can scan tickets');

    // 2. Work out which ticket is meant without trusting the input.
    let ticketId: string;
    if (input.token !== undefined) {
      const verified = verifyTicketToken(input.token);
      if (!verified) return record(db, scanner, null, 'invalid', 'bad_token');
      ticketId = verified.ticketId;
    } else {
      const code = (input.referenceCode ?? '').trim().toUpperCase();
      if (!REFERENCE_PATTERN.test(code)) return record(db, scanner, null, 'invalid', 'bad_code');
      const found = await ticketsRepository.findIdByReference(db, code);
      if (!found) return record(db, scanner, null, 'invalid', 'unknown_ticket');
      ticketId = found;
    }

    return transaction(async (tx) => {
      // 3. Lock the ticket: a second scan waits here and then sees the first one's result.
      const ticket = await scansRepository.lockTicket(tx, ticketId);
      if (!ticket) return record(tx, scanner, null, 'invalid', 'unknown_ticket');

      switch (ticket.status) {
        case 'paid': {
          // A ticket whose day has ended is expired wherever it is scanned: say so before anything about shelters.
          if (ticket.lapsed) {
            await ticketsRepository.expireLapsedOne(tx, ticket.id);
            return record(tx, scanner, ticket, 'expired', null);
          }
          // 4. Boarding shelter: the bus must be waiting where this ticket was bought.
          const shelter = await scansRepository.busShelter(tx, scanner.bus_id);
          if (!shelter) return record(tx, scanner, ticket, 'invalid', 'bus_not_at_station');
          // A ticket bought on a bus is for that bus only.
          if (ticket.bus_id && ticket.bus_id !== scanner.bus_id) return record(tx, scanner, ticket, 'invalid', 'wrong_bus', { ticketBus: ticket.bus_name });
          if (shelter.id !== ticket.origin_station_id) return record(tx, scanner, ticket, 'invalid', 'wrong_station', { boardsAt: ticket.origin_name, busAt: shelter.name });
          // 5. The decision is this one conditional UPDATE.
          if (await ticketsRepository.markUsed(tx, ticket.id)) {
            const after = (await scansRepository.readTicket(tx, ticket.id))!;
            return record(tx, scanner, after, 'valid', null);
          }
          // Still `paid` but the update refused: its day has ended. Say so now instead of waiting for the worker.
          await ticketsRepository.expireLapsedOne(tx, ticket.id);
          return record(tx, scanner, ticket, 'expired', null);
        }
        case 'used':
          return record(tx, scanner, ticket, 'already_used', null);
        case 'expired':
          return record(tx, scanner, ticket, 'expired', null);
        case 'pending_payment':
          return record(tx, scanner, ticket, 'invalid', 'not_paid');
        case 'cancelled':
          return record(tx, scanner, ticket, 'invalid', 'cancelled');
      }
    });
  },

  /** My scans for the last `days` days grouped by Manila day, today first, with a count per day (SCN-06). Only mine. */
  /** One page of this konduktor's scans (newest first), and the per-day counts of the whole window. */
  async history(userId: string, query: { days?: number; page: number; pageSize: number }): Promise<ScanHistoryPage> {
    const db = getDb();
    const scanner = await scansRepository.findScanner(db, userId);
    if (!scanner) throw ApiError.forbidden('Only konduktors have a scan history');
    const days = query.days ?? 14;
    const summary = await scansRepository.daySummaryForKonduktor(db, scanner.konduktor_id, days);
    const total = summary.reduce((n, d) => n + d.total, 0);
    const page = clampPage(query.page, total, query.pageSize);
    const rows = await scansRepository.listForKonduktor(db, scanner.konduktor_id, days, { limit: query.pageSize, offset: offsetOf(page, query.pageSize) });
    return {
      ...toPage(rows.map(toEntry), total, page, query.pageSize),
      days: summary.map((d) => ({ date: d.date, total: d.total, valid: d.valid, rejected: d.total - d.valid })),
    };
  },

  /** The admin scan log (ADM-04). */
  async adminList(filter: { konduktorId?: string; busId?: string; date?: string; result?: ScanResult; page: number; pageSize: number }): Promise<Page<AdminScanEntry>> {
    const db = getDb();
    const { page: wanted, pageSize, ...where } = filter;
    const total = await scansRepository.countForAdmin(db, where);
    const page = clampPage(wanted, total, pageSize);
    const rows = await scansRepository.listForAdmin(db, where, { limit: pageSize, offset: offsetOf(page, pageSize) });
    return toPage(
      rows.map((row: AdminScanRow) => ({ ...toEntry(row), konduktorId: row.konduktor_id, konduktorName: row.konduktor_name, busId: row.bus_id })),
      total,
      page,
      pageSize,
    );
  },
};

/** Store the scan (always) and build the answer the konduktor sees. */
async function record(
  db: SQLExecutor,
  scanner: ScannerRow,
  ticket: ScannedTicket | null,
  result: ScanResult,
  reason: ScanReason | null,
  where?: { boardsAt?: string; busAt?: string; ticketBus?: string | null },
): Promise<ScanResponse> {
  const stored = await scansRepository.insert(db, {
    ticketId: ticket?.id ?? null,
    konduktorId: scanner.konduktor_id,
    busId: scanner.bus_id,
    result,
    reason,
  });
  const usedAt = ticket?.used_at ? ticket.used_at.toISOString() : null;
  return {
    result,
    reason,
    message: scanMessage(result, reason, usedAt, where),
    ticket: ticket
      ? { referenceCode: ticket.reference_code, originName: ticket.origin_name, destinationName: ticket.destination_name, fareCentavos: ticket.fare_centavos, quantity: ticket.quantity }
      : null,
    usedAt,
    scannedAt: stored.scannedAt.toISOString(),
  };
}
