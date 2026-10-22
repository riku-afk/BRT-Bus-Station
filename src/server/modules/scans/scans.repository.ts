/** SQL only. `scans` is insert-only (a trigger enforces it): nothing here updates or deletes a scan. */
import type { SQLExecutor } from '@core/database';
import type { ScanReason, ScanResult } from '@shared/scans/models';
import type { AdminScanRow, ScannedTicket, ScanRow, ScannerRow } from './scans.types';

const HISTORY_SELECT = `
  SELECT s.id, s.result, s.reason, s.scanned_at, t.reference_code, so.name AS origin_name, sd.name AS destination_name, b.name AS bus_name, t.quantity
    FROM scans s
    LEFT JOIN tickets t ON t.id = s.ticket_id
    LEFT JOIN stations so ON so.id = t.origin_station_id
    LEFT JOIN stations sd ON sd.id = t.destination_station_id
    LEFT JOIN buses b ON b.id = s.bus_id`;

/** Which of a konduktor's own scans to list: the accepted ones, the refused ones, or all. */
export type HistoryResult = 'all' | 'valid' | 'rejected';

type AdminFilter = { konduktorId?: string; busId?: string; date?: string; result?: ScanResult };

const ADMIN_WHERE = `
        WHERE ($1::uuid IS NULL OR s.konduktor_id = $1)
          AND ($2::uuid IS NULL OR s.bus_id = $2)
          AND ($3::date IS NULL OR (s.scanned_at >= ($3::date)::timestamp AT TIME ZONE 'Asia/Manila'
                                    AND s.scanned_at < (($3::date + 1))::timestamp AT TIME ZONE 'Asia/Manila'))
          AND ($4::text IS NULL OR s.result = $4)`;
const adminArgs = (f: AdminFilter) => [f.konduktorId ?? null, f.busId ?? null, f.date ?? null, f.result ?? null];

