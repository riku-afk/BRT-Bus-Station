import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Bus, ChevronRight, Clock, IdCard, ScanLine, Send, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { StationMap } from '@/components/map/station-map';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { errorMessage } from '@/features/auth/use-auth';
import { useMyKonduktor } from '@/features/konduktors/use-konduktors';
import { PassengerCount } from '@/features/scans/passenger-count';
import { useMyScans } from '@/features/scans/use-scans';
import { useStations } from '@/features/stations/use-stations';
import { useBusEtas } from '@/features/eta/use-eta';
import { DispatchPanel } from '@/features/tracking/dispatch-panel';
import { describeDeparture, minutesUntilManilaTime } from '@/features/tracking/departure';
import { useDispatchPlan } from '@/features/tracking/use-dispatch-plan';
import { useBusStream } from '@/features/tracking/use-bus-stream';
import { useMyBus, useSetDeparture } from '@/features/tracking/use-my-bus';
import { useIsWide } from '@/lib/use-media';
import { useNow } from '@/lib/use-now';
import { cn } from '@/lib/utils';
import { formatManilaTime, manilaDateKey } from '@shared/datetime/ph-time';
import { formatEta } from '@shared/eta/eta';

const QUICK_MINUTES = [5, 10, 15, 30] as const;
const ORANGE = '#c2410c';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');

/** A white-ish card with an icon tile and a heading, as the sections of this page are. */
function Section({ icon: Icon, color, title, hint, children }: { icon: typeof Clock; color: string; title: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-[20px] border bg-card p-[18px] sm:p-[22px]">
      <div className="flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${color} 14%, var(--surface))`, color }}>
          <Icon className="size-5" aria-hidden />
        </span>
        <div className="flex flex-col gap-0.5">
          <h2 className="text-lg font-extrabold">{title}</h2>
          {hint && (
            <span className="text-[13px] text-muted-foreground" aria-live="polite">
              {hint}
            </span>
          )}
        </div>
      </div>
      {children}
    </section>
  );
}

/**
 * The konduktor's page: their own bus. They mark it available at a station (with a rough departure time for passengers),
 * and dispatch it on the road (KON-04, KON-05), choosing the destination on a map or from a list. The bus is always the
 * one assigned to them: nothing here names a bus. On a phone, dispatching is its own screen (reached from here).
 */
