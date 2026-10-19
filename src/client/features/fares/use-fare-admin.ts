import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPut } from '@/lib/api/client';

export type FareSettings = { baseFareCentavos: number; perStationCentavos: number };

export type FareOverride = {
  originId: string;
  destinationId: string;
  originName: string;
  destinationName: string;
  fareCentavos: number;
};

const SETTINGS_KEY = ['fares', 'settings'] as const;
const OVERRIDES_KEY = ['fares', 'overrides'] as const;

export const useFareSettings = () => useQuery({ queryKey: SETTINGS_KEY, queryFn: () => apiGet<FareSettings>('/fares/settings') });

export const useFareOverrides = () => useQuery({ queryKey: OVERRIDES_KEY, queryFn: () => apiGet<FareOverride[]>('/fares/overrides') });

/** Quotes are cached per pair, so any fare change drops them all. */
function useFareMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['fares'] }) });
}

export const useSaveFareSettings = () => useFareMutation((body: FareSettings) => apiPut<FareSettings>('/fares/settings', body));

export const useSetFareOverride = () =>
  useFareMutation((body: { originId: string; destinationId: string; fareCentavos: number }) => apiPut<FareOverride[]>('/fares/overrides', body));

export const useRemoveFareOverride = () =>
  useFareMutation(({ originId, destinationId }: { originId: string; destinationId: string }) =>
    apiDelete<FareOverride[]>(`/fares/overrides?origin=${originId}&destination=${destinationId}`),
  );
