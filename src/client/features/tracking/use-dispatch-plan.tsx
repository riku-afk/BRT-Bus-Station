import { useState } from 'react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/confirm-dialog';
import { errorMessage } from '@/features/auth/use-auth';
import type { Station } from '@/features/stations/use-stations';
import type { MyBus } from '@shared/tracking/models';
import { useDispatchMyBus, useSetDestination } from './use-my-bus';

/**
 * Where the konduktor's waiting bus will go, and sending it. The chosen destination is also what passengers at the shelter see
 * ("Headed to X"), so every choice is saved at once. The saved plan is the truth (it follows another device, and is cleared when the
 * bus leaves); `picked` only bridges the moment between a tap and the server's answer. '' means "the end of the line".
 */
export function useDispatchPlan(mine: MyBus | undefined, stations: readonly Station[] | undefined, onDispatched?: () => void) {
  const setPlan = useSetDestination();
  const dispatch = useDispatchMyBus();
  const { ask, dialog } = useConfirm();
  const [picked, setPicked] = useState<string | null>(null);
  const fail = (e: unknown) => toast.error(errorMessage(e));

  const destinationId = picked ?? mine?.plannedDestination?.id ?? '';
  function choose(id: string) {
    setPicked(id);
    setPlan.mutate(id || null, { onError: fail, onSettled: () => setPicked(null) });
  }

  // Where the bus is going, as the map and the summary show it: the chosen station, or the end of the line.
  const targetId = destinationId || mine?.defaultDestination?.id || '';
  const target = stations?.find((s) => s.id === targetId);
  const origin = stations?.find((s) => s.id === mine?.station?.id);
  const tripLine =
    origin && target
      ? (() => {
          const count = Math.abs(target.sequence - origin.sequence);
          const km = Math.abs(target.distanceMeters - origin.distanceMeters) / 1000;
          return `${count} station${count === 1 ? '' : 's'} · about ${km.toFixed(1)} km`;
        })()
      : null;

  /** Tapping a station on the map chooses it as the destination; tapping where the bus waits does nothing. */
  function pickOnMap(stationId: string) {
    if (stationId === mine?.station?.id) return;
    choose(stationId === mine?.defaultDestination?.id ? '' : stationId);
  }

  async function send() {
    if (!mine?.defaultDestination) return;
    const ok = await ask({
      title: `Dispatch ${mine.bus?.name}?`,
      description: (
        <div className="flex flex-col gap-2">
          <p className="rounded-md border bg-muted/40 p-2.5 font-medium text-foreground">
            {mine.station?.name} → {target?.name}
          </p>
          {tripLine && <p>{tripLine}</p>}
          <p>Once it leaves, it cannot be called back.</p>
        </div>
      ),
      confirmLabel: 'Dispatch now',
    });
    if (!ok) return;
    dispatch.mutate(destinationId || undefined, {
      onSuccess: (result) => {
        toast.success(`${result.busName} is on its way: ${result.originName} → ${result.destinationName}`);
        setPicked(null);
        onDispatched?.();
      },
      onError: fail,
    });
  }

  return { destinationId, choose, targetId, target, origin, tripLine, pickOnMap, send, dispatching: dispatch.isPending, dialog };
}

export type DispatchPlan = ReturnType<typeof useDispatchPlan>;
