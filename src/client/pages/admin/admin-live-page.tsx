import { useMemo, useState } from 'react';
import { StationMap } from '@/components/map/station-map';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useStationDemand } from '@/features/stations/use-demand';
import { useStations } from '@/features/stations/use-stations';
import { useBusEtas } from '@/features/eta/use-eta';
import { BusList } from '@/features/tracking/bus-list';
import { ADMIN_PAGE_SIZE } from '@shared/pagination';
import { StationBuses } from '@/features/tracking/station-buses';
import { useBusStream } from '@/features/tracking/use-bus-stream';
import { useWorkerStatus } from '@/features/tracking/use-my-bus';
import { groupParkedByStation } from '@shared/tracking/stations';

/**
 * Admin live map: MONITORING only (ADM-02). Every bus in real time, the tickets bought at each station, and which buses are
 * waiting where. Konduktors dispatch their own buses; admins cannot (decision 16 Oct).
 */
export function AdminLivePage() {
  const { data: stations, isLoading, error } = useStations();
  const { buses, connected } = useBusStream();
  const worker = useWorkerStatus();
  const demand = useStationDemand();

  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);

  const waiting = useMemo(() => groupParkedByStation(buses), [buses]);
  const waitingStationIds = useMemo(() => new Set(waiting.keys()), [waiting]);
  const etas = useBusEtas();
  const names = useMemo(() => new Map((stations ?? []).map((s) => [s.id, s.name])), [stations]);
  const badges = useMemo(() => Object.fromEntries((demand.data ?? []).map((d) => [d.stationId, d.validTickets])), [demand.data]);

  const station = stations?.find((s) => s.id === selectedStationId);
  const stationDemand = demand.data?.find((d) => d.stationId === selectedStationId);
  const top = (stationDemand?.byDestination ?? []).slice(0, 3);

  const running = buses.filter((b) => b.service !== 'parked').length;

  return (
    <div className="mx-auto grid max-w-7xl gap-4 p-4 xl:grid-cols-[1fr_27rem]">
      <section aria-label="Live map">
        {isLoading && <Skeleton className="h-[70vh] w-full" />}
        {error && <p className="text-sm text-destructive">Could not load stations: {error.message}</p>}
        {stations && (
          <StationMap
            stations={stations}
            originId={selectedStationId}
            onStationClick={(id) => setSelectedStationId((cur) => (cur === id ? null : id))}
            buses={buses}
            selectedBusId={selectedBusId}
            onBusClick={(id) => setSelectedBusId((cur) => (cur === id ? null : id))}
            stationBadges={badges}
            availableStationIds={waitingStationIds}
            className="h-[72vh]"
          />
        )}
        <p className="mt-1.5 text-xs text-muted-foreground">
          Red numbers on stations are valid tickets bought there; a green ring means a bus is waiting. Click a station or a bus for details.
        </p>
      </section>

      <div className="flex flex-col gap-4">
        {worker.data && !worker.data.workerOnline && (
          <Alert className="border-warning/60">
            <AlertDescription>
              <strong>The simulator worker is not running</strong>, so no bus will move and parked buses will not appear. Start it in a terminal:
              <code className="mt-1 block rounded bg-muted px-2 py-1 text-xs">bun run workers</code>
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{station ? station.name : 'Station'}</CardTitle>
            <CardDescription>
              {station ? 'Tickets bought here and the buses waiting here.' : 'Click a station on the map to see its tickets and waiting buses.'}
            </CardDescription>
          </CardHeader>
          {station && (
            <CardContent className="flex flex-col gap-3">
              <div className="rounded-md border bg-muted/40 p-2.5 text-sm" aria-live="polite">
                <p>
                  <strong>{stationDemand?.validTickets ?? 0}</strong> valid ticket{(stationDemand?.validTickets ?? 0) === 1 ? '' : 's'} from here ·{' '}
                  <strong>{stationDemand?.soldToday ?? 0}</strong> sold today
                </p>
                {top.length > 0 && (
                  <p className="text-xs text-muted-foreground">Most requested: {top.map((d) => `${names.get(d.stationId) ?? '?'} (${d.count})`).join(', ')}</p>
                )}
              </div>
              <StationBuses stationName={station.name} buses={waiting.get(station.id) ?? []} />
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between text-base">
              Buses ({buses.length})
              <span className={`flex items-center gap-1.5 text-xs font-normal ${connected ? 'text-success' : 'text-muted-foreground'}`}>
                <span className={`size-2 rounded-full ${connected ? 'bg-success' : 'bg-muted-foreground'}`} aria-hidden />
                {connected ? 'Live' : 'Reconnecting…'}
              </span>
            </CardTitle>
            <CardDescription>
              {running} on the road · {buses.length - running} waiting at stations. Konduktors dispatch their own buses; buses without a konduktor run the line
              automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BusList buses={buses} etas={etas} selectedId={selectedBusId} onSelect={setSelectedBusId} pageSize={ADMIN_PAGE_SIZE} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
