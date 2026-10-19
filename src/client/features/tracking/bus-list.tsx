import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Pagination } from "@/components/pagination";
import { cn } from "@/lib/utils";
import { clampPage, offsetOf, toPage } from "@shared/pagination";
import type { BusPosition } from "@shared/tracking/models";
import type { BusEta } from "@shared/eta/eta";
import { BusDetails } from "./bus-details";
import { describeDeparture } from "./departure";

type Props = {
  buses: readonly BusPosition[];
  /** Arrival estimates by bus id, shown in the details. */
  etas?: ReadonlyMap<string, BusEta>;
  /** The bus whose details are open, if any. */
  selectedId?: string | null;
  onSelect?: (busId: string | null) => void;
  /** Show this many at a time, with page buttons. Left out, every bus is listed. */
  pageSize?: number;
};

/**
 * One row per bus: where it is and what it is doing. Click a row to open its details. It is also the text alternative
 * to the map.
 */
export function BusList({
  buses,
  etas,
  selectedId,
  onSelect,
  pageSize,
}: Props) {
  const [pageNo, setPageNo] = useState(1);
  // Picking a bus on the map brings its page into view (adjusting state while rendering, not in an effect).
  const [seen, setSeen] = useState<string | null>(null);
  if (selectedId !== seen) {
    setSeen(selectedId ?? null);
    const at =
      pageSize && selectedId
        ? buses.findIndex((b) => b.busId === selectedId)
        : -1;
    if (pageSize && at >= 0) setPageNo(Math.floor(at / pageSize) + 1);
  }
  if (buses.length === 0)
    return (
      <p className="text-sm text-muted-foreground">
        No buses on the line right now.
      </p>
    );
  const page = pageSize ? clampPage(pageNo, buses.length, pageSize) : 1;
  const shown = pageSize
    ? buses.slice(offsetOf(page, pageSize), offsetOf(page, pageSize) + pageSize)
    : buses;
  return (
    <>
      <ul className="flex flex-col gap-1.5">
        {shown.map((bus) => {
          const open = selectedId === bus.busId;
          const parked = bus.service === "parked";
          const onRoad = bus.service === "dispatch";
          return (
            <li key={bus.busId}>
              <button
                type="button"
                aria-expanded={open}
                aria-controls={`bus-details-${bus.busId}`}
                onClick={() => onSelect?.(open ? null : bus.busId)}
                className={cn(
                  "flex w-full items-start justify-between gap-2 rounded border px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-accent",
                  open && "border-primary bg-accent",
                )}
              >
                <div>
                  <p className="font-medium">
                    {bus.busName}{" "}
                    <span className="text-xs font-normal text-muted-foreground">
                      {bus.plateNumber}
                    </span>
                    {parked && (
                      <span className="ml-1.5 rounded-full bg-success/15 px-1.5 py-0.5 text-[10px] font-medium text-success">
                        Available
                      </span>
                    )}
                    {onRoad && (
                      <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        On the road
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {parked
                      ? `Waiting at ${bus.originStationName ?? "a station"}`
                      : `${bus.originStationName ?? "—"} → ${bus.destinationStationName ?? "—"}`}
                  </p>
                </div>
                <div className="flex items-start gap-1.5">
                  <div className="text-right text-xs">
                    {parked ? (
                      <span>
                        {describeDeparture(bus.expectedDepartureAt).text}
                      </span>
                    ) : bus.atStation ? (
                      <span className="font-medium text-success">
                        Stopped at station
                      </span>
                    ) : (
                      <span>{Math.round(bus.speedKmh)} km/h</span>
                    )}
                    {bus.service === "line" && bus.nextStationName && (
                      <p className="text-muted-foreground">
                        next: {bus.nextStationName}
                      </p>
                    )}
                    {bus.konduktorName && (
                      <p className="text-muted-foreground">
                        {bus.konduktorName}
                      </p>
                    )}
                  </div>
                  <ChevronDown
                    className={cn(
                      "mt-0.5 size-4 text-muted-foreground transition-transform",
                      open && "rotate-180",
                    )}
                    aria-hidden
                  />
                </div>
              </button>
              {open && (
                <div id={`bus-details-${bus.busId}`}>
                  <BusDetails bus={bus} eta={etas?.get(bus.busId)} />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {pageSize && (
        <Pagination
          page={toPage([...shown], buses.length, page, pageSize)}
          onPage={setPageNo}
          label="Bus list pages"
        />
      )}
    </>
  );
}
