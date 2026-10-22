/** SQL only. Every status change is a conditional UPDATE guarded by the status machine in `@shared/tickets/status`. */
import type { SQLExecutor } from '@core/database';
import { assertTransition } from '@shared/tickets/status';
import type { ManualTicketRow, TicketRow } from './tickets.types';

const MANUAL_SELECT = `
  SELECT t.id, t.reference_code, t.passenger_id, t.origin_station_id, so.name AS origin_name,
         t.destination_station_id, sd.name AS destination_name, t.fare_centavos, t.status,
         t.valid_until, t.paid_at, t.used_at, t.created_at, t.bus_id, t.bus_name, t.quantity,
         t.passenger_name, eu.full_name AS encoded_by_name
    FROM tickets t
    JOIN stations so ON so.id = t.origin_station_id
    JOIN stations sd ON sd.id = t.destination_station_id
    LEFT JOIN users eu ON eu.id = t.encoded_by`;

const SELECT = `
  SELECT t.id, t.reference_code, t.passenger_id, t.origin_station_id, so.name AS origin_name,
         t.destination_station_id, sd.name AS destination_name, t.fare_centavos, t.status,
         t.valid_until, t.paid_at, t.used_at, t.created_at, t.bus_id, t.bus_name, t.quantity
    FROM tickets t
    JOIN stations so ON so.id = t.origin_station_id
    JOIN stations sd ON sd.id = t.destination_station_id`;

/** 23:59:59 on the current Manila calendar day, as a timestamptz. Matches `endOfManilaDay` in shared/datetime. */
const END_OF_MANILA_DAY = "(date_trunc('day', now() AT TIME ZONE 'Asia/Manila') + interval '1 day' - interval '1 second') AT TIME ZONE 'Asia/Manila'";

