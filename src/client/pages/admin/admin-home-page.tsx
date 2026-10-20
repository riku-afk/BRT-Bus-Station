import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, Bus, CreditCard, MapPin, PhilippinePeso, Radio, ScanLine, Tag, Ticket, Users, UsersRound, type LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useCurrentUser } from '@/features/auth/use-auth';
import { SalesChart } from '@/features/stats/sales-chart';
import { useAdminStats } from '@/features/stats/use-stats';
import { cn } from '@/lib/utils';
import { formatPeso } from '@shared/money';
import { STATS_WINDOWS, type StatsStatus } from '@shared/stats/models';

/** The pages an admin manages: one solid card each, in that section's colour. */
const MODULES: { to: string; title: string; desc: string; cta: string; icon: LucideIcon; bg: string; arrow: string; ink?: boolean }[] = [
  { to: '/admin/live', title: 'Live map', desc: 'Watch every bus in real time, and the tickets bought at each shelter.', cta: 'Open map', icon: Radio, bg: '#2563eb', arrow: '#2563eb' },
  { to: '/admin/stations', title: 'Stations', desc: 'Place, rename, reorder and deactivate stations on the map.', cta: 'Manage stations', icon: MapPin, bg: '#0f766e', arrow: '#0f766e' },
  { to: '/admin/buses', title: 'Buses', desc: 'Add buses, set their status and assign a konduktor.', cta: 'Manage fleet', icon: Bus, bg: '#c2410c', arrow: '#c2410c' },
  { to: '/admin/konduktors', title: 'Konduktors', desc: 'Create konduktor accounts, deactivate, reset passwords.', cta: 'Manage staff', icon: Users, bg: '#7c3aed', arrow: '#7c3aed' },
  { to: '/admin/payments', title: 'Payments', desc: 'Recent payments, and any that could not be applied to a ticket.', cta: 'View payments', icon: CreditCard, bg: '#15803d', arrow: '#15803d' },
  { to: '/admin/scans', title: 'Scans', desc: 'Every ticket check by every konduktor, with the result.', cta: 'Review scans', icon: ScanLine, bg: '#f59e0b', arrow: '#b45309', ink: true },
  { to: '/admin/fares', title: 'Fares', desc: 'The fare rule and fixed fares for specific station pairs.', cta: 'Edit fares', icon: Tag, bg: '#be185d', arrow: '#be185d' },
];

const STATUS_LABEL: Record<StatsStatus, string> = {
  pending_payment: 'Awaiting payment',
  paid: 'Paid, not used yet',
  used: 'Used',
  expired: 'Expired',
  cancelled: 'Cancelled',
};
const STATUS_ORDER: StatsStatus[] = ['used', 'paid', 'expired', 'cancelled', 'pending_payment'];
const STATUS_COLOR: Record<StatsStatus, string> = { used: '#16a34a', paid: '#6366f1', expired: '#94a3b8', cancelled: '#e11d48', pending_payment: '#f59e0b' };
const RANK_COLORS = ['#4f46e5', '#2563eb', '#0f766e', '#c2410c', '#be185d'];