export function KonduktorHomePage() {
  const { data: mine, isLoading, error } = useMyBus();
  const { data: profile } = useMyKonduktor();
  const { data: stations } = useStations();
  const { buses } = useBusStream();
  const setDeparture = useSetDeparture();
  const plan = useDispatchPlan(mine, stations);
  const wide = useIsWide();
  const now = useNow(30_000);
  // A departure time typed as a clock time (HH:MM, Manila).
  const [departAt, setDepartAt] = useState('');
  const today = manilaDateKey(new Date());
  const scansToday = useMyScans(1, 1).data?.days?.find((d) => d.date === today);

  const fail = (e: unknown) => toast.error(errorMessage(e));
  const etas = useBusEtas(mine?.operation === 'on_road');
  const myEta = mine?.bus ? etas.get(mine.bus.id) : undefined;
  const departure = describeDeparture(mine?.expectedDepartureAt ?? null);
  const minutesLeft = mine?.expectedDepartureAt ? Math.round((new Date(mine.expectedDepartureAt).getTime() - now) / 60_000) : null;

  function setCustomDeparture(e: React.FormEvent) {
    e.preventDefault();
    const result = minutesUntilManilaTime(departAt);
    if ('error' in result) return toast.error(result.error);
    setDeparture.mutate(result.minutes, { onSuccess: () => setDepartAt(''), onError: fail });
  }

  /** Say when the bus leaves: the shelter it waits at, or (on the road) the shelter it is driving to. Passengers there see it. */
  const departureControls = (title: string) => (
    <Section icon={Clock} color={ORANGE} title={title} hint={departure.text}>
      <div role="group" aria-label="Leave in" className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
        {QUICK_MINUTES.map((m) => {
          const on = minutesLeft !== null && Math.abs(minutesLeft - m) <= 1;
          return (
            <button
              key={m}
              type="button"
              aria-pressed={on}
              disabled={setDeparture.isPending}
              onClick={() => setDeparture.mutate(m, { onError: fail })}
              className={cn('h-12 rounded-xl border px-4 text-sm font-extrabold transition-colors disabled:opacity-60 sm:h-11', on ? 'border-[#c2410c] bg-[#c2410c] text-white' : 'bg-card hover:bg-surface-2')}
            >
              In {m} min
            </button>
          );
        })}
        <button
          type="button"
          disabled={setDeparture.isPending || !mine?.expectedDepartureAt}
          onClick={() => setDeparture.mutate(null, { onError: fail })}
          className="h-12 rounded-xl px-4 text-sm font-bold text-muted-foreground hover:bg-surface-2 disabled:opacity-50 sm:h-11"
        >
          Clear
        </button>
      </div>
      <form onSubmit={setCustomDeparture} className="flex flex-wrap items-end gap-2.5 border-t pt-3.5">
        <label htmlFor="depart-at" className="flex min-w-[150px] flex-1 flex-col gap-1.5 text-[13px] font-bold sm:max-w-[200px]">
          Or set the time (today, Manila)
          <Input id="depart-at" type="time" value={departAt} onChange={(e) => setDepartAt(e.target.value)} className="h-12 rounded-xl text-sm font-semibold focus-visible:ring-[#c2410c]" />
        </label>
        <button type="submit" disabled={!departAt || setDeparture.isPending} className="h-12 rounded-xl border bg-surface-2 px-[18px] text-sm font-bold hover:brightness-95 disabled:opacity-50">
          Set time
        </button>
      </form>
    </Section>
  );

  const operation = mine?.operation;
  const heroPlace = operation === 'available' ? mine?.station?.name : operation === 'on_road' ? mine?.trip?.destinationName : '—';
  const destShort = operation === 'available' ? (plan.target?.name ?? mine?.defaultDestination?.name ?? '—') : operation === 'on_road' ? (mine?.trip?.destinationName ?? '—') : '—';

  /** What they scanned today and the way to scan more. On a phone it comes first, above the bus card, because it is what they use while boarding. */
  const ticketsCard = (
    <section className="relative flex flex-col gap-3.5 overflow-hidden rounded-[20px] bg-[#f59e0b] p-[18px] text-[#1c1203] sm:p-[22px]" aria-label="Tickets">
      <ScanLine aria-hidden strokeWidth={1.3} className="pointer-events-none absolute -bottom-7 -right-6 size-[150px] opacity-[0.14]" />
      <div className="relative flex flex-col gap-1">
        <h2 className="text-xl font-extrabold">Tickets</h2>
        <span className="text-[13px] font-medium">Check passengers&apos; tickets as they board.</span>
      </div>
      <div className="relative grid grid-cols-3 gap-2">
        {[
          { label: 'Scans today', value: scansToday?.total ?? 0, ink: '' },
          { label: 'Valid', value: scansToday?.valid ?? 0, ink: 'text-[#166534]' },
          { label: 'Rejected', value: scansToday?.rejected ?? 0, ink: 'text-[#9f1239]' },
        ].map((c) => (
          <div key={c.label} className="flex flex-col rounded-xl bg-white/55 px-3 py-2.5">
            <span className="text-[11px] font-bold">{c.label}</span>
            <span className={cn('text-[22px] font-extrabold', c.ink)}>{c.value}</span>
          </div>
        ))}
      </div>
      <div className="relative flex flex-col gap-2.5 sm:flex-row sm:flex-wrap">
        <Link to="/konduktor/scan" className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-[14px] bg-[#1c1203] px-4 text-[15px] font-extrabold text-white hover:brightness-125">
          <ScanLine className="size-[18px]" aria-hidden /> Scan tickets
        </Link>
        <Link to="/konduktor/history" className="flex h-[52px] flex-1 items-center justify-center gap-2 rounded-[14px] bg-white px-4 text-[15px] font-extrabold text-[#1c1203] hover:bg-white/90">
          Scan history <ArrowRight className="size-4" aria-hidden />
        </Link>
      </div>
    </section>
  );

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-5 px-4 pb-6 pt-4 sm:px-6 md:gap-6 md:px-8 md:pb-10 md:pt-7">
      {plan.dialog}
      {isLoading && <Skeleton className="h-40 w-full rounded-[22px]" />}
      {error && <p className="text-sm text-destructive">{errorMessage(error)}</p>}

      {!wide && ticketsCard}

      <section className="relative flex flex-wrap items-center justify-between gap-5 overflow-hidden rounded-[22px] bg-[#c2410c] p-5 text-white sm:px-7 sm:py-[26px]" aria-label="Your bus">
        <Bus aria-hidden strokeWidth={1.2} className="pointer-events-none absolute -right-5 -top-10 size-[220px] opacity-[0.13]" />
        <div className="relative flex max-w-[560px] flex-col gap-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-[15px] font-extrabold">{mine?.bus ? `${mine.bus.name} · ${mine.bus.plateNumber}` : 'Your bus'}</span>
            {mine && (
              <span
                className={cn(
                  'rounded-full px-2.5 py-1 text-[11px] font-extrabold',
                  operation === 'available' && 'bg-[#dcfce7] text-[#166534]',
                  operation === 'on_road' && 'bg-[#dbeafe] text-[#1e40af]',
                  (operation === 'not_on_map' || operation === 'no_bus') && 'bg-white/25 text-white',
                )}
              >
                {operation === 'available' ? 'Available' : operation === 'on_road' ? 'On the road' : operation === 'not_on_map' ? 'Not on the map' : 'No bus'}
              </span>
            )}
          </div>
          {(operation === 'available' || operation === 'on_road') && (
            <>
              <span className="text-[13px] font-semibold text-[#fed7aa]">{operation === 'available' ? 'Waiting at' : 'Heading to'}</span>
              <h1 className="text-[28px] font-extrabold leading-tight tracking-tight sm:text-[34px]">{heroPlace}</h1>
            </>
          )}
          {!mine && !isLoading && <h1 className="text-[28px] font-extrabold">Your bus</h1>}
          <p className="text-sm leading-relaxed text-[#ffedd5]">You decide when your bus leaves. Passengers see where it waits and when you expect to go.</p>
        </div>
        {(operation === 'available' || operation === 'on_road') && (
          <div className="relative grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto sm:flex-wrap">
            <div className="flex min-w-0 flex-col gap-0.5 rounded-2xl bg-white/15 px-[18px] py-3.5 sm:min-w-[150px]">
              <span className="text-xs font-bold text-[#fed7aa]">Expected departure</span>
              <span className="text-xl font-extrabold">{mine?.expectedDepartureAt ? formatManilaTime(mine.expectedDepartureAt) : '—'}</span>
            </div>
            <div className="flex min-w-0 flex-col gap-0.5 rounded-2xl bg-[#facc15] px-[18px] py-3.5 text-[#1c1203] sm:min-w-[150px]">
              <span className="text-xs font-bold">Heading to</span>
              <span className="text-lg font-extrabold leading-tight sm:text-xl">{destShort}</span>
            </div>
          </div>
        )}
      </section>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[3_1_520px] flex-col gap-5">
          {mine && !mine.workerOnline && mine.operation !== 'no_bus' && (
            <Alert className="border-warning/60">
              <AlertDescription>The simulator is not running, so buses cannot move or appear on the map. Ask whoever runs the demo to start it.</AlertDescription>
            </Alert>
          )}

          {operation === 'no_bus' && <p className="rounded-[20px] border-2 border-dashed p-5 text-sm text-muted-foreground">No bus is assigned to you yet. Ask an admin to assign one.</p>}
          {operation === 'not_on_map' && <p className="rounded-[20px] border-2 border-dashed p-5 text-sm text-muted-foreground">Your bus has not been placed at a station yet. This happens as soon as the simulator is running.</p>}

          {operation === 'available' && mine?.station && (
            <>
              {departureControls('Expected departure')}

              {wide ? (
                <Section icon={Send} color="#2563eb" title="Dispatch to" hint="Pick a station in the list or tap one on the map.">
                  <DispatchPanel mine={mine} stations={stations} buses={buses} plan={plan} />
                </Section>
              ) : (
                <Link to="/konduktor/dispatch" className="flex h-[60px] items-center gap-3.5 rounded-2xl bg-[#c2410c] px-[18px] text-white shadow-sm">
                  <Send className="size-5" aria-hidden />
                  <span className="flex flex-1 flex-col">
                    <span className="text-base font-extrabold">Dispatch bus</span>
                    <span className="text-xs text-[#fed7aa]">{plan.target ? `to ${plan.target.name}` : 'Choose where it goes'}</span>
                  </span>
                  <ChevronRight className="size-5" aria-hidden />
                </Link>
              )}
            </>
          )}

          {operation === 'on_road' && mine?.trip && (
            <>
              <Section icon={Bus} color="#2563eb" title="Your trip" hint="Heading">
                <p className="text-[15px] font-extrabold">
                  <span className="sr-only">Heading </span>
                  {mine.trip.originName} → {mine.trip.destinationName}
                </p>
                {stations && (
                  <div className="overflow-hidden rounded-2xl border">
                    <StationMap stations={stations} originId={mine.trip.originStationId} destinationId={mine.trip.destinationStationId} buses={buses} selectedBusId={mine.bus?.id} className="h-72" />
                  </div>
                )}
                <div className="flex items-center justify-between rounded-2xl border p-3.5" data-testid="my-eta" aria-live="polite">
                  <div>
                    <p className="text-xs text-muted-foreground">Arrives at {mine.trip.destinationName}</p>
                    <p className="text-xl font-extrabold">{myEta?.destination ? formatEta(myEta.destination.seconds) : 'Working it out…'}</p>
                  </div>
                  <Clock className="size-5 text-muted-foreground" aria-hidden />
                </div>
                <p className="text-sm text-muted-foreground">Your bus becomes available at {mine.trip.destinationName} when it arrives. Passengers waiting there see the time you set.</p>
              </Section>
              {departureControls(`When will it leave ${mine.trip.destinationName}?`)}
            </>
          )}
        </div>

        <div className="flex min-w-0 flex-[2_1_300px] flex-col gap-5">
          {profile && (
            <section className="flex flex-col gap-4 rounded-[20px] border bg-card p-[18px] sm:p-[22px]" aria-label="You">
              <div className="flex items-center gap-3.5">
                <span className="grid size-[54px] shrink-0 place-items-center rounded-full bg-[#7c3aed] text-lg font-extrabold text-white" aria-hidden>
                  {initials(profile.fullName)}
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-xs font-bold text-muted-foreground">You</span>
                  <span className="text-lg font-extrabold">{profile.fullName}</span>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: 'color-mix(in srgb, #7c3aed 12%, var(--surface))' }}>
                  <IdCard className="size-3.5 text-[#7c3aed]" aria-hidden /> {profile.employeeNo}
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold" style={{ background: 'color-mix(in srgb, #0f766e 12%, var(--surface))' }}>
                  <Smartphone className="size-3.5 text-[#0f766e]" aria-hidden /> {profile.phone ?? '—'}
                </span>
                {profile.bus && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[#ffedd5] px-3 py-1.5 text-xs font-bold text-[#9a3412]">
                    <Bus className="size-3.5" aria-hidden /> {profile.bus.name} ({profile.bus.plateNumber})
                  </span>
                )}
              </div>
            </section>
          )}

          {mine && mine.operation !== 'no_bus' && <PassengerCount />}

          {wide && ticketsCard}
        </div>
      </div>
    </div>
  );
}
