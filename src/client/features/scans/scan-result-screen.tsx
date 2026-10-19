import { CheckCircle2, ScanLine, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { formatPeso } from '@shared/money';
import type { ScanResponse } from '@shared/scans/models';

const TITLE: Record<ScanResponse['result'], string> = {
  valid: 'VALID',
  already_used: 'ALREADY USED',
  expired: 'EXPIRED',
  invalid: 'NOT VALID',
};

/**
 * The full-screen answer after a scan (SCN-02, SCN-03, SCN-05): green for a valid ticket, red for anything else, readable
 * at arm's length. It shows where the passenger gets off, never who the passenger is.
 */
export function ScanResultScreen({ result, onNext }: { result: ScanResponse; onNext: () => void }) {
  const ok = result.result === 'valid';
  // The two shelter problems get their own headline: they are not a bad ticket, the passenger is at the wrong place.
  const title =
    result.reason === 'wrong_station'
      ? 'WRONG SHELTER'
      : result.reason === 'wrong_bus'
        ? 'WRONG BUS'
        : result.reason === 'bus_not_at_station'
          ? 'BUS NOT AT A SHELTER'
          : TITLE[result.result];
  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label={`Scan result: ${title}`}
      data-testid="scan-result"
      data-result={result.result}
      className={cn('fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 p-6 text-center text-white', ok ? 'bg-green-700' : 'bg-red-700')}
    >
      {ok ? <CheckCircle2 className="size-24" aria-hidden /> : <XCircle className="size-24" aria-hidden />}
      <div>
        <p className="text-4xl font-extrabold tracking-wide">{title}</p>
        <p className="mt-2 text-xl">{result.message}</p>
      </div>
      {result.ticket && (
        <div className="w-full max-w-sm rounded-lg bg-white/15 p-4">
          {ok && (
            <p className="mb-2 rounded-md bg-white/20 py-1.5 text-2xl font-extrabold" data-testid="admit">
              Admit {result.ticket.quantity} {result.ticket.quantity === 1 ? 'passenger' : 'passengers'}
            </p>
          )}
          <p className="text-sm opacity-80">{ok ? (result.ticket.quantity > 1 ? 'Passengers get off at' : 'Passenger gets off at') : 'Ticket'}</p>
          {ok && <p className="text-2xl font-bold">{result.ticket.destinationName}</p>}
          <p className={cn(ok ? 'mt-1 text-base opacity-90' : 'text-xl font-semibold')}>
            {result.ticket.originName} → {result.ticket.destinationName}
          </p>
          <p className="mt-1 font-mono text-sm tracking-widest opacity-80">
            {result.ticket.referenceCode} · {formatPeso(result.ticket.fareCentavos)}
          </p>
        </div>
      )}
      <Button size="lg" variant="secondary" className="h-14 w-full max-w-sm text-lg" onClick={onNext} autoFocus>
        <ScanLine /> Scan next
      </Button>
    </div>
  );
}
