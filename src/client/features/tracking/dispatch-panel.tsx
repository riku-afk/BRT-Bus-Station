import { Send } from 'lucide-react';
import { StationMap } from '@/components/map/station-map';
import { NativeSelect } from '@/components/ui/native-select';
import type { Station } from '@/features/stations/use-stations';
import type { BusPosition, MyBus } from '@shared/tracking/models';
import type { DispatchPlan } from './use-dispatch-plan';

const ORANGE = '#c2410c';

/** The orange Dispatch button. */
export function DispatchButton({ plan, mine, tall }: { plan: DispatchPlan; mine: MyBus; tall?: boolean }) {
  return (
    <button
      type="button"
      onClick={plan.send}
      disabled={plan.dispatching || !mine.defaultDestination}
      className={`flex w-full items-center justify-center gap-2.5 rounded-[14px] bg-[#c2410c] font-extrabold text-white transition hover:brightness-110 disabled:opacity-60 ${tall ? 'h-14 text-[17px]' : 'h-[54px] text-base'}`}
    >
      <Send className="size-[18px]" aria-hidden /> {plan.dispatching ? 'Dispatching…' : plan.target && tall ? `Dispatch to ${plan.target.name.replace(/^Bus Shelter /, '')}` : 'Dispatch bus'}
    </button>
  );
}

type Props = {
  mine: MyBus;
  stations: readonly Station[] | undefined;
  buses: readonly BusPosition[];
  plan: DispatchPlan;
  /** The phone's Dispatch screen: the button lives in a footer the page draws, and the map is taller. */
  footerButton?: boolean;
};

/** Pick where the waiting bus goes (a list, or a tap on the map), see the trip, and send it. Used on My bus and on the phone's Dispatch screen. */
export function DispatchPanel({ mine, stations, buses, plan, footerButton }: Props) {
  if (!mine.station) return null;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <NativeSelect id="destination" value={plan.destinationId} onChange={(e) => plan.choose(e.target.value)} className="h-[52px] rounded-xl font-semibold md:h-11" aria-label="Dispatch to">
          <option value="">End of the line · {mine.defaultDestination?.name ?? '…'}</option>
          {stations
            ?.filter((s) => s.id !== mine.station?.id && s.id !== mine.defaultDestination?.id)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.sequence}. {s.name}
              </option>
            ))}
        </NativeSelect>
      </div>

      {stations && (
        <div className="overflow-hidden rounded-2xl border">
          <StationMap
            stations={stations}
            originId={mine.station.id}
            destinationId={plan.targetId}
            onStationClick={plan.pickOnMap}
            buses={buses}
            selectedBusId={mine.bus?.id}
            className={footerButton ? 'h-[46svh] min-h-[280px]' : 'h-72 md:h-96'}
          />
        </div>
      )}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-3.5 rounded-full bg-[#16a34a]" /> You are here
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-3.5 rounded-full bg-[#e11d48]" /> Where you’re headed
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-1.5 w-[18px] rounded-sm" style={{ background: ORANGE }} /> Your trip
        </span>
      </div>
      <p className="text-xs text-muted-foreground">
        Tap a station on the map to choose where to go. Green is where you are, red is where you are headed. Passengers at {mine.station.name} see this as where your bus is headed.
      </p>

      {plan.target && (
        <div className="flex flex-wrap items-center gap-3.5 rounded-2xl px-4 py-3.5 text-sm" style={{ background: 'color-mix(in srgb, #c2410c 9%, var(--surface))' }} aria-live="polite" data-testid="trip-summary">
          <div className="flex min-w-[200px] flex-1 flex-col gap-0.5">
            <p className="text-[15px] font-extrabold">
              {mine.station.name} → {plan.target.name}
            </p>
            {plan.tripLine && <p className="text-[13px] text-muted-foreground">{plan.tripLine}</p>}
          </div>
        </div>
      )}

      {!footerButton && <DispatchButton plan={plan} mine={mine} />}
      <p className="text-xs text-muted-foreground">The bus drives non-stop and becomes available again when it arrives.</p>
    </div>
  );
}
