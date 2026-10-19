import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';

export type FareQuote = {
  originId: string;
  destinationId: string;
  stationsTravelled: number;
  fareCentavos: number;
  source: 'computed' | 'override';
};

/** Server-computed fare for a trip; disabled until both stations are chosen. */
export function useFareQuote(originId: string | null, destinationId: string | null) {
  const ready = Boolean(originId && destinationId && originId !== destinationId);
  return useQuery({
    queryKey: ['fares', 'quote', originId, destinationId],
    queryFn: () => apiGet<FareQuote>(`/fares/quote?origin=${originId}&destination=${destinationId}`),
    enabled: ready,
    staleTime: 30_000,
  });
}
