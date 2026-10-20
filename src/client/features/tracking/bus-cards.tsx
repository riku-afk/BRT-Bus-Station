import { cn } from '@/lib/utils';
import type { BusEta } from '@shared/eta/eta';
import type { BusPosition } from '@shared/tracking/models';
import { BusDetails } from './bus-details';
import { describeDeparture } from './departure';

type Props = {
  buses: readonly BusPosition[];
  /** Arrival estimates by bus id, shown in the details. */
  etas?: ReadonlyMap<string, BusEta>;
  selectedId?: string | null;
  onSelect?: (busId: string | null) => void;
};

const WAITING = '#16a34a';
const MOVING = '#2563eb';

/** The passenger's "buses on the line": a card per bus with a coloured header (green waiting, blue on the road). Tap one for its details. */
export function BusCards({ buses, etas, selectedId, onSelect }: Props) {
  if (buses.length === 0) return <p className="text-sm text-muted-foreground">No buses on the line right now.</p>;
  return (
    <ul className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
      {buses.map((bus) => {
        const parked = bus.service === 'parked';
        const open = selectedId === bus.busId;
        const color = parked ? WAITING : MOVING;
        const departure = describeDeparture(bus.expectedDepartureAt);
        return (
          <li key={bus.busId} className={cn('flex flex-col overflow-hidden rounded-[18px] border bg-card transition-all duration-150 hover:-translate-y-[3px] hover:shadow-[0_14px_28px_-14px_rgba(15,23,42,.35)]', open && 'ring-2 ring-[#0369a1]')}>
            <button
              type="button"
              aria-expanded={open}
              aria-controls={`bus-details-${bus.busId}`}
              onClick={() => onSelect?.(open ? null : bus.busId)}
              className="flex flex-col text-left"
            >
              <span className="flex items-center justify-between gap-2.5 px-4 py-3.5 text-white" style={{ background: color }}>
                <span className="flex flex-col">
                  <span className="text-[17px] font-extrabold">{bus.busName}</span>
                  <span className="text-xs opacity-90">{bus.plateNumber}</span>
                </span>
                <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-extrabold" style={{ color }}>
                  {parked ? 'Available' : 'On the road'}
                </span>
              </span>
              <span className="flex flex-col gap-2 px-4 pb-4 pt-3 text-[13px]">
                <span className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">{parked ? 'Waiting at' : 'Heading to'}</span>
                  <span className="font-bold">{parked ? (bus.originStationName ?? 'a station') : (bus.destinationStationName ?? '—')}</span>
                </span>
                <span className="flex flex-col gap-0.5">
                  <span className="text-xs text-muted-foreground">{parked ? 'Leaves' : bus.service === 'line' && bus.nextStationName ? 'Next stop' : 'Now'}</span>
                  <span className="font-bold">
                    {parked ? departure.text : bus.service === 'line' && bus.nextStationName ? bus.nextStationName : bus.atStation ? 'Stopped at station' : `${Math.round(bus.speedKmh)} km/h`}
                  </span>
                </span>
              </span>
            </button>
            {open && (
              <div id={`bus-details-${bus.busId}`} className="px-3 pb-3">
                <BusDetails bus={bus} eta={etas?.get(bus.busId)} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
