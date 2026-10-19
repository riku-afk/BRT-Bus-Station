import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import { cumulativeOf, type LatLng, type RoutePath } from '@shared/geo/route';

type RouteResponse = { points: [number, number][]; totalMeters: number; stationDistances: number[]; roadLegs: number; legs: number };

export const ROUTE_KEY = ['route'] as const;

/**
 * The road buses drive between the active shelters, as one path (the same one the simulator and the estimates use). While roads are
 * still being fetched for a new or moved shelter, some pieces are straight lines; the map asks again every so often and picks the
 * real road up as soon as it exists.
 */
export function useRoutePath(): RoutePath | null {
  const { data } = useQuery({
    queryKey: ROUTE_KEY,
    queryFn: () => apiGet<RouteResponse>('/route'),
    staleTime: 30_000,
    // Roads for new or moved shelters arrive in the background: keep looking until every leg follows a road.
    refetchInterval: (query) => (query.state.data && query.state.data.roadLegs < query.state.data.legs ? 5000 : 60_000),
  });
  return useMemo(() => {
    if (!data || data.points.length < 2) return null;
    const points: LatLng[] = data.points.map(([latitude, longitude]) => ({ latitude, longitude }));
    return { points, cumulativeMeters: cumulativeOf(points), totalMeters: data.totalMeters, stationDistances: data.stationDistances };
  }, [data]);
}
