import { CheckCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/confirm-dialog';
import { errorMessage } from '@/features/auth/use-auth';
import { useCompleteRide, useRide } from '@/features/scans/use-scans';
import { cn } from '@/lib/utils';
import { formatManilaTime } from '@shared/datetime/ph-time';

const people = (n: number) => `${n} passenger${n === 1 ? '' : 's'}`;

/**
 * How many passengers are on the konduktor's bus (from the valid scans since the last completed ride), and the Complete ride
 * button: once the bus has reached its destination it clears the count, so the next scans start from zero again.
 */
export function PassengerCount({ compact }: { compact?: boolean }) {
  const { data: ride } = useRide();
  const complete = useCompleteRide();
  const { ask, dialog } = useConfirm();

  async function finish() {
    if (!ride) return;
    const ok = await ask({
      title: 'Complete this ride?',
      description: `${people(ride.passengers)} will be cleared and the count starts again from zero. Do this when your bus has reached its destination.`,
      confirmLabel: 'Complete ride',
    });
    if (!ok) return;
    complete.mutate(undefined, {
      onSuccess: (done) => toast.success(`Ride complete: ${people(done.passengers)}. The count starts again from zero.`),
      onError: (e) => toast.error(errorMessage(e)),
    });
  }

  if (!ride) return null;
  const hint = ride.canComplete ? null : ride.atShelter === null ? 'You can complete the ride when your bus arrives.' : 'Scan tickets to start counting.';

  return (
    <section
      className={cn('flex flex-col gap-3 rounded-[20px] border bg-card', compact ? 'p-3.5' : 'p-[18px] sm:p-[22px]')}
      aria-label="Passengers on board"
      data-testid="passenger-count"
    >
      {dialog}
      <div className="flex items-center gap-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl text-[#166534]" style={{ background: 'color-mix(in srgb, #16a34a 14%, var(--surface))' }}>
          <Users className="size-5" aria-hidden />
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-xs font-bold text-muted-foreground">Passengers on board</span>
          <span className="flex items-baseline gap-2">
            <span className={cn('font-extrabold leading-none tabular-nums', compact ? 'text-2xl' : 'text-[34px]')} data-testid="passenger-total">
              {ride.passengers}
            </span>
            <span className="text-xs text-muted-foreground">
              from {ride.tickets} ticket{ride.tickets === 1 ? '' : 's'}
              {ride.since ? ` · since ${formatManilaTime(ride.since)}` : ''}
            </span>
          </span>
        </div>
      </div>
      <button
        type="button"
        onClick={finish}
        disabled={!ride.canComplete || complete.isPending}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#16a34a] text-sm font-extrabold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
      >
        <CheckCheck className="size-[18px]" aria-hidden /> {complete.isPending ? 'Completing…' : 'Complete ride'}
      </button>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </section>
  );
}
