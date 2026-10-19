import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import type { BusEta, StationArrivals } from '@shared/eta/eta';

/** How often estimates are re-asked. Buses move continuously, so a stale number would drift. */
const REFRESH_MS = 5000;

/** Buses that will reach one station, soonest first (ETA-02). Off while no station is chosen. */
export const useStationEta = (stationId: string | null | undefined) =>
  useQuery({
    queryKey: ['eta', 'station', stationId],
    queryFn: () => apiGet<StationArrivals>(`/eta/stations/${stationId}`),
    enabled: !!stationId,
    refetchInterval: REFRESH_MS,
  });

/** Estimates for every bus the viewer may see that is on the road, by bus id. */
export function useBusEtas(enabled = true): ReadonlyMap<string, BusEta> {
  const { data } = useQuery({
    queryKey: ['eta', 'buses'],
    queryFn: () => apiGet<BusEta[]>('/eta/buses'),
    enabled,
    refetchInterval: REFRESH_MS,
  });
  return useMemo(() => new Map((data ?? []).map((e) => [e.busId, e])), [data]);
}
