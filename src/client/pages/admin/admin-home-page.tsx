import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Bus, CreditCard, MapPin, Radio, ScanLine, Tag, Users, type LucideIcon } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/use-auth';
import { SalesChart } from '@/features/stats/sales-chart';
import { useAdminStats } from '@/features/stats/use-stats';
import { cn } from '@/lib/utils';
import { formatPeso } from '@shared/money';
import { STATS_WINDOWS, type StatsStatus } from '@shared/stats/models';

const SECTIONS: { to: string; title: string; description: string; icon: LucideIcon }[] = [
  { to: '/admin/live', title: 'Live map', description: 'Watch every bus in real time, and the tickets bought at each shelter.', icon: Radio },
  { to: '/admin/stations', title: 'Stations', description: 'Place, rename, reorder and deactivate stations on the map.', icon: MapPin },
  { to: '/admin/buses', title: 'Buses', description: 'Add buses, set their status and assign a konduktor.', icon: Bus },
  { to: '/admin/konduktors', title: 'Konduktors', description: 'Create konduktor accounts, deactivate, reset passwords.', icon: Users },
  { to: '/admin/payments', title: 'Payments', description: 'Recent payments, and any that could not be applied to a ticket.', icon: CreditCard },
  { to: '/admin/scans', title: 'Scans', description: 'Every ticket check by every konduktor, with the result.', icon: ScanLine },
  { to: '/admin/fares', title: 'Fares', description: 'The fare rule and fixed fares for specific station pairs.', icon: Tag },
];

const STATUS_LABEL: Record<StatsStatus, string> = {
  pending_payment: 'Awaiting payment',
  paid: 'Paid, not used yet',
  used: 'Used',
  expired: 'Expired',
  cancelled: 'Cancelled',
};
const STATUS_ORDER: StatsStatus[] = ['paid', 'used', 'pending_payment', 'expired', 'cancelled'];

function Tile({ label, value, hint, testId }: { label: string; value: string; hint?: string; testId: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-0.5 p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums" data-testid={testId}>
          {value}
        </p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}

/** Admin landing page: how sales and tickets are going (ADM-03), then the management pages. */
export function AdminHomePage() {
  const { data: user } = useCurrentUser();
  const [days, setDays] = useState<number>(14);
  const { data: stats, isLoading, error } = useAdminStats(days);
  const statusTotal = stats ? STATUS_ORDER.reduce((n, s) => n + stats.byStatus[s], 0) : 0;

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <div>
        <h1 className="mb-1 text-xl font-semibold">Admin</h1>
        <p className="text-sm text-muted-foreground">Signed in as {user?.fullName}.</p>
      </div>

      {isLoading && <Skeleton className="h-64 w-full" />}
      {error && <p className="text-sm text-destructive">Could not load the numbers: {error.message}</p>}

      {stats && (
        <>
          <section aria-label="Today" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Tile label="Sales today" value={formatPeso(stats.today.salesCentavos)} testId="tile-sales" hint={`${stats.totals.salesCentavos > 0 ? formatPeso(stats.totals.salesCentavos) : '₱0.00'} in ${days} days`} />
            <Tile label="Tickets sold today" value={String(stats.today.ticketsSold)} testId="tile-tickets" hint={`${stats.totals.ticketsSold} in ${days} days`} />
            <Tile label="Passengers today" value={String(stats.today.passengers)} testId="tile-passengers" hint={`${stats.totals.passengers} in ${days} days`} />
            <Tile label="Scans today" value={`${stats.today.scansAccepted} ok`} testId="tile-scans" hint={`${stats.today.scansRefused} refused`} />
          </section>

          {stats.paymentsNeedingReview > 0 && (
            <Link to="/admin/payments" className="flex items-center gap-2 rounded-md border border-destructive/40 p-3 text-sm text-destructive hover:bg-destructive/5" data-testid="review-alert">
              <AlertTriangle className="size-4" aria-hidden />
              {stats.paymentsNeedingReview} payment{stats.paymentsNeedingReview === 1 ? '' : 's'} could not be applied to a ticket and need{stats.paymentsNeedingReview === 1 ? 's' : ''} a look.
            </Link>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base">
                Sales and tickets, by day
                <span role="group" aria-label="How many days" className="flex gap-1">
                  {STATS_WINDOWS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={days === n}
                      onClick={() => setDays(n)}
                      className={cn('rounded-md border px-2.5 py-1 text-xs font-medium transition-colors', days === n ? 'border-primary bg-primary/10' : 'text-muted-foreground hover:bg-accent')}
                    >
                      {n} days
                    </button>
                  ))}
                </span>
              </CardTitle>
              <CardDescription>A ticket counts on the day it was paid (Manila time). Sales are the money received; a group ticket counts every passenger.</CardDescription>
            </CardHeader>
            <CardContent>
              <SalesChart days={stats.days} />
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Where tickets ended up</CardTitle>
                <CardDescription>Tickets created in the last {days} days.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2" data-testid="status-breakdown">
                {statusTotal === 0 && <p className="text-sm text-muted-foreground">No tickets in this period.</p>}
                {statusTotal > 0 &&
                  STATUS_ORDER.map((s) => (
                    <div key={s} className="flex items-center gap-3 text-sm">
                      <span className="w-36 shrink-0 text-muted-foreground">{STATUS_LABEL[s]}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(stats.byStatus[s] / statusTotal) * 100}%` }} />
                      </div>
                      <span className="w-8 text-right tabular-nums" data-testid={`status-${s}`}>
                        {stats.byStatus[s]}
                      </span>
                    </div>
                  ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Busiest trips</CardTitle>
                <CardDescription>By tickets paid in the last {days} days.</CardDescription>
              </CardHeader>
              <CardContent>
                {stats.topRoutes.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No paid tickets in this period.</p>
                ) : (
                  <table className="w-full text-sm" data-testid="top-routes">
                    <thead>
                      <tr className="border-b text-left text-xs text-muted-foreground">
                        <th className="py-1.5 pr-2 font-medium">Trip</th>
                        <th className="py-1.5 pr-2 text-right font-medium">Tickets</th>
                        <th className="py-1.5 text-right font-medium">Sales</th>
                      </tr>
                    </thead>
                    <tbody>
                      {stats.topRoutes.map((r) => (
                        <tr key={`${r.originName}>${r.destinationName}`} className="border-b last:border-0">
                          <td className="py-1.5 pr-2">
                            {r.originName} → {r.destinationName}
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{r.tickets}</td>
                          <td className="py-1.5 text-right tabular-nums">{formatPeso(r.salesCentavos)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </CardContent>
            </Card>
          </div>
        </>
      )}

      <section aria-label="Manage" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {SECTIONS.map(({ to, title, description, icon: Icon }) => (
          <Link key={to} to={to} className="rounded-lg focus-visible:outline-2">
            <Card className="h-full transition-colors hover:bg-accent">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Icon className="size-4" aria-hidden /> {title}
                </CardTitle>
                <CardDescription>{description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </section>
    </div>
  );
}
