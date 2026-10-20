import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, MapPin, Ticket } from 'lucide-react';
import { toast } from 'sonner';
import { StationMap } from '@/components/map/station-map';
import { PageTitle } from '@/components/layout/page-title';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage, useCurrentUser } from '@/features/auth/use-auth';
import { useBusEtas, useStationEta } from '@/features/eta/use-eta';
import { useStations } from '@/features/stations/use-stations';
import { goToCheckout, useBuyTicket, useMyTickets } from '@/features/tickets/use-tickets';
import { BusCards } from '@/features/tracking/bus-cards';
import { ShelterDialog, type Viewer } from '@/features/tracking/shelter-dialog';
import { useBusStream } from '@/features/tracking/use-bus-stream';
import { formatPeso } from '@shared/money';
import type { BusPosition } from '@shared/tracking/models';
import { groupParkedByStation } from '@shared/tracking/stations';
import { haversineMeters } from '@shared/geo/route';

/** A bus this close to a shelter, and stopped, is at that shelter. */
const STOPPED_AT_SHELTER_METERS = 60;
const SKY = '#0369a1';

/** The passenger's unpaid tickets, as a shortcut to pay (the amber card). Only mounted for a passenger. */
function AwaitingPayment({ compact }: { compact?: boolean }) {
  const { data } = useMyTickets();
  const waiting = data?.filter((t) => t.status === 'pending_payment') ?? [];
  if (waiting.length === 0) return null;
  const first = waiting[0]!;
  const trip = `${first.originName} → ${first.destinationName} · ${formatPeso(first.fareCentavos)}`;
  return (
    <Link to="/tickets" className={compact ? 'flex items-center gap-3 rounded-2xl bg-[#fef3c7] px-3.5 py-3 text-[#422006] shadow-[0_8px_20px_-10px_rgba(15,23,42,.4)]' : 'flex items-center gap-3.5 rounded-[20px] bg-[#fef3c7] px-[18px] py-4 text-[#422006]'}>
      <span className={compact ? 'grid size-9 shrink-0 place-items-center rounded-[10px] bg-[#f59e0b] text-[#1c1203]' : 'grid size-11 shrink-0 place-items-center rounded-xl bg-[#f59e0b] text-[#1c1203]'}>
        <Ticket className="size-5" aria-hidden />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className={compact ? 'text-sm font-extrabold' : 'text-[15px] font-extrabold'}>
          {waiting.length} ticket{waiting.length === 1 ? '' : 's'} {compact ? 'to pay' : 'awaiting payment'}
        </span>
        <span className="truncate text-xs">{trip}</span>
      </span>
      <ChevronRight className="size-[18px] shrink-0" strokeWidth={2.4} aria-hidden />
    </Link>
  );
}

