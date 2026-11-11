import { useEffect, useState, type ReactNode } from 'react';
import { AlertTriangle, CreditCard, Download, X } from 'lucide-react';
import { PageTitle } from '@/components/layout/page-title';
import { Pagination } from '@/components/pagination';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import {
  PAYMENT_STATUSES,
  paymentsExportUrl,
  reviewReasonText,
  useAdminPaymentReport,
  useAdminPayments,
  type AdminPayment,
  type AdminPaymentFilter,
  type PaymentStatus,
} from '@/features/payments/use-admin-payments';
import { cn } from '@/lib/utils';
import { formatManilaDateTime, manilaDateKey } from '@shared/datetime/ph-time';
import { formatPeso } from '@shared/money';

const GREEN = '#15803d';
const fieldClass = 'h-11 rounded-xl px-3 text-sm font-semibold focus-visible:ring-[#15803d]';
const STATUS_STYLE: Record<PaymentStatus, string> = {
  pending: 'bg-[#fef3c7] text-[#92400e] dark:bg-[#d97706]/20 dark:text-[#fcd34d]',
  succeeded: 'bg-[#dcfce7] text-[#166534] dark:bg-[#16a34a]/20 dark:text-[#86efac]',
  failed: 'bg-[#ffe4e6] text-[#9f1239] dark:bg-[#e11d48]/20 dark:text-[#fda4af]',
  cancelled: 'bg-surface-2 text-muted-foreground',
  needs_review: 'bg-[#be123c] text-white',
};
const STATUS_LABEL: Record<PaymentStatus, string> = {
  pending: 'Pending',
  succeeded: 'Paid',
  failed: 'Failed',
  cancelled: 'Closed',
  needs_review: 'Needs review',
};

const DAY_MS = 24 * 3600_000;
const daysAgo = (n: number) => manilaDateKey(new Date(Date.now() - n * DAY_MS));
/** Quick date ranges, in Manila days. */
const RANGES: { label: string; range: () => { from: string; to: string } }[] = [
  { label: 'Today', range: () => ({ from: daysAgo(0), to: daysAgo(0) }) },
  { label: 'Yesterday', range: () => ({ from: daysAgo(1), to: daysAgo(1) }) },
  { label: 'Last 7 days', range: () => ({ from: daysAgo(6), to: daysAgo(0) }) },
  { label: 'Last 30 days', range: () => ({ from: daysAgo(29), to: daysAgo(0) }) },
  { label: 'This month', range: () => ({ from: `${daysAgo(0).slice(0, 8)}01`, to: daysAgo(0) }) },
];

const methodLabel = (m: string) => m.replace(/_/g, ' ').toUpperCase();

