import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bus, ChevronDown, Clock, Loader2, Minus, Navigation, Plus, Ticket, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useFareQuote } from '@/features/fares/use-fare';
import { cn } from '@/lib/utils';
import { formatManilaTime } from '@shared/datetime/ph-time';
import { formatEta, type StationArrival } from '@shared/eta/eta';
import { formatPeso } from '@shared/money';
import { MAX_TICKET_QUANTITY } from '@shared/tickets/status';
import type { BusPosition } from '@shared/tracking/models';
import { departureHasPassed, describeDeparture } from './departure';

type Shelter = { id: string; name: string; sequence: number };

/** Who is looking: a guest can sign in to buy, a passenger can buy, anyone else (admin, konduktor) only looks. */
export type Viewer = 'guest' | 'passenger' | 'other';

type ContentProps = {
  shelter: Shelter;
  /** Every live bus; the pop-up picks the ones waiting here and (for departure times) the ones arriving. */
  buses: readonly BusPosition[];
  /** Buses on the road that will reach this shelter, soonest first (from the ETA endpoint). Undefined while loading. */
  arrivals?: readonly StationArrival[];
  viewer: Viewer;
  /** The bus a ticket is being bought on right now, if any. */
  buyingBusId?: string | null;
  onBuy: (bus: BusPosition, quantity: number) => void;
  /** Called when a guest chooses to sign in (the pop-up closes first). */
  onSignIn?: () => void;
};