/**
 * The passenger map. Tapping a shelter opens a pop-up with the buses waiting there (where each is headed, when it leaves, and a
 * Buy ticket button), and the buses arriving. A ticket is bought on a bus: its shelter and destination are the bus's.
 * On a phone the map fills the screen with the hint and the unpaid-ticket shortcut floating over it; on a wide screen it sits beside
 * the how-to-ride card and the key.
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
  const isPassenger = viewer === 'passenger';
  const onRoad = buses.filter((b) => b.service !== 'parked').length;

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
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-5 md:gap-6 md:px-8 md:pb-10 md:pt-7">
      <div className="hidden md:block">
        <PageTitle icon={MapPin} color={SKY} title="Where’s my bus?" description="Tap a shelter to see the buses waiting there and the ones arriving, and to buy a ticket.">
          <span className="rounded-full px-3.5 py-2 text-[13px] font-bold" style={{ background: 'color-mix(in srgb, #16a34a 14%, var(--surface))' }}>
            {buses.length - onRoad} buses waiting · {onRoad} on the road
          </span>
        </PageTitle>
      </div>

      <section aria-label="Station map" className="flex flex-wrap items-start gap-5">
        <div className="relative min-w-0 flex-[3_1_540px] md:rounded-[20px] md:border md:bg-card md:p-2.5">
          {isLoading && <Skeleton className="h-[60vh] w-full" />}
          {error && <p className="p-3 text-sm text-destructive">Could not load stations: {error.message}</p>}
          {stations && (
            <StationMap
              stations={stations}
              originId={shelterId}
              onStationClick={setShelterId}
              buses={buses}
              availableStationIds={waitingStationIds}
              selectedBusId={selectedBusId}
              onBusClick={tapBus}
              className="h-[calc(100svh-10rem)] min-h-[420px] md:h-[70vh] md:overflow-hidden md:rounded-[14px]"
            />
          )}
          {/* Phones: the hint, and the unpaid-ticket shortcut, float over the map. */}
          <div className="pointer-events-none absolute inset-x-3 top-3 z-[1100] flex items-center gap-2.5 rounded-2xl bg-card px-3.5 py-2.5 shadow-[0_8px_20px_-10px_rgba(15,23,42,.4)] md:hidden">
            <span className="grid size-8 shrink-0 place-items-center rounded-[10px] text-white" style={{ background: SKY }}>
              <MapPin className="size-4" aria-hidden />
            </span>
            <span className="flex flex-col">
              <span className="text-sm font-extrabold">Tap your shelter</span>
              <span className="text-xs text-muted-foreground">Green ring = bus waiting, tickets on sale</span>
            </span>
          </div>
          {isPassenger && (
            <div className="absolute inset-x-3 bottom-3 z-[1100] md:hidden">
              <AwaitingPayment compact />
            </div>
          )}
        </div>

        <div className="hidden min-w-0 flex-[2_1_320px] flex-col gap-4 md:flex">
          <div className="flex flex-col gap-3.5 rounded-[20px] p-[22px] text-white" style={{ background: SKY }}>
            <span className="text-lg font-extrabold">How to ride</span>
            {['Tap the shelter you’re at on the map.', 'Buy a ticket on a bus waiting there. Shelters with a green ring have one.', 'Pay by QR Ph, then show your ticket’s QR code to the konduktor.'].map((t, i) => (
              <div key={t} className="flex items-start gap-3">
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#facc15] text-[13px] font-extrabold text-[#1c1203]">{i + 1}</span>
                <span className="text-sm leading-normal">{t}</span>
              </div>
            ))}
          </div>
          {isPassenger && <AwaitingPayment />}
          <div className="flex flex-col gap-2.5 rounded-[20px] border bg-card p-[18px]">
            <span className="text-[15px] font-extrabold">Map key</span>
            <span className="flex items-center gap-2.5 text-[13px]">
              <span className="size-[18px] rounded-full border-[3px] bg-white" style={{ borderColor: SKY }} />
              Shelter
            </span>
            <span className="flex items-center gap-2.5 text-[13px]">
              <span className="size-[18px] rounded-full border-[3px] border-[#16a34a] bg-white shadow-[0_0_0_3px_rgba(22,163,74,.3)]" />
              Bus waiting · tickets on sale
            </span>
            <span className="flex items-center gap-2.5 text-[13px]">
              <span className="size-[18px] rounded-full bg-[#ea580c]" />
              Bus
            </span>
          </div>
        </div>
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

      <section aria-label="Buses on the line" className="flex flex-col gap-3.5 px-4 pb-4 md:p-0">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="text-xl font-extrabold tracking-tight">Buses on the line</h2>
          <span className={`flex items-center gap-1.5 text-xs font-bold ${connected ? 'text-[#16a34a]' : 'text-muted-foreground'}`}>
            <span className={`size-2 rounded-full ${connected ? 'bg-[#16a34a]' : 'bg-muted-foreground'}`} aria-hidden />
            {connected ? 'Live · positions update in real time' : 'Connecting…'}
          </span>
        </div>
        <BusCards buses={buses} etas={etas} selectedId={selectedBusId} onSelect={setSelectedBusId} />
      </section>
    </div>
  );
}
