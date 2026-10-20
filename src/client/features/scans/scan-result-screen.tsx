import { CheckCircle2, ScanLine, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatPeso } from '@shared/money';
import type { ScanResponse } from '@shared/scans/models';

const TITLE: Record<ScanResponse['result'], string> = {
  valid: 'VALID',
  already_used: 'ALREADY USED',
  expired: 'EXPIRED',
  invalid: 'NOT VALID',
};

/** Valid is green, already used amber (dark text), anything else a deep red; a muted slate for a code that is not a ticket at all. */
const TONE: Record<ScanResponse['result'], { card: string; dark: boolean }> = {
  valid: { card: 'bg-green-600 text-white', dark: false },
  already_used: { card: 'bg-amber-600 text-[#1c1203]', dark: true },
  expired: { card: 'bg-slate-600 text-white', dark: false },
  invalid: { card: 'bg-rose-700 text-white', dark: false },
};

/**
 * The answer after a scan (SCN-02, SCN-03, SCN-05): a big coloured card, readable at arm's length: a bottom sheet over a dimmed
 * screen on a phone, so the result sits where the thumb is, a centred card on a wide screen. It shows where the passenger gets
 * off, never who the passenger is.
 */
export function ScanResultScreen({ result, onNext }: { result: ScanResponse; onNext: () => void }) {
  const ok = result.result === 'valid';
  const tone = TONE[result.result];
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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 md:items-center md:p-6">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={`Scan result: ${title}`}
        data-testid="scan-result"
        data-result={result.result}
        className={cn('flex w-full max-w-md flex-col gap-3.5 rounded-t-[26px] px-[18px] pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3 md:rounded-[26px] md:px-6 md:py-6', tone.card)}
      >
        <span className={cn('mx-auto h-[5px] w-11 rounded-full md:hidden', tone.dark ? 'bg-black/30' : 'bg-white/50')} aria-hidden />
        <div className="flex items-center gap-3.5">
          <span className={cn('grid size-14 shrink-0 place-items-center rounded-full', tone.dark ? 'bg-black/10' : 'bg-white/20')}>
            {ok ? <CheckCircle2 className="size-8" aria-hidden /> : <XCircle className="size-8" aria-hidden />}
          </span>
          <div className="min-w-0">
            <p className="text-2xl font-extrabold tracking-wide sm:text-3xl">{title}</p>
            <p className="mt-0.5 text-[15px] font-semibold opacity-95">{result.message}</p>
          </div>
        </div>
        {result.ticket && (
          <div className={cn('rounded-2xl p-4', tone.dark ? 'bg-white/40' : 'bg-white/15')}>
            {ok && (
              <p className="mb-2 rounded-xl bg-white/25 py-1.5 text-center text-2xl font-extrabold" data-testid="admit">
                Admit {result.ticket.quantity} {result.ticket.quantity === 1 ? 'passenger' : 'passengers'}
              </p>
            )}
            <p className="text-sm opacity-85">{ok ? (result.ticket.quantity > 1 ? 'Passengers get off at' : 'Passenger gets off at') : 'Ticket'}</p>
            {ok && <p className="text-2xl font-extrabold">{result.ticket.destinationName}</p>}
            <p className={cn(ok ? 'mt-1 text-base opacity-90' : 'text-xl font-bold')}>
              {result.ticket.originName} → {result.ticket.destinationName}
            </p>
            <p className="mt-1 font-mono text-sm tracking-widest opacity-85">
              {result.ticket.referenceCode} · {formatPeso(result.ticket.fareCentavos)}
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={onNext}
          autoFocus
          className={cn('flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl text-lg font-extrabold transition hover:brightness-105', tone.dark ? 'bg-[#1c1203] text-white' : 'bg-white text-slate-900')}
        >
          <ScanLine className="size-5" aria-hidden /> Scan next ticket
        </button>
      </div>
    </div>
  );
}
