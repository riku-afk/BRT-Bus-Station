import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { StationMap } from '@/components/map/station-map';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage, useCurrentUser } from '@/features/auth/use-auth';
import { useBusEtas, useStationEta } from '@/features/eta/use-eta';
import { useStations } from '@/features/stations/use-stations';
import { goToCheckout, useBuyTicket } from '@/features/tickets/use-tickets';
import { BusList } from '@/features/tracking/bus-list';
import { ShelterDialog, type Viewer } from '@/features/tracking/shelter-dialog';
import { useBusStream } from '@/features/tracking/use-bus-stream';
import type { BusPosition } from '@shared/tracking/models';
import { groupParkedByStation } from '@shared/tracking/stations';
import { haversineMeters } from '@shared/geo/route';

/** A bus this close to a shelter, and stopped, is at that shelter. */
const STOPPED_AT_SHELTER_METERS = 60;

/**
 * The passenger map. Tapping a shelter opens a pop-up with the buses waiting there (where each is headed, when it leaves, and a
 * Buy ticket button), and the buses arriving. A ticket is bought on a bus: its shelter and destination are the bus's.
 */
export function HomePage() {
  const { data: stations, isLoading, error } = useStations();
  const { data: user } = useCurrentUser();
  const buy = useBuyTicket();
  const navigate = useNavigate();
  const { buses, connected } = useBusStream();
  const etas = useBusEtas();
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);
  // The shelter whose pop-up is open (set by tapping it).
  const [shelterId, setShelterId] = useState<string | null>(null);
  const waiting = useMemo(() => groupParkedByStation(buses), [buses]);
  const waitingStationIds = useMemo(() => new Set(waiting.keys()), [waiting]);
  const arrivals = useStationEta(shelterId);
  const shelter = shelterId ? stations?.find((s) => s.id === shelterId) : undefined;
  const viewer: Viewer = !user ? 'guest' : user.role === 'passenger' ? 'passenger' : 'other';

  /**
   * Tapping a bus that is stopped at a shelter opens that shelter (the bus is what people see there, so it is what they tap); tapping a
   * bus on the road just selects it for its details.
   */
  function tapBus(busId: string) {
    const bus = buses.find((b) => b.busId === busId);
    const at = bus && bus.atStation && stations ? stations.find((s) => haversineMeters(s, bus) < STOPPED_AT_SHELTER_METERS) : undefined;
    if (at) setShelterId(at.id);
    else setSelectedBusId((cur) => (cur === busId ? null : busId));
  }

  function buyOn(bus: BusPosition, quantity: number) {
    buy.mutate(
      { busId: bus.busId, quantity },
      {
        onSuccess: ({ ticket, checkout, checkoutError }) => {
          setShelterId(null);
          if (checkout) return goToCheckout(checkout.checkoutUrl, navigate);
          // The ticket exists; paying can be retried from its page.
          toast.error(checkoutError ?? 'Could not start the payment');
          navigate(`/tickets/${ticket.id}`);
        },
        onError: (e) => toast.error(errorMessage(e)),
      },
    );
  }

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-4 p-4">
      <section aria-label="Station map">
        {isLoading && <Skeleton className="h-[60vh] w-full" />}
        {error && <p className="text-sm text-destructive">Could not load stations: {error.message}</p>}
        {stations && (
          <>
            <p className="mb-2 text-sm text-muted-foreground">Tap a shelter to see the buses waiting there and the ones arriving, and to buy a ticket. Green-ringed shelters have a bus waiting.</p>
            <StationMap
              stations={stations}
              originId={shelterId}
              onStationClick={setShelterId}
              buses={buses}
              availableStationIds={waitingStationIds}
              selectedBusId={selectedBusId}
              onBusClick={tapBus}
            />
          </>
        )}
      </section>

      {shelter && (
        <ShelterDialog
          open
          onOpenChange={(open) => !open && setShelterId(null)}
          shelter={shelter}
          buses={buses}
          arrivals={arrivals.data?.arrivals}
          viewer={viewer}
          buyingBusId={buy.isPending && buy.variables && 'busId' in buy.variables ? buy.variables.busId : null}
          onBuy={buyOn}
          onSignIn={() => setShelterId(null)}
        />
      )}

      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            Buses on the line
            <span className={`flex items-center gap-1.5 text-xs font-normal ${connected ? 'text-success' : 'text-muted-foreground'}`}>
              <span className={`size-2 rounded-full ${connected ? 'bg-success' : 'bg-muted-foreground'}`} aria-hidden />
              {connected ? 'Live' : 'Connecting…'}
            </span>
          </CardTitle>
          <CardDescription>Positions update in real time (simulated). Click a bus for where it came from and where it is going.</CardDescription>
        </CardHeader>
        <CardContent>
          <BusList buses={buses} etas={etas} selectedId={selectedBusId} onSelect={setSelectedBusId} />
        </CardContent>
      </Card>
    </div>
  );
}
