/** SQL only. Payments are evidence: rows are inserted, and only `status` / `review_reason` / `method` ever move. */
import type { SQLExecutor } from '@core/database';
import type { PaymentAdminFilter, PaymentAdminRow, PaymentReportRow, PaymentRow, PaymentStatus, WebhookOutcome } from './payments.types';

const COLUMNS =
  'id, ticket_id, provider, provider_ref, method, amount_centavos, checkout_url, status, review_reason, qr_payload, provider_reference_no, channel_code, created_at, updated_at';

/** The admin filter ($1–$6). Days are Manila calendar days; `to` is inclusive. Needs `payments p JOIN tickets t`. */
const ADMIN_WHERE = `
        WHERE ($1::text IS NULL OR p.status = $1)
          AND ($2::text IS NULL OR p.provider = $2)
          AND ($3::text IS NULL OR p.method = $3)
          AND ($4::date IS NULL OR p.created_at >= ($4::date)::timestamp AT TIME ZONE 'Asia/Manila')
          AND ($5::date IS NULL OR p.created_at < ($5::date + 1)::timestamp AT TIME ZONE 'Asia/Manila')
          AND ($6::text IS NULL OR t.reference_code ILIKE '%' || $6 || '%' ESCAPE '\\')`;

/** LIKE wildcards in the search box are matched literally. */
const likeLiteral = (q: string) => q.replace(/[\\%_]/g, (c) => `\\${c}`);

const adminArgs = (f: PaymentAdminFilter) => [
  f.status ?? null,
  f.provider ?? null,
  f.method ?? null,
  f.from ?? null,
  f.to ?? null,
  f.q ? likeLiteral(f.q) : null,
];

