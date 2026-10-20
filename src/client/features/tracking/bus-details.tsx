import { formatManilaTime } from '@shared/datetime/ph-time';
import type { BusPosition } from '@shared/tracking/models';
import { formatEta, type BusEta } from '@shared/eta/eta';

type Props = {
  bus: BusPosition;
  /** When the bus reaches its next station and the end of its run (P7). Absent while it is still loading. */
  eta?: BusEta;
};

const SERVICE_LABEL = {
  line: 'Regular line service (automatic)',
  dispatch: 'On the road, dispatched by its konduktor',
  parked: 'Waiting at a station',
} as const;

/**
 * What a bus is doing: where it waits, or where it came from and where it is going, and when it arrives. Deliberately
 * has no passenger count: people get off before the end of the line, so a count on board would not mean anything (GEN-01).
 */
export function BusDetails({ bus, eta }: Props) {
  const parked = bus.service === 'parked';
  return (
    <div className="mt-1 flex flex-col gap-2 rounded-xl bg-surface-2 p-3.5 text-sm" data-testid={`bus-details-${bus.busId}`}>
      <dl className="grid grid-cols-[7rem_1fr] gap-y-1">
        <dt className="text-muted-foreground">Service</dt>
        <dd>{SERVICE_LABEL[bus.service]}</dd>

        {bus.konduktorName && (
          <>
            <dt className="text-muted-foreground">Konduktor</dt>
            <dd>{bus.konduktorName}</dd>
          </>
        )}

        {parked ? (
          <>
            <dt className="text-muted-foreground">Waiting at</dt>
            <dd className="font-medium">{bus.originStationName ?? '—'}</dd>
            <dt className="text-muted-foreground">Expected departure</dt>
            <dd>{bus.expectedDepartureAt ? formatManilaTime(bus.expectedDepartureAt) : 'Not set by the konduktor yet'}</dd>
          </>
        ) : (
          <>
            <dt className="text-muted-foreground">Came from</dt>
            <dd className="font-medium">{bus.originStationName ?? '—'}</dd>
            <dt className="text-muted-foreground">Going to</dt>
            <dd className="font-medium">{bus.destinationStationName ?? '—'}</dd>
            {bus.service === 'line' && (
              <>
                <dt className="text-muted-foreground">Next stop</dt>
                <dd>{bus.nextStationName ?? '—'}</dd>
              </>
            )}
            {eta?.next && bus.service === 'line' && (
              <>
                <dt className="text-muted-foreground">Reaches next stop</dt>
                <dd data-testid="eta-next">{formatEta(eta.next.seconds)}</dd>
              </>
            )}
            {eta?.destination && (
              <>
                <dt className="text-muted-foreground">Arrives at {bus.destinationStationName}</dt>
                <dd className="font-medium" data-testid="eta-destination">{formatEta(eta.destination.seconds)}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Status</dt>
            <dd>{bus.atStation ? 'Stopped at a station' : `Moving · ${Math.round(bus.speedKmh)} km/h`}</dd>
            {bus.service === 'dispatch' && bus.dispatchedAt && (
              <>
                <dt className="text-muted-foreground">Dispatched at</dt>
                <dd>{formatManilaTime(bus.dispatchedAt)}</dd>
              </>
            )}
          </>
        )}
      </dl>
    </div>
  );
}
