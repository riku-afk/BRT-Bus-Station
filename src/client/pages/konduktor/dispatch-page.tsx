import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useStations } from '@/features/stations/use-stations';
import { DispatchButton, DispatchPanel } from '@/features/tracking/dispatch-panel';
import { useDispatchPlan } from '@/features/tracking/use-dispatch-plan';
import { useBusStream } from '@/features/tracking/use-bus-stream';
import { useMyBus } from '@/features/tracking/use-my-bus';
import { useIsWide } from '@/lib/use-media';

/**
 * The phone's Dispatch screen: the destination list, the map (tap a station), the trip and a big Dispatch button in a footer. On a
 * wide screen dispatching is part of My bus, so this goes back there.
 */
export function DispatchPage() {
  const wide = useIsWide();
  const navigate = useNavigate();
  const { data: mine, isLoading } = useMyBus();
  const { data: stations } = useStations();
  const { buses } = useBusStream();
  // Once the bus is on the road there is nothing left to do here.
  const plan = useDispatchPlan(mine, stations, () => navigate('/konduktor', { replace: true }));

  if (wide) return <Navigate to="/konduktor" replace />;
  if (isLoading) return <Skeleton className="m-4 h-64 rounded-2xl" />;
  if (!mine || mine.operation !== 'available' || !mine.station) return <Navigate to="/konduktor" replace />;

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 px-4 pb-32 pt-4">
      {plan.dialog}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-extrabold tracking-tight">Dispatch bus</h1>
        <p className="text-sm text-muted-foreground">
          {mine.bus?.name} is waiting at {mine.station.name}. Where is it going?
        </p>
      </div>
      <DispatchPanel mine={mine} stations={stations} buses={buses} plan={plan} footerButton />
      <div className="fixed inset-x-0 bottom-0 z-30 flex flex-col gap-2 border-t bg-surface px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <DispatchButton plan={plan} mine={mine} tall />
        <Link to="/konduktor" className="flex h-11 items-center justify-center gap-1.5 text-sm font-bold text-muted-foreground">
          <ArrowLeft className="size-4" aria-hidden /> Back to My bus
        </Link>
      </div>
    </div>
  );
}