/** One waiting bus: its summary, and when tapped its trip, fare and the Buy ticket button. */
function WaitingBus({ bus, shelter, open, onToggle, viewer, buying, onBuy, onSignIn }: { bus: BusPosition; shelter: Shelter; open: boolean; onToggle: () => void; viewer: Viewer; buying: boolean; onBuy: (quantity: number) => void; onSignIn?: () => void }) {
  // How many people ride on this purchase (a family of five buys once, on one account).
  const [quantity, setQuantity] = useState(1);
  const departure = describeDeparture(bus.expectedDepartureAt);
  const quote = useFareQuote(open ? shelter.id : null, open ? bus.headingToId : null);
  const announced = Boolean(bus.plannedDestinationName);

  return (
    <li className={cn('rounded-xl border transition-colors', open ? 'border-primary bg-primary/5' : 'bg-success/5')} data-testid="shelter-bus">
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-start justify-between gap-2 p-3 text-left">
        <div className="min-w-0">
          <p className="flex items-center gap-2 font-medium">
            <Bus className="size-4 text-success" aria-hidden />
            {bus.busName} <span className="text-xs font-normal text-muted-foreground">{bus.plateNumber}</span>
          </p>
          <p className="mt-1 flex items-center gap-1 text-sm" data-testid="bus-heading">
            <ArrowRight className="size-3.5 shrink-0 text-primary" aria-hidden />
            {bus.headingToName ? (
              <span>
                {announced ? 'Headed to' : 'Likely headed to'} <strong>{bus.headingToName}</strong>
              </span>
            ) : (
              <span className="text-muted-foreground">Destination not set yet</span>
            )}
          </p>
          <p className={cn('mt-0.5 flex items-center gap-1 text-xs', departure.set ? '' : 'text-muted-foreground')} data-testid="bus-departure">
            <Clock className="size-3 shrink-0" aria-hidden /> {departure.text}
          </p>
        </div>
        <ChevronDown className={cn('mt-1 size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <div className="flex flex-col gap-2 border-t px-3 pb-3 pt-2.5" data-testid="bus-offer">
          <dl className="grid grid-cols-[6rem_1fr] gap-y-1 text-sm">
            <dt className="text-muted-foreground">From</dt>
            <dd className="font-medium">{shelter.name}</dd>
            <dt className="text-muted-foreground">To</dt>
            <dd className="font-medium">{bus.headingToName ?? '—'}</dd>
            <dt className="text-muted-foreground">Leaves</dt>
            <dd>{!bus.expectedDepartureAt ? 'Time not set yet' : departureHasPassed(bus.expectedDepartureAt) ? 'Any moment now' : `about ${formatManilaTime(bus.expectedDepartureAt)}`}</dd>
            <dt className="text-muted-foreground">Fare</dt>
            <dd className="font-semibold" data-testid="offer-fare">
              {quote.data ? (quantity > 1 ? `${formatPeso(quote.data.fareCentavos)} each · ${formatPeso(quote.data.fareCentavos * quantity)} for ${quantity}` : formatPeso(quote.data.fareCentavos)) : quote.isFetching ? '…' : '—'}
            </dd>
          </dl>
          {viewer !== 'other' && (
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-background p-2.5" data-testid="party-size">
              <span className="flex items-center gap-2 text-sm font-medium">
                <Users className="size-4 text-muted-foreground" aria-hidden /> Passengers
              </span>
              <span className="flex items-center gap-3">
                <Button type="button" variant="outline" size="icon" className="size-9" aria-label="Fewer passengers" disabled={quantity <= 1 || buying} onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
                  <Minus />
                </Button>
                <output className="w-6 text-center text-lg font-semibold" aria-live="polite" aria-label="Number of passengers">
                  {quantity}
                </output>
                <Button type="button" variant="outline" size="icon" className="size-9" aria-label="More passengers" disabled={quantity >= MAX_TICKET_QUANTITY || buying} onClick={() => setQuantity((q) => Math.min(MAX_TICKET_QUANTITY, q + 1))}>
                  <Plus />
                </Button>
              </span>
            </div>
          )}
          {!announced && <p className="text-xs text-muted-foreground">The konduktor has not chosen a destination, so this bus goes to the end of the line. You are told the destination before you pay.</p>}

          {viewer === 'passenger' && (
            <Button size="lg" onClick={() => onBuy(quantity)} disabled={buying || !quote.data || !bus.headingToId}>
              {buying ? <Loader2 className="animate-spin" /> : <Ticket />}
              {buying ? 'Preparing payment…' : quote.data ? `${quantity > 1 ? `Buy ${quantity} tickets` : 'Buy ticket'} · ${formatPeso(quote.data.fareCentavos * quantity)}` : 'Buy ticket'}
            </Button>
          )}
          {viewer === 'guest' && (
            <Button asChild size="lg" onClick={onSignIn}>
              <Link to="/login">Sign in to buy a ticket</Link>
            </Button>
          )}
          {viewer === 'other' && <p className="text-xs text-muted-foreground">Tickets are bought with a passenger account.</p>}
          {viewer !== 'other' && (
            <p className="text-xs text-muted-foreground">
              Your ticket is for {bus.busName} only. You pay by QR Ph, then get {quantity > 1 ? `one QR code for all ${quantity} of you` : 'a QR code'}, which the konduktor of {bus.busName} scans at {shelter.name}.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * What a shelter offers, shown when it is tapped: the buses waiting here with where each is headed and when it leaves (tap
 * one to buy a ticket on it), and the buses on their way in with when they arrive and when they leave again.
 */
export function ShelterContent({ shelter, buses, arrivals, viewer, buyingBusId, onBuy, onSignIn }: ContentProps) {
  const waiting = buses.filter((b) => b.service === 'parked' && b.originStationId === shelter.id);
  const [picked, setPicked] = useState<string | null>(null);
  // One bus: show its offer straight away. Several: the passenger picks.
  const openId = picked ?? (waiting.length === 1 ? waiting[0]!.busId : null);
  const byId = new Map(buses.map((b) => [b.busId, b]));

  return (
    <div className="flex flex-col gap-4">
      <section aria-label="Buses waiting here" className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">{waiting.length === 0 ? 'No bus is waiting here right now' : `${waiting.length} bus${waiting.length === 1 ? '' : 'es'} available here`}</h3>
        {waiting.length > 0 && (
          <ul className="flex flex-col gap-2">
            {waiting.map((bus) => (
              <WaitingBus
                key={bus.busId}
                bus={bus}
                shelter={shelter}
                open={openId === bus.busId}
                onToggle={() => setPicked(openId === bus.busId ? '' : bus.busId)}
                viewer={viewer}
                buying={buyingBusId === bus.busId}
                onBuy={(quantity) => onBuy(bus, quantity)}
                onSignIn={onSignIn}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Buses arriving" className="flex flex-col gap-2 border-t pt-3" data-testid="shelter-arrivals">
        <h3 className="text-sm font-semibold">Arriving soon</h3>
        {arrivals === undefined && <p className="text-sm text-muted-foreground">Working out arrival times…</p>}
        {arrivals?.length === 0 && <p className="text-sm text-muted-foreground">No bus is on its way here right now.</p>}
        {arrivals?.map((a) => {
          const bus = byId.get(a.busId);
          const leaves = a.service === 'dispatch' && bus?.expectedDepartureAt ? `about ${formatManilaTime(bus.expectedDepartureAt)}` : null;
          return (
            <div key={a.busId} className="rounded-lg border p-2.5 text-sm" data-testid="shelter-arriving">
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-2 font-medium">
                  <Navigation className="size-4 text-primary" aria-hidden /> {a.busName}
                </p>
                <span className="font-semibold">{formatEta(a.seconds)}</span>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {a.fromName ? `from ${a.fromName}` : 'on the road'}
                {a.towardsName ? ` · heading to ${a.towardsName}` : ''}
                {a.service === 'line' && a.stopsAway > 1 ? ` · ${a.stopsAway - 1} stop${a.stopsAway === 2 ? '' : 's'} before here` : ''}
              </p>
              {a.service === 'dispatch' && (
                <p className="mt-0.5 flex items-center gap-1 text-xs" data-testid="arriving-departure">
                  <Clock className="size-3" aria-hidden /> {leaves ? `Leaves here ${leaves}` : 'Departure time is set by the konduktor once it arrives'}
                </p>
              )}
              {a.service === 'line' && <p className="mt-0.5 text-xs text-muted-foreground">Regular service bus: tickets are bought on buses waiting at a shelter.</p>}
            </div>
          );
        })}
      </section>
    </div>
  );
}

type DialogProps = ContentProps & { open: boolean; onOpenChange: (open: boolean) => void };

/** The pop-up shown when a shelter is tapped. */
export function ShelterDialog({ open, onOpenChange, ...content }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="shelter-description" data-testid="shelter-dialog">
        <div className="pr-8">
          <p className="text-xs text-muted-foreground">Shelter {content.shelter.sequence}</p>
          <DialogTitle className="text-lg font-semibold">{content.shelter.name}</DialogTitle>
          <DialogDescription id="shelter-description" className="sr-only">
            Buses waiting at and arriving at {content.shelter.name}, with where each is headed and when it leaves.
          </DialogDescription>
        </div>
        <ShelterContent {...content} />
      </DialogContent>
    </Dialog>
  );
}