export const paymentsRepository = {
  async insert(
    db: SQLExecutor,
    input: {
      id: string;
      ticketId: string;
      provider: 'mock' | 'pisopay';
      providerRef: string;
      amountCentavos: number;
      checkoutUrl: string;
      qr?: { payload: string; referenceNo: string; channelCode: string };
    },
  ): Promise<PaymentRow> {
    const rows = await db.query<PaymentRow>(
      `INSERT INTO payments (id, ticket_id, provider, provider_ref, amount_centavos, checkout_url, qr_payload, provider_reference_no, channel_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${COLUMNS}`,
      [input.id, input.ticketId, input.provider, input.providerRef, input.amountCentavos, input.checkoutUrl, input.qr?.payload ?? null, input.qr?.referenceNo ?? null, input.qr?.channelCode ?? null],
    );
    return rows[0]!;
  },

  async findPendingForTicket(db: SQLExecutor, ticketId: string): Promise<PaymentRow | null> {
    const rows = await db.query<PaymentRow>(`SELECT ${COLUMNS} FROM payments WHERE ticket_id = $1 AND status = 'pending'`, [ticketId]);
    return rows[0] ?? null;
  },

  /** The ticket's newest payment (open one first), whatever its status. */
  async findLatestForTicket(db: SQLExecutor, ticketId: string): Promise<PaymentRow | null> {
    const rows = await db.query<PaymentRow>(
      `SELECT ${COLUMNS} FROM payments WHERE ticket_id = $1 ORDER BY (status = 'pending') DESC, created_at DESC LIMIT 1`,
      [ticketId],
    );
    return rows[0] ?? null;
  },

  /** `forUpdate` serialises every delivery for one checkout, so two copies of an event are handled one after the other. */
  async findByProviderRef(db: SQLExecutor, provider: string, providerRef: string, opts: { forUpdate?: boolean } = {}): Promise<PaymentRow | null> {
    const rows = await db.query<PaymentRow>(
      `SELECT ${COLUMNS} FROM payments WHERE provider = $1 AND provider_ref = $2${opts.forUpdate ? ' FOR UPDATE' : ''}`,
      [provider, providerRef],
    );
    return rows[0] ?? null;
  },

  /** Conditional on the current status, so a status can only move from where we expect it. */
  async setStatus(
    db: SQLExecutor,
    id: string,
    from: readonly PaymentStatus[],
    to: PaymentStatus,
    opts: { reviewReason?: string | null; method?: string | null } = {},
  ): Promise<boolean> {
    const rows = await db.query(
      `UPDATE payments SET status = $3, review_reason = COALESCE($4, review_reason), method = COALESCE($5, method), updated_at = now()
        WHERE id = $1 AND status = ANY($2::text[]) RETURNING id`,
      [id, from, to, opts.reviewReason ?? null, opts.method ?? null],
    );
    return rows.length > 0;
  },

  /** The ticket was cancelled or expired: close its open checkouts. A late "paid" for one of these is flagged for review. */
  async cancelPendingForTickets(db: SQLExecutor, ticketIds: readonly string[]): Promise<number> {
    if (ticketIds.length === 0) return 0;
    const rows = await db.query(
      "UPDATE payments SET status = 'cancelled', updated_at = now() WHERE ticket_id = ANY($1::uuid[]) AND status = 'pending' RETURNING id",
      [ticketIds],
    );
    return rows.length;
  },

  async eventExists(db: SQLExecutor, provider: string, eventId: string): Promise<boolean> {
    const rows = await db.query('SELECT 1 FROM payment_events WHERE provider = $1 AND event_id = $2', [provider, eventId]);
    return rows.length > 0;
  },

  /** Insert-only evidence. ON CONFLICT is the backstop behind the lock: a unique (provider, event_id) can never be stored twice. */
  async insertEvent(
    db: SQLExecutor,
    input: { provider: string; eventId: string; paymentId: string | null; eventType: string; payloadHash: string; outcome: WebhookOutcome },
  ): Promise<boolean> {
    const rows = await db.query(
      `INSERT INTO payment_events (provider, event_id, payment_id, event_type, payload_hash, outcome)
       VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (provider, event_id) DO NOTHING RETURNING id`,
      [input.provider, input.eventId, input.paymentId, input.eventType, input.payloadHash, input.outcome],
    );
    return rows.length > 0;
  },

  async countForAdmin(db: SQLExecutor, filter: PaymentAdminFilter): Promise<number> {
    const rows = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM payments p JOIN tickets t ON t.id = p.ticket_id ${ADMIN_WHERE}`, adminArgs(filter));
    return rows[0]!.n;
  },

  /** One page of the admin list, newest first. `limit` is also how the CSV export caps its size. */
  listForAdmin(db: SQLExecutor, filter: PaymentAdminFilter, opts: { limit: number; offset: number }): Promise<PaymentAdminRow[]> {
    return db.query<PaymentAdminRow>(
      `SELECT p.id, p.ticket_id, p.provider, p.provider_ref, p.method, p.amount_centavos, p.checkout_url, p.status,
              p.review_reason, p.created_at, p.updated_at, t.reference_code, so.name AS origin_name, sd.name AS destination_name
         FROM payments p
         JOIN tickets t ON t.id = p.ticket_id
         JOIN stations so ON so.id = t.origin_station_id
         JOIN stations sd ON sd.id = t.destination_station_id
        ${ADMIN_WHERE}
        ORDER BY p.created_at DESC, p.id
        LIMIT $7 OFFSET $8`,
      [...adminArgs(filter), opts.limit, opts.offset],
    );
  },

  /** Counts and sums of the filtered payments, grouped by status, method and Manila day, for the admin report. */
  reportForAdmin(db: SQLExecutor, filter: PaymentAdminFilter): Promise<PaymentReportRow[]> {
    return db.query<PaymentReportRow>(
      `SELECT p.status, p.method, to_char(p.created_at AT TIME ZONE 'Asia/Manila', 'YYYY-MM-DD') AS day,
              count(*)::int AS n, sum(p.amount_centavos)::bigint AS amount_centavos
         FROM payments p
         JOIN tickets t ON t.id = p.ticket_id
        ${ADMIN_WHERE}
        GROUP BY 1, 2, 3
        ORDER BY 3 DESC`,
      adminArgs(filter),
    );
  },

  /** Every payment method that has ever been recorded, for the filter list. */
  async methods(db: SQLExecutor): Promise<string[]> {
    const rows = await db.query<{ method: string }>('SELECT DISTINCT method FROM payments WHERE method IS NOT NULL ORDER BY method');
    return rows.map((r) => r.method);
  },
};
