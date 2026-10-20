import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, History, ScanLine, X } from 'lucide-react';
import { PageTitle } from '@/components/layout/page-title';
import { Pagination } from '@/components/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/features/auth/use-auth';
import { describeScan, formatDayHeading, RESULT_LABEL, RESULT_STYLE, RESULT_TILE } from '@/features/scans/scan-labels';
import { useMyScans, type HistoryFilter } from '@/features/scans/use-scans';
import { cn } from '@/lib/utils';
import { formatManilaTime, manilaDateKey } from '@shared/datetime/ph-time';
import type { ScanHistoryEntry } from '@shared/scans/models';

const FILTERS: { key: HistoryFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'valid', label: 'Valid' },
  { key: 'rejected', label: 'Rejected' },
];

function Row({ s }: { s: ScanHistoryEntry }) {
  const ok = s.result === 'valid';
  return (
    <div className="flex items-center gap-3.5 rounded-2xl border p-3 hover:bg-surface-2 sm:px-3.5">
      <span className="grid size-[42px] shrink-0 place-items-center rounded-xl" style={{ background: RESULT_TILE[s.result], color: s.result === 'already_used' ? '#1c1203' : '#fff' }} aria-hidden>
        {ok ? <Check className="size-[18px]" strokeWidth={2.6} /> : <X className="size-[18px]" strokeWidth={2.6} />}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="break-words text-[15px] font-bold">{s.originName && s.destinationName ? `${s.originName} → ${s.destinationName}` : describeScan(s)}</span>
        <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {formatManilaTime(s.scannedAt)}
          {s.referenceCode && <span className="rounded-md bg-surface-2 px-2 py-0.5 font-mono font-semibold text-foreground">{s.referenceCode}</span>}
          {s.quantity && s.quantity > 1 ? `${s.quantity} passengers` : ''}
        </span>
      </div>
      <span className={cn('shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-xs font-extrabold', RESULT_STYLE[s.result])}>{RESULT_LABEL[s.result]}</span>
    </div>
  );
}

/** The konduktor's own scans, five to a page, grouped under their day (Manila) with that day's count (SCN-06). */
export function ScanHistoryPage() {
  const [pageNo, setPageNo] = useState(1);
  const [filter, setFilter] = useState<HistoryFilter>('all');
  const { data, isLoading, error, isPlaceholderData } = useMyScans(pageNo, 14, filter);

  // The scans on this page, under their day. The counts in each heading are the whole day, from the server, not just this page.
  const groups: { date: string; scans: ScanHistoryEntry[] }[] = [];
  for (const s of data?.items ?? []) {
    const date = manilaDateKey(s.scannedAt);
    const last = groups[groups.length - 1];
    if (last?.date === date) last.scans.push(s);
    else groups.push({ date, scans: [s] });
  }
  const summary = (date: string) => data?.days.find((d) => d.date === date);
  const today = manilaDateKey(new Date());
  const todays = summary(today);

  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-4 px-4 pb-6 pt-4 sm:px-6 md:gap-5 md:px-8 md:pb-10 md:pt-7">
      <PageTitle icon={History} color="#4f46e5" title="Scan history" description="Every ticket you’ve checked, newest first.">
        <Link to="/konduktor/scan" className="hidden h-12 items-center gap-2 rounded-xl bg-[#f59e0b] px-5 text-sm font-extrabold text-[#1c1203] hover:brightness-105 sm:flex">
          <ScanLine className="size-4" aria-hidden /> Scan a ticket
        </Link>
      </PageTitle>

      <section className="flex flex-wrap items-center justify-between gap-4 rounded-[22px] bg-[#312e81] p-5 text-white sm:p-6" aria-label="Today">
        <div className="flex flex-col gap-1">
          <span className="text-[13px] font-bold text-[#c7d2fe]">Today</span>
          <span className="text-xl font-extrabold sm:text-2xl">{formatDayHeading(today)}</span>
        </div>
        <div className="grid w-full grid-cols-3 gap-2.5 sm:flex sm:w-auto">
          <div className="flex flex-col rounded-[14px] bg-white/10 px-4 py-3 sm:min-w-24">
            <span className="text-xs font-bold text-[#c7d2fe]">Scans</span>
            <span className="text-[26px] font-extrabold">{todays?.total ?? 0}</span>
          </div>
          <div className="flex flex-col rounded-[14px] bg-[#16a34a] px-4 py-3 sm:min-w-24">
            <span className="text-xs font-bold">Valid</span>
            <span className="text-[26px] font-extrabold">{todays?.valid ?? 0}</span>
          </div>
          <div className="flex flex-col rounded-[14px] bg-[#e11d48] px-4 py-3 sm:min-w-24">
            <span className="text-xs font-bold">Rejected</span>
            <span className="text-[26px] font-extrabold">{todays?.rejected ?? 0}</span>
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-[22px] border bg-card p-4 sm:p-[22px]" aria-label="Scans">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold">Scans</h2>
          <div role="group" aria-label="Filter scans" className="grid w-full grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1 sm:flex sm:w-auto">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                aria-pressed={filter === f.key}
                onClick={() => {
                  setFilter(f.key);
                  setPageNo(1);
                }}
                className={cn('h-11 rounded-[9px] px-4 text-[13px] font-extrabold transition-colors sm:h-10', filter === f.key ? 'bg-[#4f46e5] text-white' : 'text-muted-foreground hover:text-foreground')}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading && <Skeleton className="h-32 w-full rounded-2xl" />}
        {error && <p className="text-sm text-destructive">{errorMessage(error)}</p>}
        {data?.total === 0 && (
          <p className="rounded-2xl border-2 border-dashed p-6 text-center text-sm text-muted-foreground">
            {filter === 'all' ? 'You have not scanned any tickets in the last 14 days.' : `No ${filter} scans in the last 14 days.`}
          </p>
        )}
        {groups.map(({ date, scans }) => {
          const day = summary(date);
          return (
            <div key={date} className="flex flex-col gap-2" data-testid={`day-${date}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <h3 className="text-sm font-extrabold">{formatDayHeading(date)}</h3>
                {day && (
                  <span className="text-xs text-muted-foreground">
                    {day.total} scan{day.total === 1 ? '' : 's'} · {day.valid} valid · {day.rejected} rejected
                  </span>
                )}
              </div>
              {scans.map((s) => (
                <Row key={s.id} s={s} />
              ))}
            </div>
          );
        })}
        {data && <Pagination page={data} onPage={setPageNo} busy={isPlaceholderData} label="History pages" />}
      </section>
    </div>
  );
}