const manilaHour = () => Number(new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
const greeting = () => {
  const h = manilaHour();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};
const todayLabel = () => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', weekday: 'short', month: 'short', day: 'numeric' }).format(new Date());

/** A tinted tile: the colour at 11% over the surface, with a border at 28%: right in both themes. */
const tint = (color: string, fill = 11, line = 28) => ({
  background: `color-mix(in srgb, ${color} ${fill}%, var(--surface))`,
  border: `1px solid color-mix(in srgb, ${color} ${line}%, var(--surface))`,
});

function Kpi({ label, icon: Icon, color, ink, testId, value, hint, children, fill, line }: { label: string; icon: LucideIcon; color: string; ink?: string; testId: string; value: string; hint?: string; children?: React.ReactNode; fill?: number; line?: number }) {
  return (
    <div className="flex flex-col gap-3 rounded-[18px] p-5" style={tint(color, fill, line)}>
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-bold text-muted-foreground">{label}</span>
        <span className="grid size-9 place-items-center rounded-[10px]" style={{ background: color, color: ink ?? '#fff' }}>
          <Icon className="size-[18px]" aria-hidden />
        </span>
      </div>
      {children ?? (
        <span className="text-[32px] font-extrabold leading-none tracking-tight" data-testid={testId}>
          {value}
        </span>
      )}
      {hint && <span className="text-[13px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

/** Admin landing page: a welcome, how sales and tickets are going (ADM-03), then the management pages. */
export function AdminHomePage() {
  const { data: user } = useCurrentUser();
  const [days, setDays] = useState<number>(14);
  const { data: stats, isLoading, error } = useAdminStats(days);
  const statusTotal = stats ? STATUS_ORDER.reduce((n, s) => n + stats.byStatus[s], 0) : 0;
  const maxTickets = Math.max(1, ...(stats?.topRoutes.map((r) => r.tickets) ?? [1]));
  const first = user?.fullName.split(' ')[0];

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-7 px-4 pb-10 pt-6 sm:px-6 md:px-8 md:pt-7">
      <section className="relative flex flex-wrap items-center justify-between gap-6 overflow-hidden rounded-[22px] bg-[#1e1b4b] p-6 text-white sm:px-8 sm:py-[30px]" aria-label="Welcome">
        <svg aria-hidden="true" width="560" height="200" viewBox="0 0 560 200" fill="none" className="pointer-events-none absolute -right-10 -top-2.5 hidden opacity-55 sm:block">
          <path d="M20 160 C 120 160, 140 60, 240 60 S 380 150, 470 110 S 540 40, 560 40" stroke="#facc15" strokeWidth="5" strokeLinecap="round" />
          <path d="M60 30 C 160 30, 200 130, 300 140 S 440 60, 560 90" stroke="#38bdf8" strokeWidth="5" strokeLinecap="round" strokeDasharray="2 12" />
          <circle cx="240" cy="60" r="9" fill="#1e1b4b" stroke="#facc15" strokeWidth="4" />
          <circle cx="470" cy="110" r="9" fill="#1e1b4b" stroke="#facc15" strokeWidth="4" />
          <circle cx="300" cy="140" r="9" fill="#1e1b4b" stroke="#38bdf8" strokeWidth="4" />
          <circle cx="120" cy="150" r="9" fill="#1e1b4b" stroke="#facc15" strokeWidth="4" />
        </svg>
        <div className="relative flex max-w-[520px] flex-col gap-2">
          <span className="self-start rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-[#e0e7ff]">{todayLabel()} · Manila time</span>
          <h1 className="text-[28px] font-extrabold tracking-tight sm:text-[32px]">
            {greeting()}
            {first ? `, ${first}` : ''}
          </h1>
          <p className="text-[15px] leading-relaxed text-[#c7d2fe]">Here’s how the network is doing today.</p>
        </div>
        {stats && (
          <div className="relative flex flex-wrap gap-3" data-testid="hero-chips">
            <div className="flex min-w-[130px] flex-col gap-0.5 rounded-2xl bg-[#facc15] px-[18px] py-3.5 text-[#1c1203]">
              <span className="text-xs font-bold">Last {days} days</span>
              <span className="text-2xl font-extrabold">{formatPeso(stats.totals.salesCentavos)}</span>
            </div>
            <div className="flex min-w-[130px] flex-col gap-0.5 rounded-2xl bg-white/10 px-[18px] py-3.5">
              <span className="text-xs font-bold text-[#c7d2fe]">Passengers, {days} days</span>
              <span className="text-2xl font-extrabold">{stats.totals.passengers}</span>
            </div>
          </div>
        )}
      </section>

      {isLoading && <Skeleton className="h-48 w-full rounded-[20px]" />}
      {error && <p className="text-sm text-destructive">Could not load the numbers: {error.message}</p>}

      {stats && (
        <>
          <section aria-label="Today at a glance" className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
            <Kpi label="Sales today" icon={PhilippinePeso} color="#16a34a" testId="tile-sales" value={formatPeso(stats.today.salesCentavos)} hint={`${formatPeso(stats.totals.salesCentavos)} in last ${days} days`} />
            <Kpi label="Tickets sold today" icon={Ticket} color="#4f46e5" testId="tile-tickets" value={String(stats.today.ticketsSold)} hint={`${stats.totals.ticketsSold} in last ${days} days`} />
            <Kpi label="Passengers today" icon={UsersRound} color="#ea580c" testId="tile-passengers" value={String(stats.today.passengers)} hint={`${stats.totals.passengers} in last ${days} days`} />
            <Kpi label="Scans today" icon={ScanLine} color="#f59e0b" ink="#1c1203" fill={13} line={32} testId="tile-scans" value="">
              <div className="flex items-baseline gap-2">
                <span className="text-[32px] font-extrabold leading-none tracking-tight" data-testid="tile-scans">
                  {stats.today.scansAccepted}
                </span>
                <span className="text-sm font-bold text-muted-foreground">accepted</span>
              </div>
              <span className="self-start rounded-full bg-[#be123c] px-2.5 py-0.5 text-xs font-bold text-white">{stats.today.scansRefused} refused</span>
            </Kpi>
          </section>

          {stats.paymentsNeedingReview > 0 && (
            <Link to="/admin/payments" className="flex items-center gap-2.5 rounded-2xl border border-[#e11d48]/40 bg-[#e11d48]/10 p-4 text-sm font-bold text-[#be123c] hover:bg-[#e11d48]/15 dark:text-[#fb7185]" data-testid="review-alert">
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
              {stats.paymentsNeedingReview} payment{stats.paymentsNeedingReview === 1 ? '' : 's'} could not be applied to a ticket and need{stats.paymentsNeedingReview === 1 ? 's' : ''} a look.
            </Link>
          )}
        </>
      )}

      <section aria-labelledby="mods" className="flex flex-col gap-3.5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="mods" className="text-xl font-extrabold tracking-tight">
            Manage
          </h2>
          <span className="text-[13px] text-muted-foreground">Jump to a section</span>
        </div>
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
          {MODULES.map(({ to, title, desc, cta, icon: Icon, bg, arrow, ink }) => (
            <Link
              key={to}
              to={to}
              className={cn('group relative flex min-h-[190px] flex-col justify-between gap-[18px] overflow-hidden rounded-[20px] p-[22px] transition-all duration-200 hover:-translate-y-1 hover:shadow-[0_18px_32px_-14px_rgba(15,23,42,.45)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring', ink ? 'text-[#1c1203]' : 'text-white')}
              style={{ background: bg }}
            >
              <Icon aria-hidden className="pointer-events-none absolute -bottom-7 -right-7 size-[150px] opacity-[0.16]" strokeWidth={1.4} />
              <span className="relative grid size-12 place-items-center rounded-[14px]" style={{ background: ink ? 'rgba(28,18,3,.12)' : 'rgba(255,255,255,.2)' }}>
                <Icon className="size-6" aria-hidden />
              </span>
              <span className="relative flex flex-col gap-1.5">
                <span className="text-xl font-extrabold tracking-tight">{title}</span>
                <span className="text-[13px] leading-normal opacity-90">{desc}</span>
              </span>
              <span className="relative flex items-center justify-between">
                <span className="text-[13px] font-bold">{cta}</span>
                <span className="grid size-[34px] place-items-center rounded-full bg-white transition-transform group-hover:translate-x-[3px]" style={{ color: arrow }}>
                  <ArrowRight className="size-4" strokeWidth={2.4} aria-hidden />
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {stats && (
        <>
          <section className="flex flex-wrap gap-4">
            <div className="flex min-w-0 flex-[2_1_520px] flex-col gap-5 rounded-[20px] border bg-card p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <h2 className="text-lg font-extrabold">Sales by day</h2>
                  <span className="text-[13px] text-muted-foreground">Counted on the day paid (Manila time). A group ticket counts every passenger.</span>
                </div>
                <div role="group" aria-label="Range" className="flex gap-1 rounded-xl bg-surface-2 p-1">
                  {STATS_WINDOWS.map((n) => (
                    <button
                      key={n}
                      type="button"
                      aria-pressed={days === n}
                      onClick={() => setDays(n)}
                      className={cn('h-8 rounded-[9px] px-3.5 text-[13px] font-bold transition-colors', days === n ? 'bg-[#4f46e5] text-white' : 'text-muted-foreground hover:text-foreground')}
                    >
                      {n} days
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-baseline gap-2.5">
                <span className="text-[28px] font-extrabold">{formatPeso(stats.totals.salesCentavos)}</span>
                <span className="text-[13px] text-muted-foreground">received in the last {days} days</span>
              </div>
              <SalesChart days={stats.days} />
            </div>

            <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5 rounded-[20px] border bg-card p-5 sm:p-6">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-extrabold">Where tickets ended up</h2>
                <span className="text-[13px] text-muted-foreground">
                  {statusTotal} ticket{statusTotal === 1 ? '' : 's'} created in the last {days} days
                </span>
              </div>
              <div className="flex flex-col gap-5" data-testid="status-breakdown">
                {statusTotal === 0 && <p className="text-sm text-muted-foreground">No tickets in this period.</p>}
                {statusTotal > 0 && (
                  <>
                    <div aria-hidden="true" className="flex h-3.5 gap-[3px] overflow-hidden rounded-full">
                      {STATUS_ORDER.filter((s) => stats.byStatus[s] > 0).map((s) => (
                        <div key={s} style={{ flex: stats.byStatus[s], background: STATUS_COLOR[s] }} />
                      ))}
                    </div>
                    <ul className="flex flex-col gap-1">
                      {STATUS_ORDER.map((s) => (
                        <li key={s} className="flex items-center gap-3 rounded-[10px] px-2 py-2.5 hover:bg-surface-2">
                          <span className="size-3 rounded-[4px]" style={{ background: STATUS_COLOR[s] }} aria-hidden />
                          <span className="flex-1 text-sm font-medium">{STATUS_LABEL[s]}</span>
                          <span className="text-[15px] font-extrabold" data-testid={`status-${s}`}>
                            {stats.byStatus[s]}
                          </span>
                          <span className="w-11 text-right text-xs text-muted-foreground">{Math.round((stats.byStatus[s] / statusTotal) * 100)}%</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            </div>
          </section>

          <section className="flex flex-col gap-4 rounded-[20px] border bg-card p-5 sm:p-6">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-extrabold">Busiest trips</h2>
                <span className="text-[13px] text-muted-foreground">By tickets paid in the last {days} days</span>
              </div>
              <Link to="/admin/payments" className="text-[13px] font-bold text-[#4f46e5] hover:underline dark:text-[#a5b4fc]">
                See all payments →
              </Link>
            </div>
            {stats.topRoutes.length === 0 ? (
              <p className="text-sm text-muted-foreground">No paid tickets in this period.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-sm" data-testid="top-routes">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                      <th className="w-11 px-2 py-2.5 font-bold">#</th>
                      <th className="px-2 py-2.5 font-bold">Trip</th>
                      <th className="w-[28%] px-2 py-2.5 font-bold">Share</th>
                      <th className="px-2 py-2.5 text-right font-bold">Tickets</th>
                      <th className="px-2 py-2.5 text-right font-bold">Sales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.topRoutes.map((r, i) => {
                      const color = RANK_COLORS[i % RANK_COLORS.length]!;
                      return (
                        <tr key={`${r.originName}>${r.destinationName}`} className="border-t hover:bg-surface-2">
                          <td className="px-2 py-3.5">
                            <span className="inline-grid size-[30px] place-items-center rounded-[9px] text-[13px] font-extrabold text-white" style={{ background: color }}>
                              {i + 1}
                            </span>
                          </td>
                          <td className="px-2 py-3.5">
                            <span className="inline-flex flex-wrap items-center gap-2 font-semibold">
                              {r.originName}
                              <ArrowRight className="size-3.5 text-muted-foreground" role="img" aria-label="to" />
                              {r.destinationName}
                            </span>
                          </td>
                          <td className="px-2 py-3.5">
                            <div className="h-2 overflow-hidden rounded-full bg-track" aria-hidden>
                              <div className="h-full rounded-full" style={{ width: `${Math.round((r.tickets / maxTickets) * 100)}%`, background: color }} />
                            </div>
                          </td>
                          <td className="px-2 py-3.5 text-right font-semibold">{r.tickets}</td>
                          <td className="px-2 py-3.5 text-right font-extrabold">{formatPeso(r.salesCentavos)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
