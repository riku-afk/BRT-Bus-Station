import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import type { StationDemand } from '@shared/tracking/models';

/** Admin: tickets bought at each station (counts only). Polled so the map badges follow new purchases. */
export const useStationDemand = () =>
  useQuery({ queryKey: ['stations', 'demand'], queryFn: () => apiGet<StationDemand[]>('/stations/demand'), refetchInterval: 5000 });
