import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api/client';

export type Station = {
  id: string;
  name: string;
  sequence: number;
  latitude: number;
  longitude: number;
  isActive: boolean;
  /** Metres along the route from the first active station. */
  distanceMeters: number;
};

export const STATIONS_KEY = ['stations'] as const;

export const fetchStations = (includeInactive = false) =>
  apiGet<Station[]>(`/stations${includeInactive ? '?includeInactive=true' : ''}`);

/** Active stations in line order (public). */
export function useStations() {
  return useQuery({ queryKey: [...STATIONS_KEY, 'active'], queryFn: () => fetchStations(false), staleTime: 60_000 });
}

/** Every station including deactivated ones (admin). */
export function useAllStations() {
  return useQuery({ queryKey: [...STATIONS_KEY, 'all'], queryFn: () => fetchStations(true) });
}

function useStationMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: STATIONS_KEY }), qc.invalidateQueries({ queryKey: ['route'] })]) });
}

export const useCreateStation = () =>
  useStationMutation((body: { name: string; latitude: number; longitude: number; sequence?: number }) =>
    apiPost<Station>('/stations', body),
  );

export const useUpdateStation = () =>
  useStationMutation(({ id, ...patch }: { id: string; name?: string; latitude?: number; longitude?: number; isActive?: boolean }) =>
    apiPatch<Station>(`/stations/${id}`, patch),
  );

export const useDeleteStation = () => useStationMutation((id: string) => apiDelete<Station[]>(`/stations/${id}`));

export const useReorderStations = () => useStationMutation((ids: string[]) => apiPost<Station[]>('/stations/reorder', { ids }));
