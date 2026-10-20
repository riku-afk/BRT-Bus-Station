import { useMemo, useState } from 'react';
import { Radio, X } from 'lucide-react';
import { StationMap } from '@/components/map/station-map';
import { PageTitle } from '@/components/layout/page-title';
import { Alert, AlertDescription } from '@/components/ui/alert';
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

const tint = (color: string, fill = 12, line = 30) => ({
  background: `color-mix(in srgb, ${color} ${fill}%, var(--surface))`,
  border: `1px solid color-mix(in srgb, ${color} ${line}%, var(--surface))`,
});

function Summary({ label, value, color, solid }: { label: string; value: number; color: string; solid?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl px-[18px] py-4" style={solid ? { background: color, color: '#fff' } : tint(color, color === '#e11d48' ? 10 : 12, color === '#e11d48' ? 28 : 30)}>
      <span className={solid ? 'text-[13px] font-semibold' : 'text-[13px] font-semibold text-muted-foreground'}>{label}</span>
      <span className="text-[28px] font-extrabold leading-tight">{value}</span>
    </div>
  );
}

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
  const validTickets = (demand.data ?? []).reduce((n, d) => n + d.validTickets, 0);

  return (
    <div className="mx-auto flex w-full max-w-[1360px] flex-col gap-6 px-4 pb-10 pt-6 sm:px-6 md:px-8 md:pt-7">
      <PageTitle icon={Radio} color="#2563eb" title="Live map" description="Konduktors dispatch their own buses; buses without a konduktor run the line automatically." />

      {worker.data && !worker.data.workerOnline && (
        <Alert className="border-warning/60">
          <AlertDescription>
            <strong>The simulator worker is not running</strong>, so no bus will move and parked buses will not appear. Start it in a terminal:
            <code className="mt-1 block rounded bg-muted px-2 py-1 text-xs">bun run workers</code>
          </AlertDescription>
        </Alert>
      )}

      <section aria-label="Fleet right now" className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
        <Summary label="Buses on the line" value={buses.length} color="#2563eb" solid />
        <Summary label="On the road" value={running} color="#ea580c" />
        <Summary label="Waiting at stations" value={buses.length - running} color="#16a34a" />
        <Summary label="Valid tickets at stations" value={validTickets} color="#e11d48" />
      </section>

      <section className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[3_1_560px] flex-col gap-3" aria-label="Live map">
          <div className="rounded-[20px] border bg-card p-2.5">
            {isLoading && <Skeleton className="h-[70vh] w-full rounded-[14px]" />}
            {error && <p className="p-3 text-sm text-destructive">Could not load stations: {error.message}</p>}
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
                className="h-[70vh] min-h-[420px] overflow-hidden rounded-[14px]"
              />
            )}
          </div>
          <div className="flex flex-wrap gap-x-[18px] gap-y-2 px-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-3.5 rounded-full border-[3px] border-[#4f46e5] bg-white" />
              Station
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3.5 rounded-full border-[3px] border-[#16a34a] bg-white" />
              Bus waiting
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3.5 rounded-full bg-[#ea580c]" />
              Bus
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-3.5 rounded-full bg-[#e11d48]" />
              Valid tickets bought there
            </span>
          </div>
        </div>

        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
          <div className="flex flex-col gap-3.5 rounded-[20px] border bg-card p-5">
            {!station ? (
              <div className="flex items-center gap-3.5">
                <div className="grid size-11 shrink-0 place-items-center rounded-xl text-[#0f766e]" style={{ background: 'color-mix(in srgb, #0f766e 14%, var(--surface))' }}>
                  <Radio className="size-[22px]" aria-hidden />
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="text-base font-extrabold">Station</span>
                  <span className="text-[13px] leading-normal text-muted-foreground">Click a station on the map to see its tickets and waiting buses.</span>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid size-10 place-items-center rounded-full bg-[#4f46e5] font-extrabold text-white">{station.sequence}</span>
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-muted-foreground">Station</span>
                      <span className="text-[17px] font-extrabold">{station.name}</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedStationId(null)}
                    aria-label="Close station details"
                    className="grid size-11 place-items-center rounded-xl border bg-card hover:bg-surface-2"
                  >
                    <X className="size-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2.5" aria-live="polite">
                  <div className="flex flex-col gap-0.5 rounded-[14px] px-3.5 py-3" style={{ background: 'color-mix(in srgb, #e11d48 10%, var(--surface))' }}>
                    <span className="text-xs font-semibold text-muted-foreground">Valid tickets</span>
                    <span className="text-[22px] font-extrabold">{stationDemand?.validTickets ?? 0}</span>
                  </div>
                  <div className="flex flex-col gap-0.5 rounded-[14px] px-3.5 py-3" style={{ background: 'color-mix(in srgb, #16a34a 11%, var(--surface))' }}>
                    <span className="text-xs font-semibold text-muted-foreground">Buses waiting</span>
                    <span className="text-[22px] font-extrabold">{(waiting.get(station.id) ?? []).length}</span>
                  </div>
                </div>
                <p className="text-sm">
                  <strong>{stationDemand?.soldToday ?? 0}</strong> sold today
                  {top.length > 0 && <span className="block text-xs text-muted-foreground">Most requested: {top.map((d) => `${names.get(d.stationId) ?? '?'} (${d.count})`).join(', ')}</span>}
                </p>
                <StationBuses stationName={station.name} buses={waiting.get(station.id) ?? []} />
              </>
            )}
          </div>

          <div className="flex flex-col gap-3.5 rounded-[20px] border bg-card p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-lg font-extrabold">Buses ({buses.length})</h2>
              <span className={`flex items-center gap-1.5 text-xs font-bold ${connected ? 'text-[#16a34a]' : 'text-muted-foreground'}`}>
                <span className={`size-2 rounded-full ${connected ? 'bg-[#16a34a]' : 'bg-muted-foreground'}`} aria-hidden />
                {connected ? 'Live' : 'Reconnecting…'}
              </span>
            </div>
            <p className="text-[13px] text-muted-foreground">
              {running} on the road · {buses.length - running} waiting at stations
            </p>
            <BusList buses={buses} etas={etas} selectedId={selectedBusId} onSelect={setSelectedBusId} pageSize={ADMIN_PAGE_SIZE} />
          </div>
        </div>
      </section>
    </div>
  );
}