export const scansRepository = {
  /** Who is scanning: from the session's user id, never from the request. */
  async findScanner(db: SQLExecutor, userId: string): Promise<ScannerRow | null> {
    const rows = await db.query<ScannerRow>(
      `SELECT k.id AS konduktor_id, u.full_name AS konduktor_name, b.id AS bus_id
         FROM konduktors k
         JOIN users u ON u.id = k.user_id
         LEFT JOIN buses b ON b.konduktor_id = k.id
        WHERE k.user_id = $1`,
      [userId],
    );
    return rows[0] ?? null;
  },

  /** The ticket row is locked, so two scans of one ticket take turns and the second sees what the first did. */
  async lockTicket(db: SQLExecutor, ticketId: string): Promise<ScannedTicket | null> {
    const rows = await db.query<ScannedTicket>(
      `SELECT t.id, t.origin_station_id, t.bus_id, t.bus_name, t.status, t.reference_code, so.name AS origin_name, sd.name AS destination_name, t.fare_centavos, t.quantity, t.used_at,
            (t.valid_until < now()) AS lapsed
         FROM tickets t
         JOIN stations so ON so.id = t.origin_station_id
         JOIN stations sd ON sd.id = t.destination_station_id
        WHERE t.id = $1 FOR UPDATE OF t`,
      [ticketId],
    );
    return rows[0] ?? null;
  },

  /** Re-read after the ticket changed state inside this transaction. */
  async readTicket(db: SQLExecutor, ticketId: string): Promise<ScannedTicket | null> {
    const rows = await db.query<ScannedTicket>(
      `SELECT t.id, t.origin_station_id, t.bus_id, t.bus_name, t.status, t.reference_code, so.name AS origin_name, sd.name AS destination_name, t.fare_centavos, t.quantity, t.used_at
         FROM tickets t
         JOIN stations so ON so.id = t.origin_station_id
         JOIN stations sd ON sd.id = t.destination_station_id
        WHERE t.id = $1`,
      [ticketId],
    );
    return rows[0] ?? null;
  },

  /**
   * The shelter where this bus is waiting right now (parked and available), or null if it is on the road, not on the map,
   * or the konduktor has no bus. The row is read FOR SHARE so a dispatch (which locks it FOR UPDATE) cannot slip between
   * this check and the ticket being marked used.
   */
  async busShelter(db: SQLExecutor, busId: string | null): Promise<{ id: string; name: string } | null> {
    if (!busId) return null;
    const rows = await db.query<{ id: string; name: string }>(
      `SELECT s.id, s.name
         FROM bus_availability av
         JOIN stations s ON s.id = av.station_id
        WHERE av.bus_id = $1 AND av.status = 'available'
        FOR SHARE OF av`,
      [busId],
    );
    return rows[0] ?? null;
  },

  /** The passengers of the valid scans on a bus since its last completed ride. */
  async rideSummary(db: SQLExecutor, busId: string): Promise<{ passengers: number; tickets: number; since: Date | null }> {
    const rows = await db.query<{ passengers: number; tickets: number; since: Date | null }>(
      `SELECT COALESCE(SUM(t.quantity), 0)::int AS passengers, count(*)::int AS tickets,
              (SELECT max(completed_at) FROM ride_completions WHERE bus_id = $1) AS since
         FROM scans s
         JOIN tickets t ON t.id = s.ticket_id
        WHERE s.bus_id = $1 AND s.result = 'valid'
          AND s.scanned_at > COALESCE((SELECT max(completed_at) FROM ride_completions WHERE bus_id = $1), '-infinity'::timestamptz)`,
      [busId],
    );
    return rows[0]!;
  },

  /**
   * The passengers of a ride that arrived but was never completed: valid scans since the last completed ride that happened BEFORE the bus
   * parked where it is now (so they boarded at an earlier shelter). People scanned after it parked are boarding for the next trip and do
   * not count. Zero while the bus is on the road. A konduktor must complete this ride before dispatching again.
   */
  async unfinishedRide(db: SQLExecutor, busId: string): Promise<{ passengers: number; tickets: number }> {
    const rows = await db.query<{ passengers: number; tickets: number }>(
      `SELECT COALESCE(SUM(t.quantity), 0)::int AS passengers, count(*)::int AS tickets
         FROM bus_availability av
         JOIN scans s ON s.bus_id = av.bus_id
         JOIN tickets t ON t.id = s.ticket_id
        WHERE av.bus_id = $1 AND av.status = 'available'
          AND s.result = 'valid'
          AND s.scanned_at < av.parked_at
          AND s.scanned_at > COALESCE((SELECT max(completed_at) FROM ride_completions WHERE bus_id = $1), '-infinity'::timestamptz)`,
      [busId],
    );
    return rows[0]!;
  },

  /** Completes the ride: records how many were on board and starts the next count from zero. One statement, so the count and the mark agree. */
  async completeRide(db: SQLExecutor, busId: string, konduktorId: string): Promise<{ passengers: number; tickets: number; completed_at: Date }> {
    const rows = await db.query<{ passengers: number; tickets: number; completed_at: Date }>(
      `INSERT INTO ride_completions (bus_id, konduktor_id, passengers, tickets)
       SELECT $1, $2, COALESCE(SUM(t.quantity), 0)::int, count(*)::int
         FROM scans s
         JOIN tickets t ON t.id = s.ticket_id
        WHERE s.bus_id = $1 AND s.result = 'valid'
          AND s.scanned_at > COALESCE((SELECT max(completed_at) FROM ride_completions WHERE bus_id = $1), '-infinity'::timestamptz)
       RETURNING passengers, tickets, completed_at`,
      [busId, konduktorId],
    );
    return rows[0]!;
  },

  /** The only write to `scans`. Returns the stored time, so the response and the log agree. */
  async insert(
    db: SQLExecutor,
    input: { ticketId: string | null; konduktorId: string; busId: string | null; result: ScanResult; reason: ScanReason | null },
  ): Promise<{ id: string; scannedAt: Date }> {
    const rows = await db.query<{ id: string; scanned_at: Date }>(
      'INSERT INTO scans (ticket_id, konduktor_id, bus_id, result, reason) VALUES ($1, $2, $3, $4, $5) RETURNING id, scanned_at',
      [input.ticketId, input.konduktorId, input.busId, input.result, input.reason],
    );
    return { id: rows[0]!.id, scannedAt: rows[0]!.scanned_at };
  },

  /** One page of a konduktor's own scans, newest first (SCN-06). */
  listForKonduktor(db: SQLExecutor, konduktorId: string, days: number, opts: { limit: number; offset: number; result?: HistoryResult }): Promise<ScanRow[]> {
    return db.query<ScanRow>(
      `${HISTORY_SELECT}
        WHERE s.konduktor_id = $1 AND s.scanned_at >= now() - make_interval(days => $2::int)
          AND ($5::text = 'all' OR ($5 = 'valid' AND s.result = 'valid') OR ($5 = 'rejected' AND s.result <> 'valid'))
        ORDER BY s.scanned_at DESC, s.id
        LIMIT $3 OFFSET $4`,
      [konduktorId, days, opts.limit, opts.offset, opts.result ?? 'all'],
    );
  },

  /** Counts per Manila day over the whole window, so the day headings stay right whichever page is showing. */
  daySummaryForKonduktor(db: SQLExecutor, konduktorId: string, days: number): Promise<{ date: string; total: number; valid: number }[]> {
    return db.query(
      `SELECT to_char(s.scanned_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD') AS date, count(*)::int AS total, (count(*) FILTER (WHERE s.result = 'valid'))::int AS valid
         FROM scans s
        WHERE s.konduktor_id = $1 AND s.scanned_at >= now() - make_interval(days => $2::int)
        GROUP BY 1
        ORDER BY 1 DESC`,
      [konduktorId, days],
    );
  },

  async countForAdmin(db: SQLExecutor, filter: AdminFilter): Promise<number> {
    const rows = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM scans s ${ADMIN_WHERE}`, adminArgs(filter));
    return rows[0]!.n;
  },

  /** One page of the admin log (ADM-04), filtered by konduktor, bus, Manila day and result. */
  listForAdmin(db: SQLExecutor, filter: AdminFilter, opts: { limit: number; offset: number }): Promise<AdminScanRow[]> {
    return db.query<AdminScanRow>(
      `SELECT s.id, s.result, s.reason, s.scanned_at, t.reference_code, so.name AS origin_name, sd.name AS destination_name,
              b.name AS bus_name, t.quantity, s.konduktor_id, ku.full_name AS konduktor_name, s.bus_id
         FROM scans s
         JOIN konduktors k ON k.id = s.konduktor_id
         JOIN users ku ON ku.id = k.user_id
         LEFT JOIN tickets t ON t.id = s.ticket_id
         LEFT JOIN stations so ON so.id = t.origin_station_id
         LEFT JOIN stations sd ON sd.id = t.destination_station_id
         LEFT JOIN buses b ON b.id = s.bus_id
        ${ADMIN_WHERE}
        ORDER BY s.scanned_at DESC, s.id
        LIMIT $5 OFFSET $6`,
      [...adminArgs(filter), opts.limit, opts.offset],
    );
  },
};
