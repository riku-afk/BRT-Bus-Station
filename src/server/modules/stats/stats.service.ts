/**
 * Sales and ticket statistics (ADM-03). Days are Manila calendar days, like everything a passenger or konduktor sees. A ticket is
 * "sold" on the day it was PAID (an unpaid, cancelled or expired-unpaid ticket never counts as a sale), and sales are the money of
 * those tickets: the total of a group ticket, not per person.
 */
import { getDb, type SQLExecutor } from '@core/database';
import { manilaDateKey } from '@shared/datetime/ph-time';
import type { AdminStats, DayStats, StatsStatus } from '@shared/stats/models';
import { statsRepository, type DayRow } from './stats.repository';

const DAY_MS = 86_400_000;
const STATUSES: readonly StatsStatus[] = ['pending_payment', 'paid', 'used', 'expired', 'cancelled'];

const toDay = (row: DayRow): DayStats => ({
  date: row.day,
  ticketsSold: row.tickets_sold,
  passengers: row.passengers,
  salesCentavos: Math.round(row.sales_centavos),
  scansAccepted: row.scans_accepted,
  scansRefused: row.scans_refused,
});

export const statsService = {
  /** The last `days` Manila days, ending today. `now` is injectable for tests. */
  async overview(days: number, db: SQLExecutor = getDb(), now: Date = new Date()): Promise<AdminStats> {
    const to = manilaDateKey(now);
    const from = manilaDateKey(new Date(now.getTime() - (days - 1) * DAY_MS));
    const [rows, statusRows, topRoutes, review] = await Promise.all([
      statsRepository.daily(db, from, to),
      statsRepository.byStatus(db, from, to),
      statsRepository.topRoutes(db, from, to, 5),
      statsRepository.paymentsNeedingReview(db),
    ]);
    const series = rows.map(toDay);
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<StatsStatus, number>;
    for (const r of statusRows) byStatus[r.status] = r.n;
    const sum = (pick: (d: DayStats) => number) => series.reduce((n, d) => n + pick(d), 0);
    return {
      days: series,
      today: series[series.length - 1]!,
      totals: {
        ticketsSold: sum((d) => d.ticketsSold),
        passengers: sum((d) => d.passengers),
        salesCentavos: sum((d) => d.salesCentavos),
        scansAccepted: sum((d) => d.scansAccepted),
        scansRefused: sum((d) => d.scansRefused),
      },
      byStatus,
      topRoutes,
      paymentsNeedingReview: review,
    };
  },
};
