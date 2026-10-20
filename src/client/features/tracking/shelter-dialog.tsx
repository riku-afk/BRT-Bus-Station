import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bus, ChevronDown, Clock, Info, Loader2, Minus, Navigation, Plus, Ticket, Users, X } from 'lucide-react';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
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

const BUY_CLASS = 'flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#be185d] text-[17px] font-extrabold text-white transition hover:brightness-110 disabled:opacity-60';

function Tile({ label, children, testId }: { label: string; children: React.ReactNode; testId?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-xl bg-surface-2 px-3 py-2.5">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="text-sm font-extrabold" data-testid={testId}>
        {children}
      </span>
    </div>
  );
}

/** One waiting bus: its summary, and when tapped its trip, fare and the Buy ticket button. */
function WaitingBus({ bus, shelter, open, onToggle, viewer, buying, onBuy, onSignIn }: { bus: BusPosition; shelter: Shelter; open: boolean; onToggle: () => void; viewer: Viewer; buying: boolean; onBuy: (quantity: number) => void; onSignIn?: () => void }) {
  // How many people ride on this purchase (a family of five buys once, on one account).
  const [quantity, setQuantity] = useState(1);
  const departure = describeDeparture(bus.expectedDepartureAt);
  const quote = useFareQuote(open ? shelter.id : null, open ? bus.headingToId : null);
  const announced = Boolean(bus.plannedDestinationName);

  return (
    <li className="overflow-hidden rounded-[20px] border-2 border-[#16a34a]" data-testid="shelter-bus">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-3 p-4 text-left"
        style={{ background: 'color-mix(in srgb, #16a34a 9%, var(--surface))' }}
      >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#ea580c] text-white">
          <Bus className="size-5" aria-hidden />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-baseline gap-2">
            <span className="text-[17px] font-extrabold">{bus.busName}</span>
            <span className="text-[13px] text-muted-foreground">{bus.plateNumber}</span>
          </span>
          <span className="flex items-center gap-1.5 text-sm" data-testid="bus-heading">
            <ArrowRight className="size-3.5 shrink-0 text-[#16a34a]" strokeWidth={2.6} aria-hidden />
            {bus.headingToName ? (
              <span>
                {announced ? 'Headed to' : 'Likely headed to'} <strong>{bus.headingToName}</strong>
              </span>
            ) : (
              <span className="text-muted-foreground">Destination not set yet</span>
            )}
          </span>
          <span className="flex items-center gap-1.5 text-[13px] text-muted-foreground" data-testid="bus-departure">
            <Clock className="size-[13px] shrink-0" aria-hidden /> {departure.text}
          </span>
        </span>
        <ChevronDown className={cn('mt-1 size-[18px] shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')} aria-hidden />
      </button>

      {open && (
        <div className="flex flex-col gap-3.5 border-t p-4" data-testid="bus-offer">
          <div className="grid grid-cols-2 gap-2">
            <Tile label="From">{shelter.name}</Tile>
            <Tile label="To">{bus.headingToName ?? '—'}</Tile>
            <Tile label="Leaves">{!bus.expectedDepartureAt ? 'Time not set yet' : departureHasPassed(bus.expectedDepartureAt) ? 'Any moment now' : `about ${formatManilaTime(bus.expectedDepartureAt)}`}</Tile>
            <Tile label="Fare" testId="offer-fare">
              {quote.data ? (quantity > 1 ? `${formatPeso(quote.data.fareCentavos)} each · ${formatPeso(quote.data.fareCentavos * quantity)} for ${quantity}` : formatPeso(quote.data.fareCentavos)) : quote.isFetching ? '…' : '—'}
            </Tile>
          </div>
          {viewer !== 'other' && (
            <div className="flex items-center justify-between gap-3 rounded-[14px] border px-3 py-2.5" data-testid="party-size">
              <span className="flex items-center gap-2 text-sm font-extrabold">
                <Users className="size-[18px] text-muted-foreground" aria-hidden /> Passengers
              </span>
              <span className="flex items-center gap-2.5">
                <button type="button" className="grid size-11 place-items-center rounded-xl border bg-card hover:bg-surface-2 disabled:opacity-40" aria-label="Fewer passengers" disabled={quantity <= 1 || buying} onClick={() => setQuantity((q) => Math.max(1, q - 1))}>
                  <Minus className="size-5" />
                </button>
                <output className="min-w-[26px] text-center text-xl font-extrabold" aria-live="polite" aria-label="Number of passengers">
                  {quantity}
                </output>
                <button type="button" className="grid size-11 place-items-center rounded-xl border bg-card hover:bg-surface-2 disabled:opacity-40" aria-label="More passengers" disabled={quantity >= MAX_TICKET_QUANTITY || buying} onClick={() => setQuantity((q) => Math.min(MAX_TICKET_QUANTITY, q + 1))}>
                  <Plus className="size-5" />
                </button>
              </span>
            </div>
          )}
          {!announced && (
            <div className="flex gap-2.5 rounded-xl p-3 text-[13px] leading-relaxed" style={{ background: 'color-mix(in srgb, #2563eb 10%, var(--surface))' }}>
              <Info className="mt-px size-[18px] shrink-0 text-[#2563eb]" aria-hidden />
              <span>The konduktor has not chosen a destination, so this bus goes to the end of the line. You are told the destination before you pay.</span>
            </div>
          )}

          {viewer === 'passenger' && (
            <button type="button" className={BUY_CLASS} onClick={() => onBuy(quantity)} disabled={buying || !quote.data || !bus.headingToId}>
              {buying ? <Loader2 className="size-5 animate-spin" /> : <Ticket className="size-5" />}
              {buying ? 'Preparing payment…' : quote.data ? `${quantity > 1 ? `Buy ${quantity} tickets` : 'Buy ticket'} · ${formatPeso(quote.data.fareCentavos * quantity)}` : 'Buy ticket'}
            </button>
          )}
          {viewer === 'guest' && (
            <Link to="/login" onClick={onSignIn} className={BUY_CLASS}>
              Sign in to buy a ticket
            </Link>
          )}
          {viewer === 'other' && <p className="text-xs text-muted-foreground">Tickets are bought with a passenger account.</p>}
          {viewer !== 'other' && (
            <p className="text-xs leading-relaxed text-muted-foreground">
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
    <div className="flex flex-col gap-5">
      <section aria-label="Buses waiting here" className="flex flex-col gap-3">
        {waiting.length === 0 ? (
          <div className="flex gap-3 rounded-[18px] border-2 border-dashed p-4 text-sm leading-relaxed text-muted-foreground">
            <Bus className="mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <h3 className="font-bold text-foreground">No bus is waiting here right now</h3>
              <p>Tickets are not on sale yet. They are sold on a bus waiting at the shelter.</p>
            </div>
          </div>
        ) : (
          <>
            <h3 className="sr-only">{`${waiting.length} bus${waiting.length === 1 ? '' : 'es'} available here`}</h3>
            <ul className="flex flex-col gap-3">
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
          </>
        )}
      </section>

      <section aria-label="Buses arriving" className="flex flex-col gap-2.5" data-testid="shelter-arrivals">
        <h3 className="text-base font-extrabold">Arriving soon</h3>
        {arrivals === undefined && <p className="text-sm text-muted-foreground">Working out arrival times…</p>}
        {arrivals?.length === 0 && <p className="text-sm text-muted-foreground">No bus is on its way here right now.</p>}
        {arrivals?.map((a) => {
          const bus = byId.get(a.busId);
          const leaves = a.service === 'dispatch' && bus?.expectedDepartureAt ? `about ${formatManilaTime(bus.expectedDepartureAt)}` : null;
          return (
            <div key={a.busId} className="flex items-start gap-3 rounded-2xl border p-3.5 text-sm" data-testid="shelter-arriving">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl text-[#2563eb]" style={{ background: 'color-mix(in srgb, #2563eb 14%, var(--surface))' }}>
                <Navigation className="size-[18px]" aria-hidden />
              </span>
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[15px] font-extrabold">{a.busName}</span>
                  <span className="rounded-full bg-[#dbeafe] px-2.5 py-0.5 text-xs font-extrabold text-[#1e40af]">{formatEta(a.seconds)}</span>
                </div>
                <p className="text-[13px]">
                  {a.fromName ? `from ${a.fromName}` : 'on the road'}
                  {a.towardsName ? ` · heading to ${a.towardsName}` : ''}
                  {a.service === 'line' && a.stopsAway > 1 ? ` · ${a.stopsAway - 1} stop${a.stopsAway === 2 ? '' : 's'} before here` : ''}
                </p>
                {a.service === 'dispatch' && (
                  <p className="flex items-center gap-1 text-xs" data-testid="arriving-departure">
                    <Clock className="size-3" aria-hidden /> {leaves ? `Leaves here ${leaves}` : 'Departure time is set by the konduktor once it arrives'}
                  </p>
                )}
                {a.service === 'line' && <p className="text-xs text-muted-foreground">Regular service bus: tickets are bought on buses waiting at a shelter.</p>}
              </div>
            </div>
          );
        })}
      </section>
    </div>
  );
}

type DialogProps = ContentProps & { open: boolean; onOpenChange: (open: boolean) => void };

/** The pop-up shown when a shelter is tapped: a centred dialog on a wide screen, a bottom sheet on a phone. */
export function ShelterDialog({ open, onOpenChange, ...content }: DialogProps) {
  const here = content.buses.filter((b) => b.service === 'parked' && b.originStationId === content.shelter.id).length;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        aria-describedby="shelter-description"
        data-testid="shelter-dialog"
        className="max-h-[86svh] max-w-[540px] gap-0 rounded-t-3xl p-0 sm:max-h-[calc(100svh-3rem)] sm:rounded-3xl"
      >
        <div className="sticky top-0 z-[2] flex items-start justify-between gap-3 bg-[#0369a1] px-[22px] py-5 text-white">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-bold text-[#bae6fd]">Shelter {content.shelter.sequence}</span>
            <DialogTitle className="text-2xl font-extrabold tracking-tight">{content.shelter.name}</DialogTitle>
            <span className={cn('mt-1 self-start rounded-full px-2.5 py-1 text-xs font-extrabold', here > 0 ? 'bg-[#dcfce7] text-[#166534]' : 'bg-white/20 text-white')}>
              {here > 0 ? `${here} bus${here === 1 ? '' : 'es'} available` : 'No bus waiting'}
            </span>
          </div>
          <DialogClose aria-label="Close" className="grid size-11 shrink-0 place-items-center rounded-xl bg-white/15 text-white hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-white">
            <X className="size-[18px]" strokeWidth={2.4} aria-hidden />
          </DialogClose>
        </div>
        <DialogDescription id="shelter-description" className="sr-only">
          Buses waiting at and arriving at {content.shelter.name}, with where each is headed and when it leaves.
        </DialogDescription>
        <div className="px-[22px] pb-6 pt-5">
          <ShelterContent {...content} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
