import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from '@/lib/api/client';
import { ADMIN_PAGE_SIZE, type Page } from '@shared/pagination';

export const BUS_STATUSES = ['active', 'inactive', 'maintenance'] as const;
export type BusStatus = (typeof BUS_STATUSES)[number];

export type Bus = {
  id: string;
  plateNumber: string;
  name: string;
  status: BusStatus;
  konduktor: { id: string; fullName: string } | null;
};

export const BUSES_KEY = ['buses'] as const;

/** One page of the fleet, ten at a time: the server never sends the whole table. */
export const useBuses = (page = 1) =>
  useQuery({
    queryKey: [...BUSES_KEY, 'page', page],
    queryFn: () => apiGet<Page<Bus>>(`/buses?page=${page}&pageSize=${ADMIN_PAGE_SIZE}`),
    placeholderData: keepPreviousData,
  });

export type BusOption = { id: string; name: string; plateNumber: string };

/** Every bus by name, for a drop-down. */
export const useBusOptions = () => useQuery({ queryKey: [...BUSES_KEY, 'options'], queryFn: () => apiGet<BusOption[]>('/buses/options') });

/** Buses and konduktors reference each other, so both lists refresh after any change. */
function useFleetMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: BUSES_KEY }), qc.invalidateQueries({ queryKey: ['konduktors'] })]),
  });
}

export const useCreateBus = () =>
  useFleetMutation((body: { plateNumber: string; name: string; status?: BusStatus }) => apiPost<Bus>('/buses', body));

export const useUpdateBus = () =>
  useFleetMutation(({ id, ...patch }: { id: string; plateNumber?: string; name?: string; status?: BusStatus }) =>
    apiPatch<Bus>(`/buses/${id}`, patch),
  );

export const useDeleteBus = () => useFleetMutation((id: string) => apiDelete<{ ok: true }>(`/buses/${id}`));

export const useAssignKonduktor = () =>
  useFleetMutation(({ busId, konduktorId }: { busId: string; konduktorId: string | null }) =>
    apiPut<Bus>(`/buses/${busId}/konduktor`, { konduktorId }),
  );