export const ticketsRepository = {
  /** `forUpdate` locks the ticket row so a payment, a cancel and the expiry worker cannot all act on it at once. */
  async findById(db: SQLExecutor, id: string, opts: { forUpdate?: boolean } = {}): Promise<TicketRow | null> {
    const rows = await db.query<TicketRow>(`${SELECT} WHERE t.id = $1${opts.forUpdate ? ' FOR UPDATE OF t' : ''}`, [id]);
    return rows[0] ?? null;
  },

  /** One page of a passenger's tickets, newest first. `statuses` null = every status. */
  listPageByPassenger(db: SQLExecutor, passengerId: string, statuses: readonly string[] | null, opts: { limit: number; offset: number; since?: Date | null }): Promise<TicketRow[]> {
    return db.query<TicketRow>(
      `${SELECT} WHERE t.passenger_id = $1 AND ($2::text[] IS NULL OR t.status = ANY($2)) AND ($5::timestamptz IS NULL OR t.created_at >= $5)
        ORDER BY t.created_at DESC, t.id LIMIT $3 OFFSET $4`,
      [passengerId, statuses, opts.limit, opts.offset, opts.since ?? null],
    );
  },

  /** How many tickets a passenger has in each status, in all and bought since `since`. */
  async countByStatus(db: SQLExecutor, passengerId: string, since: Date): Promise<Record<string, { all: number; recent: number }>> {
    const rows = await db.query<{ status: string; n: number; recent: number }>(
      'SELECT status, count(*)::int AS n, (count(*) FILTER (WHERE created_at >= $2))::int AS recent FROM tickets WHERE passenger_id = $1 GROUP BY status',
      [passengerId, since],
    );
    return Object.fromEntries(rows.map((r) => [r.status, { all: r.n, recent: r.recent }]));
  },

  listByPassenger(db: SQLExecutor, passengerId: string, limit: number): Promise<TicketRow[]> {
    return db.query<TicketRow>(`${SELECT} WHERE t.passenger_id = $1 ORDER BY t.created_at DESC LIMIT $2`, [passengerId, limit]);
  },

  /**
   * Insert a `pending_payment` ticket unless the passenger already has `maxPending` waiting. One statement, so the
   * count and the insert cannot be separated. Returns null when the limit is reached.
   * A unique violation on `reference_code` is thrown for the caller to retry with a new code.
   */
  async insertPending(
    db: SQLExecutor,
    input: {
      referenceCode: string;
      passengerId: string;
      originId: string;
      destinationId: string;
      fareCentavos: number;
      validUntil: Date;
      maxPending: number;
      busId?: string | null;
      busName?: string | null;
      quantity?: number;
    },
  ): Promise<string | null> {
    const rows = await db.query<{ id: string }>(
      `INSERT INTO tickets (reference_code, passenger_id, origin_station_id, destination_station_id, fare_centavos, valid_until, bus_id, bus_name, quantity)
       SELECT $1, $2, $3, $4, $5, $6, $8, $9, $10
        WHERE (SELECT count(*) FROM tickets WHERE passenger_id = $2 AND status = 'pending_payment') < $7
       RETURNING id`,
      [input.referenceCode, input.passengerId, input.originId, input.destinationId, input.fareCentavos, input.validUntil, input.maxPending, input.busId ?? null, input.busName ?? null, input.quantity ?? 1],
    );
    return rows[0]?.id ?? null;
  },

  /**
   * A ticket sold over the counter (update 018): created already PAID, valid to the end of today (Manila), like an online one after
   * its payment lands. This is the only other way a ticket becomes paid, and only an admin reaches it. Returns the new id; a unique
   * violation on `reference_code` is thrown for the caller to retry with a new code.
   */
  async insertManualPaid(
    db: SQLExecutor,
    input: { referenceCode: string; adminId: string; originId: string; destinationId: string; fareCentavos: number; quantity: number; passengerName: string | null },
  ): Promise<string> {
    const rows = await db.query<{ id: string }>(
      `INSERT INTO tickets (reference_code, passenger_id, origin_station_id, destination_station_id, fare_centavos, quantity, status, paid_at, valid_until, source, passenger_name, encoded_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'paid', now(), ${END_OF_MANILA_DAY}, 'manual', $7, $2)
       RETURNING id`,
      [input.referenceCode, input.adminId, input.originId, input.destinationId, input.fareCentavos, input.quantity, input.passengerName],
    );
    return rows[0]!.id;
  },

  async findManualById(db: SQLExecutor, id: string): Promise<ManualTicketRow | null> {
    const rows = await db.query<ManualTicketRow>(`${MANUAL_SELECT} WHERE t.id = $1 AND t.source = 'manual'`, [id]);
    return rows[0] ?? null;
  },

  async countManual(db: SQLExecutor): Promise<number> {
    const rows = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM tickets WHERE source = 'manual'");
    return rows[0]?.n ?? 0;
  },

  /** One page of the manual tickets, newest first. */
  listManualPage(db: SQLExecutor, opts: { limit: number; offset: number }): Promise<ManualTicketRow[]> {
    return db.query<ManualTicketRow>(`${MANUAL_SELECT} WHERE t.source = 'manual' ORDER BY t.created_at DESC, t.id LIMIT $1 OFFSET $2`, [opts.limit, opts.offset]);
  },

  /**
   * pending_payment -> paid. The ONLY place a ticket becomes paid, called only from the verified-webhook path.
   * Validity is set here, at purchase: it runs to the end of the Manila day the payment landed (TKT-04).
   */
  async markPaid(db: SQLExecutor, id: string): Promise<boolean> {
    assertTransition('pending_payment', 'paid');
    const rows = await db.query(
      `UPDATE tickets SET status = 'paid', paid_at = now(), valid_until = ${END_OF_MANILA_DAY}
        WHERE id = $1 AND status = 'pending_payment' RETURNING id`,
      [id],
    );
    return rows.length > 0;
  },

  /**
   * paid -> used (SCN-02): the ONLY way a ticket is used. One conditional UPDATE decides it: the ticket must still be paid and
   * not past its validity, so of several simultaneous scans exactly one succeeds. Returns false if it did not.
   */
  async markUsed(db: SQLExecutor, id: string): Promise<boolean> {
    assertTransition('paid', 'used');
    const rows = await db.query(
      "UPDATE tickets SET status = 'used', used_at = now() WHERE id = $1 AND status = 'paid' AND valid_until >= now() RETURNING id",
      [id],
    );
    return rows.length > 0;
  },

  /** A scan found a paid ticket whose day has ended: record that now rather than waiting for the worker. */
  async expireLapsedOne(db: SQLExecutor, id: string): Promise<void> {
    assertTransition('paid', 'expired');
    await db.query("UPDATE tickets SET status = 'expired' WHERE id = $1 AND status = 'paid' AND valid_until < now()", [id]);
  },

  /**
   * Where tickets already sold on this bus, at this shelter, during this wait, are going (unpaid ones only while still payable).
   * Used to stop the bus being sent anywhere else once passengers have paid for a trip.
   */
  async soldDestinations(db: SQLExecutor, busId: string, stationId: string, since: Date, pendingTtlMinutes: number): Promise<string[]> {
    const rows = await db.query<{ destination_station_id: string }>(
      `SELECT DISTINCT destination_station_id FROM tickets
        WHERE bus_id = $1 AND origin_station_id = $2 AND created_at >= $3
          AND (status IN ('paid', 'used') OR (status = 'pending_payment' AND created_at > now() - make_interval(mins => $4::int)))`,
      [busId, stationId, since, pendingTtlMinutes],
    );
    return rows.map((r) => r.destination_station_id);
  },

  /** The bus a passenger wants to buy on, with where it waits. The availability row is locked FOR SHARE (a dispatch locks it FOR UPDATE). */
  async findBusForSale(
    db: SQLExecutor,
    busId: string,
  ): Promise<{ id: string; name: string; status: string; has_konduktor: boolean; av_status: string | null; station_id: string | null; planned_destination_id: string | null } | null> {
    const buses = await db.query<{ id: string; name: string; status: string; has_konduktor: boolean }>(
      `SELECT b.id, b.name, b.status,
              EXISTS (SELECT 1 FROM konduktors k JOIN users u ON u.id = k.user_id WHERE k.id = b.konduktor_id AND u.is_active) AS has_konduktor
         FROM buses b WHERE b.id = $1`,
      [busId],
    );
    const bus = buses[0];
    if (!bus) return null;
    const av = await db.query<{ status: string; station_id: string | null; planned_destination_id: string | null }>(
      'SELECT status, station_id, planned_destination_id FROM bus_availability WHERE bus_id = $1 FOR SHARE',
      [busId],
    );
    return { ...bus, av_status: av[0]?.status ?? null, station_id: av[0]?.station_id ?? null, planned_destination_id: av[0]?.planned_destination_id ?? null };
  },

  /** Manual fallback (SCN-08): the reference code a passenger can read out. */
  async findIdByReference(db: SQLExecutor, referenceCode: string): Promise<string | null> {
    const rows = await db.query<{ id: string }>('SELECT id FROM tickets WHERE reference_code = $1', [referenceCode]);
    return rows[0]?.id ?? null;
  },

  /** pending_payment -> cancelled, only for the owner. */
  async cancelPending(db: SQLExecutor, id: string, passengerId: string): Promise<boolean> {
    assertTransition('pending_payment', 'cancelled');
    const rows = await db.query(
      "UPDATE tickets SET status = 'cancelled' WHERE id = $1 AND passenger_id = $2 AND status = 'pending_payment' RETURNING id",
      [id, passengerId],
    );
    return rows.length > 0;
  },

  /**
   * pending_payment -> expired for tickets left unpaid longer than the window. SKIP LOCKED: a ticket that a webhook is
   * paying right now is left alone this round, so the worker never fights a payment. Returns the ids it expired.
   */
  async expireStalePending(db: SQLExecutor, ttlMinutes: number): Promise<string[]> {
    assertTransition('pending_payment', 'expired');
    const rows = await db.query<{ id: string }>(
      `UPDATE tickets SET status = 'expired'
        WHERE id IN (SELECT id FROM tickets
                      WHERE status = 'pending_payment' AND created_at < now() - make_interval(mins => $1)
                      FOR UPDATE SKIP LOCKED)
          AND status = 'pending_payment'
       RETURNING id`,
      [ttlMinutes],
    );
    return rows.map((r) => r.id);
  },

  /** paid -> expired once the day's validity has run out (TKT-04). Scanning checks validity itself as well (P6). */
  async expireLapsedPaid(db: SQLExecutor): Promise<number> {
    assertTransition('paid', 'expired');
    const rows = await db.query(
      `UPDATE tickets SET status = 'expired'
        WHERE id IN (SELECT id FROM tickets WHERE status = 'paid' AND valid_until < now() FOR UPDATE SKIP LOCKED)
          AND status = 'paid'
       RETURNING id`,
    );
    return rows.length;
  },
};
