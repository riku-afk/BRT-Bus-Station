import { Bus } from 'lucide-react';
import type { BusPosition } from '@shared/tracking/models';
import { describeDeparture } from './departure';

type Props = {
  stationName: string;
  /** Buses parked at this station (available). */
  buses: readonly BusPosition[];
};

/** Buses waiting at one station, with their konduktor and when each expects to leave (STN-07). */
export function StationBuses({ stationName, buses }: Props) {
  return (
    <div aria-live="polite" data-testid="station-buses">
      <p className="mb-1.5 text-sm font-medium">Buses waiting at {stationName}</p>
      {buses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bus is waiting here right now.</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {buses.map((bus) => {
            const departure = describeDeparture(bus.expectedDepartureAt);
            return (
              <li key={bus.busId} className="flex items-start gap-2 rounded-md border bg-success/5 px-2.5 py-1.5 text-sm">
                <Bus className="mt-0.5 size-4 text-success" aria-hidden />
                <div>
                  <p className="font-medium">
                    {bus.busName} <span className="text-xs font-normal text-muted-foreground">{bus.plateNumber}</span>
                  </p>
                  {bus.konduktorName && <p className="text-xs text-muted-foreground">Konduktor {bus.konduktorName}</p>}
                  {bus.plannedDestinationName && <p className="text-xs">Headed to {bus.plannedDestinationName}</p>}
                  <p className={departure.set ? 'text-xs' : 'text-xs text-muted-foreground'}>{departure.text}</p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
