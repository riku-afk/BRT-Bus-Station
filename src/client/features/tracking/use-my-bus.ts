import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost, apiPut } from '@/lib/api/client';
import type { DispatchResult, MyBus, WorkerStatus } from '@shared/tracking/models';

const MY_BUS_KEY = ['tracking', 'my-bus'] as const;

/** A konduktor's own bus. Polled, so it flips to "available" by itself when the bus arrives. */
export const useMyBus = () => useQuery({ queryKey: MY_BUS_KEY, queryFn: () => apiGet<MyBus>('/tracking/my-bus'), refetchInterval: 2000 });

/** Say roughly when the parked bus leaves, in minutes from now; null clears it. */
export function useSetDeparture() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (inMinutes: number | null) => apiPut<MyBus>('/tracking/my-bus/departure', { inMinutes }),
    onSuccess: (mine) => qc.setQueryData(MY_BUS_KEY, mine),
  });
}

/** Say where the waiting bus is headed next (passengers at the shelter see it); null goes back to the default. */
export function useSetDestination() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (destinationId: string | null) => apiPut<MyBus>('/tracking/my-bus/destination', { destinationId }),
    onSuccess: (mine) => qc.setQueryData(MY_BUS_KEY, mine),
  });
}

/** Send the bus on the road. No destination = the far end of the line. The bus is always the konduktor's own. */
export function useDispatchMyBus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (destinationId?: string) => apiPost<DispatchResult>('/tracking/my-bus/dispatch', destinationId ? { destinationId } : {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: MY_BUS_KEY }),
  });
}

/** Whether the simulator worker is running. Without it nothing moves and parked buses do not appear. */
export const useWorkerStatus = () =>
  useQuery({ queryKey: ['tracking', 'status'], queryFn: () => apiGet<WorkerStatus>('/tracking/status'), refetchInterval: 3000 });
