import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, History, ScanLine, Send } from 'lucide-react';
import { toast } from 'sonner';
import { useConfirm } from '@/components/confirm-dialog';
import { StationMap } from '@/components/map/station-map';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/features/auth/use-auth';
import { useMyKonduktor } from '@/features/konduktors/use-konduktors';
import { useStations } from '@/features/stations/use-stations';
import { useBusEtas } from '@/features/eta/use-eta';
import { formatEta } from '@shared/eta/eta';
import { describeDeparture, minutesUntilManilaTime } from '@/features/tracking/departure';
import { useBusStream } from '@/features/tracking/use-bus-stream';
import { useDispatchMyBus, useMyBus, useSetDeparture, useSetDestination } from '@/features/tracking/use-my-bus';
import { cn } from '@/lib/utils';

const QUICK_MINUTES = [5, 10, 15, 30] as const;

/**
 * The konduktor's page: their own bus. They mark it available at a station (with a rough departure time for passengers),
 * and dispatch it on the road (KON-04, KON-05), choosing the destination on a map or from a list. The bus is always the
 * one assigned to them: nothing here names a bus.
 */
export function KonduktorHomePage() {
  const { data: mine, isLoading, error } = useMyBus();
  const { data: profile } = useMyKonduktor();
  const { data: stations } = useStations();
  const { buses } = useBusStream();
  const setDeparture = useSetDeparture();
  const dispatch = useDispatchMyBus();
  const setPlan = useSetDestination();
  const { ask, dialog } = useConfirm();
  // A departure time typed as a clock time (HH:MM, Manila).
  const [departAt, setDepartAt] = useState('');

  const fail = (e: unknown) => toast.error(errorMessage(e));
  // The chosen destination is also what passengers at the shelter see ("Headed to X"), so every choice is saved at once. The saved
  // plan is the truth (it follows another device, and is cleared when the bus leaves); `picked` only bridges the moment between
  // a tap and the server's answer. '' means "the end of the line" (the default).
  const [picked, setPicked] = useState<string | null>(null);
  const destinationId = picked ?? mine?.plannedDestination?.id ?? '';
  function choose(id: string) {
    setPicked(id);
    setPlan.mutate(id || null, { onError: fail, onSettled: () => setPicked(null) });
  }
  const etas = useBusEtas(mine?.operation === 'on_road');
  const myEta = mine?.bus ? etas.get(mine.bus.id) : undefined;
  const departure = describeDeparture(mine?.expectedDepartureAt ?? null);

  // Where the bus is going, as the map and the summary show it: the chosen station, or the end of the line.
  const targetId = destinationId || mine?.defaultDestination?.id || '';
  const target = stations?.find((s) => s.id === targetId);
  const origin = stations?.find((s) => s.id === mine?.station?.id);
  const tripLine =
    origin && target
      ? (() => {
          const count = Math.abs(target.sequence - origin.sequence);
          const km = Math.abs(target.distanceMeters - origin.distanceMeters) / 1000;
          return `${count} station${count === 1 ? '' : 's'} · about ${km.toFixed(1)} km`;
        })()
      : null;

  /** Tapping a station on the map chooses it as the destination; tapping where the bus waits does nothing. */
  function pickOnMap(stationId: string) {
    if (stationId === mine?.station?.id) return;
    choose(stationId === mine?.defaultDestination?.id ? '' : stationId);
  }

  function setCustomDeparture(e: React.FormEvent) {
    e.preventDefault();
    const result = minutesUntilManilaTime(departAt);
    if ('error' in result) return toast.error(result.error);
    setDeparture.mutate(result.minutes, { onSuccess: () => setDepartAt(''), onError: fail });
  }

  /** Say when the bus leaves: the shelter it waits at, or (on the road) the shelter it is driving to. Passengers there see it. */
  const departureControls = (title: string) => (
      <div className="flex flex-col gap-2">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          <Clock className="size-4" aria-hidden /> {title}
        </p>
        <p className="text-sm text-muted-foreground" aria-live="polite">
          {departure.text}
        </p>
        <div className="flex flex-wrap gap-2">
          {QUICK_MINUTES.map((m) => (
            <Button key={m} variant="outline" size="sm" disabled={setDeparture.isPending} onClick={() => setDeparture.mutate(m, { onError: fail })}>
              In {m} min
            </Button>
          ))}
          <Button variant="ghost" size="sm" disabled={setDeparture.isPending || !mine?.expectedDepartureAt} onClick={() => setDeparture.mutate(null, { onError: fail })}>
            Clear
          </Button>
        </div>
        <form onSubmit={setCustomDeparture} className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor="depart-at" className="text-xs text-muted-foreground">
              Or set the time (today, Manila)
            </Label>
            <Input id="depart-at" type="time" value={departAt} onChange={(e) => setDepartAt(e.target.value)} className="w-36" />
          </div>
          <Button type="submit" size="sm" variant="secondary" disabled={!departAt || setDeparture.isPending}>
            Set time
          </Button>
        </form>
      </div>
  );

  async function send() {
    if (!mine?.defaultDestination) return;
    const ok = await ask({
      title: `Dispatch ${mine.bus?.name}?`,
      description: (
        <div className="flex flex-col gap-2">
          <p className="rounded-md border bg-muted/40 p-2.5 font-medium text-foreground">
            {mine.station?.name} → {target?.name}
          </p>
          {tripLine && <p>{tripLine}</p>}
          <p>Once it leaves, it cannot be called back.</p>
        </div>
      ),
      confirmLabel: 'Dispatch now',
    });
    if (!ok) return;
    dispatch.mutate(destinationId || undefined, {
      onSuccess: (result) => {
        toast.success(`${result.busName} is on its way: ${result.originName} → ${result.destinationName}`);
        setPicked(null);
      },
      onError: fail,
    });
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      {dialog}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            {mine?.bus ? `${mine.bus.name} · ${mine.bus.plateNumber}` : 'Your bus'}
            {mine && (
              <span
                className={cn(
                  'rounded-full px-2.5 py-0.5 text-xs font-medium',
                  mine.operation === 'available' && 'bg-success/15 text-success',
                  mine.operation === 'on_road' && 'bg-primary/15 text-primary',
                  (mine.operation === 'not_on_map' || mine.operation === 'no_bus') && 'bg-muted text-muted-foreground',
                )}
              >
                {mine.operation === 'available' ? 'Available' : mine.operation === 'on_road' ? 'On the road' : mine.operation === 'not_on_map' ? 'Not on the map' : 'No bus'}
              </span>
            )}
          </CardTitle>
          <CardDescription>You decide when your bus leaves. Passengers see where it waits and when you expect to go.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {isLoading && <Skeleton className="h-32 w-full" />}
          {error && <p className="text-sm text-destructive">{errorMessage(error)}</p>}

          {mine && !mine.workerOnline && mine.operation !== 'no_bus' && (
            <Alert className="border-warning/60">
              <AlertDescription>The simulator is not running, so buses cannot move or appear on the map. Ask whoever runs the demo to start it.</AlertDescription>
            </Alert>
          )}

          {mine?.operation === 'no_bus' && <p className="text-sm text-muted-foreground">No bus is assigned to you yet. Ask an admin to assign one.</p>}
          {mine?.operation === 'not_on_map' && <p className="text-sm text-muted-foreground">Your bus has not been placed at a station yet. This happens as soon as the simulator is running.</p>}

          {mine?.operation === 'available' && mine.station && (
            <>
              <div className="rounded-md border bg-success/5 p-3">
                <p className="text-xs text-muted-foreground">Waiting at</p>
                <p className="text-lg font-semibold">{mine.station.name}</p>
              </div>

              {departureControls('Expected departure')}

              <div className="flex flex-col gap-2 border-t pt-4">
                <Label htmlFor="destination">Dispatch to</Label>
                <NativeSelect id="destination" value={destinationId} onChange={(e) => choose(e.target.value)}>
                  <option value="">End of the line · {mine.defaultDestination?.name ?? '…'}</option>
                  {stations
                    ?.filter((s) => s.id !== mine.station?.id && s.id !== mine.defaultDestination?.id)
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.sequence}. {s.name}
                      </option>
                    ))}
                </NativeSelect>

                {stations && (
                  <StationMap
                    stations={stations}
                    originId={mine.station.id}
                    destinationId={targetId}
                    onStationClick={pickOnMap}
                    buses={buses}
                    selectedBusId={mine.bus?.id}
                    className="h-72"
                  />
                )}
                <p className="text-xs text-muted-foreground">
                  Tap a station on the map to choose where to go. Green is where you are, red is where you are headed. Passengers at {mine.station.name} see this
                  as where your bus is headed.
                </p>

                {target && (
                  <div className="rounded-md border bg-muted/40 p-2.5 text-sm" aria-live="polite" data-testid="trip-summary">
                    <p className="font-medium">
                      {mine.station.name} → {target.name}
                    </p>
                    {tripLine && <p className="text-xs text-muted-foreground">{tripLine}</p>}
                  </div>
                )}

                <Button size="lg" onClick={send} disabled={dispatch.isPending || !mine.defaultDestination}>
                  <Send /> {dispatch.isPending ? 'Dispatching…' : 'Dispatch bus'}
                </Button>
                <p className="text-xs text-muted-foreground">The bus drives non-stop and becomes available again when it arrives.</p>
              </div>
            </>
          )}

          {mine?.operation === 'on_road' && mine.trip && (
            <div className="flex flex-col gap-3">
              <div className="rounded-md border bg-primary/5 p-3">
                <p className="text-xs text-muted-foreground">Heading</p>
                <p className="font-semibold">
                  {mine.trip.originName} → {mine.trip.destinationName}
                </p>
              </div>
              {stations && (
                <StationMap
                  stations={stations}
                  originId={mine.trip.originStationId}
                  destinationId={mine.trip.destinationStationId}
                  buses={buses}
                  selectedBusId={mine.bus?.id}
                  className="h-72"
                />
              )}
              <div className="flex items-center justify-between rounded-md border p-3" data-testid="my-eta" aria-live="polite">
                <div>
                  <p className="text-xs text-muted-foreground">Arrives at {mine.trip.destinationName}</p>
                  <p className="text-xl font-semibold">{myEta?.destination ? formatEta(myEta.destination.seconds) : 'Working it out…'}</p>
                </div>
                <Clock className="size-5 text-muted-foreground" aria-hidden />
              </div>
              {departureControls(`When will it leave ${mine.trip.destinationName}?`)}
              <p className="text-sm text-muted-foreground">Your bus becomes available at {mine.trip.destinationName} when it arrives. Passengers waiting there see the time you set.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {profile && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">You</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[8rem_1fr] gap-y-1 text-sm">
              <dt className="text-muted-foreground">Name</dt>
              <dd>{profile.fullName}</dd>
              <dt className="text-muted-foreground">Employee no.</dt>
              <dd>{profile.employeeNo}</dd>
              <dt className="text-muted-foreground">Phone</dt>
              <dd>{profile.phone ?? '—'}</dd>
            </dl>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tickets</CardTitle>
          <CardDescription>Check passengers&apos; tickets as they board.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild size="lg">
            <Link to="/konduktor/scan">
              <ScanLine /> Scan tickets
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link to="/konduktor/history">
              <History /> Scan history
            </Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
