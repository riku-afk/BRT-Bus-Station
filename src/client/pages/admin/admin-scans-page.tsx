import { useState } from 'react';
import { Pagination } from '@/components/pagination';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/features/auth/use-auth';
import { useBusOptions } from '@/features/buses/use-buses';
import { useKonduktorOptions } from '@/features/konduktors/use-konduktors';
import { describeScan, RESULT_LABEL, RESULT_STYLE } from '@/features/scans/scan-labels';
import { useAdminScans, type AdminScanFilter } from '@/features/scans/use-scans';
import { cn } from '@/lib/utils';
import { formatManilaDateTime } from '@shared/datetime/ph-time';
import { SCAN_RESULTS } from '@shared/scans/models';

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
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Scan log</CardTitle>
          <CardDescription>Every ticket check by every konduktor, including the ones that were refused. The log cannot be changed.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-konduktor">Konduktor</Label>
              <NativeSelect id="f-konduktor" value={filter.konduktorId ?? ''} onChange={(e) => set({ konduktorId: e.target.value })}>
                <option value="">All</option>
                {konduktors?.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.fullName}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-bus">Bus</Label>
              <NativeSelect id="f-bus" value={filter.busId ?? ''} onChange={(e) => set({ busId: e.target.value })}>
                <option value="">All</option>
                {buses?.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} · {b.plateNumber}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-date">Day</Label>
              <Input id="f-date" type="date" value={filter.date ?? ''} onChange={(e) => set({ date: e.target.value })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-result">Result</Label>
              <NativeSelect id="f-result" value={filter.result ?? ''} onChange={(e) => set({ result: e.target.value as AdminScanFilter['result'] })}>
                <option value="">All</option>
                {SCAN_RESULTS.map((r) => (
                  <option key={r} value={r}>
                    {RESULT_LABEL[r]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </div>

          {isLoading && <Skeleton className="h-24 w-full" />}
          {error && <p className="text-sm text-destructive">{errorMessage(error)}</p>}
          {scans?.length === 0 && <p className="text-sm text-muted-foreground">No scans match.</p>}
          {scans?.map((s) => (
            <div key={s.id} className="grid items-center gap-x-3 gap-y-1 rounded border p-2 text-sm md:grid-cols-[9rem_1fr_9rem_7rem]">
              <span className="text-xs text-muted-foreground">{formatManilaDateTime(s.scannedAt)}</span>
              <span className="min-w-0">
                {s.referenceCode ? (
                  <>
                    <span className="font-mono text-xs">{s.referenceCode}</span> · {s.originName} → {s.destinationName}
                    {s.quantity && s.quantity > 1 ? ` · ${s.quantity} passengers` : ''}
                  </>
                ) : (
                  <span className="text-muted-foreground">{describeScan(s)}</span>
                )}
              </span>
              <span className="text-xs">
                {s.konduktorName}
                <span className="text-muted-foreground"> · {s.busName ?? 'no bus'}</span>
              </span>
              <span className={cn('justify-self-start rounded-full px-2 py-0.5 text-xs font-medium', RESULT_STYLE[s.result])}>{RESULT_LABEL[s.result]}</span>
            </div>
          ))}
          {paged && <Pagination page={paged} onPage={setPageNo} busy={isPlaceholderData} label="Scans pages" />}
        </CardContent>
      </Card>
    </div>
  );
}
