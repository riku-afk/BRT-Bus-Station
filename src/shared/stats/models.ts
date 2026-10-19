/** Sales and ticket statistics for the admin dashboard (ADM-03). Browser-safe: shared by the API and the dashboard. */

export type DayStats = {
  /** The Manila calendar day, `YYYY-MM-DD`. */
  date: string;
  /** Tickets paid that day (by the day of payment). */
  ticketsSold: number;
  /** Passengers on those tickets (a group ticket counts every passenger). */
  passengers: number;
  /** Money received that day, in centavos: the total of the tickets paid. */
  salesCentavos: number;
  /** Tickets accepted at the door that day, and the ones refused. */
  scansAccepted: number;
  scansRefused: number;
};

export type RouteStats = { originName: string; destinationName: string; tickets: number; passengers: number; salesCentavos: number };

export type StatsStatus = 'pending_payment' | 'paid' | 'used' | 'expired' | 'cancelled';

export type AdminStats = {
  /** Oldest day first, one entry for every day in the window (zeros where nothing happened). */
  days: DayStats[];
  today: DayStats;
  totals: { ticketsSold: number; passengers: number; salesCentavos: number; scansAccepted: number; scansRefused: number };
  /** Tickets created in the window, by where they ended up. */
  byStatus: Record<StatsStatus, number>;
  /** The busiest origin to destination pairs in the window, by tickets paid. */
  topRoutes: RouteStats[];
  /** Payments that could not be applied to a ticket and are waiting for an admin (all time). */
  paymentsNeedingReview: number;
};

export const STATS_WINDOWS = [7, 14, 30] as const;