/** Admin: payments, filterable by day range, status, provider, method and reference, with a report and a CSV export (PAY-06, PAY-07). */
export function AdminPaymentsPage() {
  const [filter, setFilter] = useState<AdminPaymentFilter>({});
  const [search, setSearch] = useState('');
  const [pageNo, setPageNo] = useState(1);
  const { data: paged, isLoading, error, isPlaceholderData } = useAdminPayments(filter, pageNo);
  const { data: report, isLoading: reportLoading } = useAdminPaymentReport(filter);
  const payments = paged?.items;
  const filtered = Object.values(filter).some(Boolean);

  // A different filter is a different list: start it from the first page.
  const set = (patch: AdminPaymentFilter) => {
    setFilter((f) => ({ ...f, ...patch }));
    setPageNo(1);
  };
  // The reference search waits until typing pauses.
  useEffect(() => {
    const t = setTimeout(() => {
      setFilter((f) => (f.q === (search.trim() || undefined) ? f : { ...f, q: search.trim() || undefined }));
      setPageNo(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);
  const clear = () => {
    setFilter({});
    setSearch('');
    setPageNo(1);
  };
  const activeRange = RANGES.find((r) => {
    const { from, to } = r.range();
    return filter.from === from && filter.to === to;
  });
  const rangeText = filter.from || filter.to ? `${filter.from ?? 'the start'} to ${filter.to ?? 'today'}` : 'all time';

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-4 pb-10 pt-6 sm:px-6 md:px-8 md:pt-7">
      <PageTitle
        icon={CreditCard}
        color={GREEN}
        title="Payments"
        description="A ticket becomes paid only from a verified payment notice. Money that could not be applied to its ticket is kept here for you to look at; there is no refund flow in this proof of concept."
      >
        <span className="rounded-full bg-[#15803d] px-3.5 py-2 text-[13px] font-bold text-white">{paged?.total ?? 0} payments</span>
        <a
          href={paymentsExportUrl(filter)}
          download
          className={cn('inline-flex min-h-10 items-center gap-2 rounded-full border-2 border-[#15803d] px-3.5 py-1.5 text-[13px] font-bold text-[#15803d] hover:bg-[#15803d] hover:text-white dark:text-[#86efac]', paged?.total === 0 && 'pointer-events-none opacity-50')}
          aria-disabled={paged?.total === 0}
        >
          <Download className="size-4" aria-hidden /> Export CSV
        </a>
      </PageTitle>

      <section className="flex flex-col gap-4 rounded-[20px] border bg-card p-5 sm:p-6" aria-label="Filters">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold">Filter</h2>
          <div className="flex flex-wrap gap-2">
            {RANGES.map((r) => (
              <button
                key={r.label}
                type="button"
                onClick={() => set(r.range())}
                aria-pressed={activeRange === r}
                className={cn('min-h-9 rounded-full border px-3 text-xs font-bold hover:bg-surface-2', activeRange === r && 'border-[#15803d] bg-[#15803d] text-white hover:bg-[#15803d]')}
              >
                {r.label}
              </button>
            ))}
            {filtered && (
              <button type="button" onClick={clear} className="inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-xs font-bold text-muted-foreground hover:bg-surface-2">
                <X className="size-3.5" aria-hidden /> Clear
              </button>
            )}
          </div>
        </div>
        <div className="grid gap-3 rounded-2xl p-4 sm:grid-cols-2 lg:grid-cols-6" style={{ background: 'color-mix(in srgb, #15803d 8%, var(--surface))' }}>
          <Field id="f-from" label="From">
            <Input id="f-from" type="date" value={filter.from ?? ''} max={filter.to} onChange={(e) => set({ from: e.target.value || undefined })} className={fieldClass} />
          </Field>
          <Field id="f-to" label="To">
            <Input id="f-to" type="date" value={filter.to ?? ''} min={filter.from} onChange={(e) => set({ to: e.target.value || undefined })} className={fieldClass} />
          </Field>
          <Field id="f-status" label="Status">
            <NativeSelect id="f-status" value={filter.status ?? ''} onChange={(e) => set({ status: (e.target.value || undefined) as PaymentStatus | undefined })} className={fieldClass}>
              <option value="">All</option>
              {PAYMENT_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="f-provider" label="Provider">
            <NativeSelect id="f-provider" value={filter.provider ?? ''} onChange={(e) => set({ provider: (e.target.value || undefined) as AdminPaymentFilter['provider'] })} className={fieldClass}>
              <option value="">All</option>
              <option value="mock">Demo (mock)</option>
              <option value="pisopay">PisoPay</option>
            </NativeSelect>
          </Field>
          <Field id="f-method" label="Method">
            <NativeSelect id="f-method" value={filter.method ?? ''} onChange={(e) => set({ method: e.target.value || undefined })} className={fieldClass}>
              <option value="">All</option>
              {report?.methods.map((m) => (
                <option key={m} value={m}>
                  {methodLabel(m)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field id="f-q" label="Ticket reference">
            <Input id="f-q" type="search" placeholder="BRT-…" value={search} maxLength={40} onChange={(e) => setSearch(e.target.value)} className={fieldClass} />
          </Field>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-[20px] border bg-card p-5 sm:p-6" aria-label="Report">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-extrabold">Report</h2>
          <p className="text-xs font-semibold text-muted-foreground">Payments created {rangeText}, Manila time</p>
        </div>
        {reportLoading && <Skeleton className="h-28 w-full rounded-2xl" />}
        {report && (
          <>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Stat label="Collected" value={formatPeso(report.totals.paidCentavos)} note={`${report.totals.paidCount} paid payment${report.totals.paidCount === 1 ? '' : 's'}`} tone="good" />
              <Stat label="Payments" value={String(report.totals.count)} note={`${formatPeso(report.totals.amountCentavos)} attempted`} />
              <Stat label="Pending" value={formatPeso(report.totals.pendingCentavos)} note="waiting for the payment notice" />
              <Stat
                label="Needs review"
                value={String(report.totals.needsReviewCount)}
                note={`${formatPeso(report.totals.needsReviewCentavos)} not applied`}
                tone={report.totals.needsReviewCount > 0 ? 'bad' : undefined}
                onClick={report.totals.needsReviewCount > 0 && filter.status !== 'needs_review' ? () => set({ status: 'needs_review' }) : undefined}
              />
            </div>
            <div className="grid gap-4 lg:grid-cols-3">
              <Breakdown title="By status" empty="No payments.">
                {report.byStatus.map((s) => (
                  <Row key={s.status} left={<span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', STATUS_STYLE[s.status])}>{STATUS_LABEL[s.status]}</span>} count={s.count} amount={s.amountCentavos} />
                ))}
              </Breakdown>
              <Breakdown title="Collected by method" empty="Nothing collected.">
                {report.byMethod.map((m) => (
                  <Row key={m.method} left={<span className="font-bold">{methodLabel(m.method)}</span>} count={m.count} amount={m.amountCentavos} />
                ))}
              </Breakdown>
              <Breakdown title="Collected by day" empty="No payments." scroll>
                {report.byDay.map((d) => (
                  <Row key={d.day} left={<span className="font-mono text-xs font-bold">{d.day}</span>} count={d.paidCount} of={d.count} amount={d.paidCentavos} />
                ))}
              </Breakdown>
            </div>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3.5 rounded-[20px] border bg-card p-5 sm:p-6" aria-label="Payments">
        <h2 className="text-lg font-extrabold">Payments</h2>
        {(report?.totals.needsReviewCount ?? 0) > 0 && filter.status !== 'needs_review' && (
          <button
            type="button"
            onClick={() => set({ status: 'needs_review' })}
            className="flex items-center gap-2 rounded-2xl border border-[#e11d48]/40 bg-[#e11d48]/10 p-3 text-left text-sm font-bold text-[#be123c] hover:bg-[#e11d48]/15 dark:text-[#fb7185]"
          >
            <AlertTriangle className="size-4 shrink-0" aria-hidden /> {report!.totals.needsReviewCount} payment{report!.totals.needsReviewCount === 1 ? '' : 's'} need
            {report!.totals.needsReviewCount === 1 ? 's' : ''} review. Show them.
          </button>
        )}
        {isLoading && <Skeleton className="h-24 w-full rounded-2xl" />}
        {error && <p className="text-sm text-destructive">{error.message}</p>}
        {payments?.length === 0 && (
          <p className="rounded-2xl border-2 border-dashed p-6 text-center text-sm text-muted-foreground">{filtered ? 'No payments match the filter.' : 'No payments yet.'}</p>
        )}
        <div className="flex flex-col gap-2">
          {payments?.map((p) => <PaymentRow key={p.id} p={p} />)}
        </div>
        {paged && <Pagination page={paged} onPage={setPageNo} busy={isPlaceholderData} label="Payments pages" />}
      </section>
    </div>
  );
}

function PaymentRow({ p }: { p: AdminPayment }) {
  return (
    <div className="grid items-center gap-x-4 gap-y-1.5 rounded-[14px] border p-3 text-sm hover:bg-surface-2 md:grid-cols-[9rem_1fr_6rem_8rem_7.5rem]">
      <span className="text-xs text-muted-foreground">{formatManilaDateTime(p.createdAt)}</span>
      <span className="min-w-0">
        <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs font-bold">{p.referenceCode}</span> · {p.originName} → {p.destinationName}
      </span>
      <span className="font-extrabold">{formatPeso(p.amountCentavos)}</span>
      <span className="text-xs font-bold text-muted-foreground">{p.method ? methodLabel(p.method) : p.provider}</span>
      <span className={`w-fit rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
      {p.reviewReason && <p className="text-xs font-semibold text-[#be123c] dark:text-[#fb7185] md:col-span-5">{reviewReasonText(p.reviewReason)}</p>}
    </div>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-bold">
        {label}
      </label>
      {children}
    </div>
  );
}

function Stat({ label, value, note, tone, onClick }: { label: string; value: string; note: string; tone?: 'good' | 'bad'; onClick?: () => void }) {
  const body = (
    <>
      <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={cn('text-2xl font-extrabold tabular-nums', tone === 'good' && 'text-[#15803d] dark:text-[#86efac]', tone === 'bad' && 'text-[#be123c] dark:text-[#fb7185]')}>{value}</span>
      <span className="text-xs text-muted-foreground">{note}</span>
    </>
  );
  const cls = 'flex flex-col gap-1 rounded-2xl border p-4 text-left';
  return onClick ? (
    <button type="button" onClick={onClick} className={cn(cls, 'hover:bg-surface-2')}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

function Breakdown({ title, empty, scroll, children }: { title: string; empty: string; scroll?: boolean; children: ReactNode[] }) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-2xl border p-4">
      <h3 className="text-sm font-extrabold">{title}</h3>
      {children.length === 0 ? <p className="text-xs text-muted-foreground">{empty}</p> : <div className={cn('flex flex-col divide-y', scroll && 'max-h-64 overflow-y-auto pr-1')}>{children}</div>}
    </div>
  );
}

function Row({ left, count, of, amount }: { left: ReactNode; count: number; of?: number; amount: number }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="min-w-0 truncate">{left}</span>
      <span className="flex shrink-0 items-baseline gap-3 tabular-nums">
        <span className="text-xs text-muted-foreground">{of !== undefined ? `${count} of ${of}` : count}</span>
        <span className="w-24 text-right font-extrabold">{formatPeso(amount)}</span>
      </span>
    </div>
  );
}
