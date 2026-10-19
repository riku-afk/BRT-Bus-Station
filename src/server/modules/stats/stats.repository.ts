/** SQL only. Read-only aggregates over tickets, scans and payments, by Manila calendar day. */
import type { SQLExecutor } from '@core/database';
import type { RouteStats, StatsStatus } from '@shared/stats/models';

export type DayRow = { day: string; tickets_sold: number; passengers: number; sales_centavos: number; scans_accepted: number; scans_refused: number };

const MANILA_DAY = (column: string) => `(${column} AT TIME ZONE 'Asia/Manila')::date`;

export const statsRepository = {
  /** One row per day from `from` to `to` (inclusive, Manila dates), zeros included. */
  daily(db: SQLExecutor, from: string, to: string): Promise<DayRow[]> {
    return db.query<DayRow>(
      `WITH days AS (SELECT d::date AS day FROM generate_series($1::date, $2::date, interval '1 day') AS d),
            sold AS (
              SELECT ${MANILA_DAY('paid_at')} AS day, count(*)::int AS tickets, COALESCE(sum(quantity), 0)::int AS passengers, COALESCE(sum(fare_centavos), 0)::bigint AS sales
                FROM tickets
               WHERE paid_at IS NOT NULL AND ${MANILA_DAY('paid_at')} BETWEEN $1::date AND $2::date
               GROUP BY 1),
            scanned AS (
              SELECT ${MANILA_DAY('scanned_at')} AS day,
                     count(*) FILTER (WHERE result = 'valid')::int AS accepted,
                     count(*) FILTER (WHERE result <> 'valid')::int AS refused
                FROM scans
               WHERE ${MANILA_DAY('scanned_at')} BETWEEN $1::date AND $2::date
               GROUP BY 1)
       SELECT to_char(days.day, 'YYYY-MM-DD') AS day,
              COALESCE(sold.tickets, 0) AS tickets_sold, COALESCE(sold.passengers, 0) AS passengers,
              COALESCE(sold.sales, 0)::float8 AS sales_centavos,
              COALESCE(scanned.accepted, 0) AS scans_accepted, COALESCE(scanned.refused, 0) AS scans_refused
         FROM days
         LEFT JOIN sold ON sold.day = days.day
         LEFT JOIN scanned ON scanned.day = days.day
        ORDER BY days.day`,
      [from, to],
    );
  },

  async byStatus(db: SQLExecutor, from: string, to: string): Promise<{ status: StatsStatus; n: number }[]> {
    return db.query<{ status: StatsStatus; n: number }>(
      `SELECT status, count(*)::int AS n FROM tickets WHERE ${MANILA_DAY('created_at')} BETWEEN $1::date AND $2::date GROUP BY status`,
      [from, to],
    );
  },

  async topRoutes(db: SQLExecutor, from: string, to: string, limit: number): Promise<RouteStats[]> {
    const rows = await db.query<{ origin_name: string; destination_name: string; tickets: number; passengers: number; sales: number }>(
      `SELECT so.name AS origin_name, sd.name AS destination_name, count(*)::int AS tickets, sum(t.quantity)::int AS passengers, sum(t.fare_centavos)::float8 AS sales
         FROM tickets t
         JOIN stations so ON so.id = t.origin_station_id
         JOIN stations sd ON sd.id = t.destination_station_id
        WHERE t.paid_at IS NOT NULL AND ${MANILA_DAY('t.paid_at')} BETWEEN $1::date AND $2::date
        GROUP BY so.name, sd.name
        ORDER BY count(*) DESC, sum(t.fare_centavos) DESC, so.name, sd.name
        LIMIT $3`,
      [from, to, limit],
    );
    return rows.map((r) => ({ originName: r.origin_name, destinationName: r.destination_name, tickets: r.tickets, passengers: r.passengers, salesCentavos: Math.round(r.sales) }));
  },

  async paymentsNeedingReview(db: SQLExecutor): Promise<number> {
    const rows = await db.query<{ n: number }>("SELECT count(*)::int AS n FROM payments WHERE status = 'needs_review'");
    return rows[0]?.n ?? 0;
  },
};
