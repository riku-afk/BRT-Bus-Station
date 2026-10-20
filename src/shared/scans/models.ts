/** Scan contracts shared by the API and the konduktor / admin screens. Browser-safe. */
import { formatManilaTime } from '../datetime/ph-time';
import type { Page } from '../pagination';

export const SCAN_RESULTS = ['valid', 'already_used', 'expired', 'invalid'] as const;
export type ScanResult = (typeof SCAN_RESULTS)[number];

/** Why an `invalid` scan was refused (stored as `scans.reason`; machine codes, never user text). */
export type ScanReason = 'bad_token' | 'bad_code' | 'unknown_ticket' | 'not_paid' | 'cancelled' | 'wrong_station' | 'wrong_bus' | 'bus_not_at_station';

/** What the konduktor needs to know about the ticket: where the passenger gets off (SCN-05). Never who the passenger is. */
export type ScanTicketInfo = { referenceCode: string; originName: string; destinationName: string; fareCentavos: number; /** Passengers this ticket admits. */ quantity: number };

export type ScanResponse = {
  result: ScanResult;
  reason: ScanReason | null;
  /** Plain-language line for the result screen, e.g. "Already used at 8:42 AM". */
  message: string;
  ticket: ScanTicketInfo | null;
  usedAt: string | null;
  scannedAt: string;
};

export type ScanHistoryEntry = {
  id: string;
  scannedAt: string;
  result: ScanResult;
  reason: ScanReason | null;
  referenceCode: string | null;
  originName: string | null;
  destinationName: string | null;
  busName: string | null;
  /** Passengers the ticket admitted (null when no ticket was identified). */
  quantity: number | null;
};

/** One Manila calendar day of a konduktor's scans. */
export type ScanDay = {
  /** `YYYY-MM-DD`, Manila. */
  date: string;
  total: number;
  valid: number;
  /** already_used + expired + invalid. */
  rejected: number;
};

/** A page of a konduktor's scans, newest first, plus the counts per day over the whole window (so day headings do not change by page). */
export type ScanHistoryPage = Page<ScanHistoryEntry> & { days: ScanDay[] };

/** The passengers on a konduktor's bus since its last completed ride (counted from valid scans; a group ticket counts all its people). */
export type RideSummary = {
  passengers: number;
  /** How many tickets they came on. */
  tickets: number;
  /** When the last ride was completed (the count starts after this), or null if none has been. */
  since: string | null;
  /** The shelter the bus is waiting at now, or null while it is on the road. */
  atShelter: string | null;
  /** The ride can be completed: the bus has arrived at a shelter and there are passengers to clear. */
  canComplete: boolean;
};

export type RideCompletion = { passengers: number; tickets: number; completedAt: string };

/** A row of the admin scan log (ADM-04). */
export type AdminScanEntry = ScanHistoryEntry & { konduktorId: string; konduktorName: string; busId: string | null };

/** The sentence shown for a scan. One place, so the server, the result screen and the logs agree (SCN-03). */
export function scanMessage(
  result: ScanResult,
  reason: ScanReason | string | null,
  usedAt?: string | null,
  /** Shelter names, when known: where the ticket boards, and where the scanning bus is. */
  where?: { boardsAt?: string | null; busAt?: string | null; ticketBus?: string | null },
): string {
  switch (result) {
    case 'valid':
      return 'Valid ticket';
    case 'already_used':
      return usedAt ? `Already used at ${formatManilaTime(usedAt)}` : 'Already used';
    case 'expired':
      return 'This ticket has expired';
    case 'invalid':
      if (reason === 'not_paid') return 'This ticket has not been paid';
      if (reason === 'cancelled') return 'This ticket was cancelled';
      // A ticket is only good at the shelter where it was bought: that is where the passenger boards.
      if (reason === 'wrong_station') {
        return where?.boardsAt && where.busAt
          ? `Wrong shelter: this ticket boards at ${where.boardsAt}, and your bus is at ${where.busAt}`
          : 'Wrong shelter: this ticket boards at a different shelter';
      }
      // A ticket bought on a bus is for that bus.
      if (reason === 'wrong_bus') return where?.ticketBus ? `Wrong bus: this ticket is for ${where.ticketBus}, not your bus` : 'Wrong bus: this ticket is for a different bus';
      if (reason === 'bus_not_at_station') return 'Your bus is not waiting at a shelter, so tickets cannot be checked right now';
      return 'Not a valid BRT ticket';
  }
}
