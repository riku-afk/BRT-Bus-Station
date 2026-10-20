import { useState } from 'react';
import { ScanLine } from 'lucide-react';
import { PageTitle } from '@/components/layout/page-title';
import { Pagination } from '@/components/pagination';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/features/auth/use-auth';
import { useBusOptions } from '@/features/buses/use-buses';
import { useKonduktorOptions } from '@/features/konduktors/use-konduktors';
import { describeScan, RESULT_LABEL, RESULT_STYLE, RESULT_TILE } from '@/features/scans/scan-labels';
import { useAdminScans, type AdminScanFilter } from '@/features/scans/use-scans';
import { cn } from '@/lib/utils';
import { formatManilaDateTime } from '@shared/datetime/ph-time';
import { SCAN_RESULTS } from '@shared/scans/models';

const AMBER = '#f59e0b';
const INK = '#1c1203';
const fieldClass = 'h-11 rounded-xl px-3 text-sm font-semibold focus-visible:ring-[#f59e0b]';

/** Admin: every scan, filterable by konduktor, bus, day (Manila) and result (ADM-04). Monitoring only. */
export function AdminScansPage() {
  const [filter, setFilter] = useState<AdminScanFilter>({});
  const [pageNo, setPageNo] = useState(1);
  const { data: paged, isLoading, error, isPlaceholderData } = useAdminScans(filter, pageNo);
  const scans = paged?.items;
  const { data: konduktors } = useKonduktorOptions();
  const { data: buses } = useBusOptions();
  // A different filter is a different list: start it from the first page.
  const set = (patch: AdminScanFilter) => {
    setFilter((f) => ({ ...f, ...patch }));
    setPageNo(1);
  };

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-4 pb-10 pt-6 sm:px-6 md:px-8 md:pt-7">
      <PageTitle
        icon={ScanLine}
        color={AMBER}
        ink={INK}
        title="Scans"
        description="Every ticket check by every konduktor, including the ones that were refused. The log cannot be changed."
      >
        <span className="rounded-full px-3.5 py-2 text-[13px] font-bold" style={{ background: AMBER, color: INK }}>
          {paged?.total ?? 0} scans
        </span>
      </PageTitle>

      <section className="flex flex-col gap-4 rounded-[20px] border bg-card p-5 sm:p-6" aria-label="Scan log">
        <div className="grid gap-3 rounded-2xl p-4 sm:grid-cols-2 lg:grid-cols-4" style={{ background: 'color-mix(in srgb, #f59e0b 9%, var(--surface))' }}>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="f-konduktor" className="text-[13px] font-bold">
              Konduktor
            </label>
            <NativeSelect id="f-konduktor" value={filter.konduktorId ?? ''} onChange={(e) => set({ konduktorId: e.target.value })} className={fieldClass}>
              <option value="">All</option>
              {konduktors?.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.fullName}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="f-bus" className="text-[13px] font-bold">
              Bus
            </label>
            <NativeSelect id="f-bus" value={filter.busId ?? ''} onChange={(e) => set({ busId: e.target.value })} className={fieldClass}>
              <option value="">All</option>
              {buses?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {b.plateNumber}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="f-date" className="text-[13px] font-bold">
              Day
            </label>
            <Input id="f-date" type="date" value={filter.date ?? ''} onChange={(e) => set({ date: e.target.value })} className={fieldClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="f-result" className="text-[13px] font-bold">
              Result
            </label>
            <NativeSelect id="f-result" value={filter.result ?? ''} onChange={(e) => set({ result: e.target.value as AdminScanFilter['result'] })} className={fieldClass}>
              <option value="">All</option>
              {SCAN_RESULTS.map((r) => (
                <option key={r} value={r}>
                  {RESULT_LABEL[r]}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>

        {isLoading && <Skeleton className="h-24 w-full rounded-2xl" />}
        {error && <p className="text-sm text-destructive">{errorMessage(error)}</p>}
        {scans?.length === 0 && <p className="rounded-2xl border-2 border-dashed p-6 text-center text-sm text-muted-foreground">No scans match.</p>}
        <div className="flex flex-col gap-2">
          {scans?.map((s) => (
            <div key={s.id} className="grid items-center gap-x-4 gap-y-1.5 rounded-[14px] border p-3 text-sm hover:bg-surface-2 md:grid-cols-[2.5rem_9rem_1fr_11rem_7.5rem]">
              <span className="hidden size-10 place-items-center rounded-xl text-white md:grid" style={{ background: RESULT_TILE[s.result], color: s.result === 'already_used' ? INK : '#fff' }} aria-hidden>
                <ScanLine className="size-[18px]" />
              </span>
              <span className="text-xs text-muted-foreground">{formatManilaDateTime(s.scannedAt)}</span>
              <span className="min-w-0">
                {s.referenceCode ? (
                  <>
                    <span className="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-xs font-bold">{s.referenceCode}</span> · {s.originName} → {s.destinationName}
                    {s.quantity && s.quantity > 1 ? ` · ${s.quantity} passengers` : ''}
                  </>
                ) : (
                  <span className="text-muted-foreground">{describeScan(s)}</span>
                )}
              </span>
              <span className="text-xs">
                <span className="font-bold">{s.konduktorName}</span>
                <span className="text-muted-foreground"> · {s.busName ?? 'no bus'}</span>
              </span>
              <span className={cn('w-fit rounded-full px-3 py-1 text-xs font-bold', RESULT_STYLE[s.result])}>{RESULT_LABEL[s.result]}</span>
            </div>
          ))}
        </div>
        {paged && <Pagination page={paged} onPage={setPageNo} busy={isPlaceholderData} label="Scans pages" />}
      </section>
    </div>
  );
}
