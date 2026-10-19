import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ScanLine } from 'lucide-react';
import { Pagination } from '@/components/pagination';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/features/auth/use-auth';
import { describeScan, formatDayHeading, RESULT_LABEL, RESULT_STYLE } from '@/features/scans/scan-labels';
import { useMyScans } from '@/features/scans/use-scans';
import { cn } from '@/lib/utils';
import { formatManilaTime, manilaDateKey } from '@shared/datetime/ph-time';
import type { ScanHistoryEntry } from '@shared/scans/models';

/** The konduktor's own scans, five to a page, grouped under their day (Manila) with that day's count (SCN-06). */
export function ScanHistoryPage() {
  const [pageNo, setPageNo] = useState(1);
  const { data, isLoading, error, isPlaceholderData } = useMyScans(pageNo, 14);

  // The scans on this page, under their day. The counts in each heading are the whole day, from the server, not just this page.
  const groups: { date: string; scans: ScanHistoryEntry[] }[] = [];
  for (const s of data?.items ?? []) {
    const date = manilaDateKey(s.scannedAt);
    const last = groups[groups.length - 1];
    if (last?.date === date) last.scans.push(s);
    else groups.push({ date, scans: [s] });
  }
  const summary = (date: string) => data?.days.find((d) => d.date === date);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Scan history</h1>
        <Button asChild size="sm">
          <Link to="/konduktor/scan">
            <ScanLine /> Scan
          </Link>
        </Button>
      </div>
      {isLoading && <Skeleton className="h-32 w-full" />}
      {error && <p className="text-sm text-destructive">{errorMessage(error)}</p>}
      {data?.total === 0 && <p className="text-sm text-muted-foreground">You have not scanned any tickets in the last 14 days.</p>}
      {groups.map(({ date, scans }) => {
        const day = summary(date);
        return (
          <Card key={date} data-testid={`day-${date}`}>
            <CardHeader>
              <CardTitle className="text-base">{formatDayHeading(date)}</CardTitle>
              {day && (
                <CardDescription>
                  {day.total} scan{day.total === 1 ? '' : 's'} · {day.valid} valid · {day.rejected} rejected
                </CardDescription>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5">
              {scans.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-2 rounded border p-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate">{s.originName && s.destinationName ? `${s.originName} → ${s.destinationName}` : describeScan(s)}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatManilaTime(s.scannedAt)}
                      {s.referenceCode ? ` · ${s.referenceCode}` : ''}
                      {s.quantity && s.quantity > 1 ? ` · ${s.quantity} passengers` : ''}
                    </p>
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', RESULT_STYLE[s.result])}>{RESULT_LABEL[s.result]}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })}
      {data && <Pagination page={data} onPage={setPageNo} busy={isPlaceholderData} label="History pages" />}
    </div>
  );
}
