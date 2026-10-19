import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/api/client';
import { ADMIN_PAGE_SIZE, type Page } from '@shared/pagination';

export type Konduktor = {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  employeeNo: string;
  phone: string | null;
  isActive: boolean;
  bus: { id: string; plateNumber: string; name: string } | null;
};

export const KONDUKTORS_KEY = ['konduktors'] as const;

/** One page of konduktors, ten at a time. */
export const useKonduktors = (page = 1) =>
  useQuery({
    queryKey: [...KONDUKTORS_KEY, 'page', page],
    queryFn: () => apiGet<Page<Konduktor>>(`/konduktors?page=${page}&pageSize=${ADMIN_PAGE_SIZE}`),
    placeholderData: keepPreviousData,
  });

export type KonduktorOption = { id: string; fullName: string; isActive: boolean; bus: { id: string; name: string } | null };

/** Every konduktor by name, with the bus each one is on, for a drop-down. */
export const useKonduktorOptions = () => useQuery({ queryKey: [...KONDUKTORS_KEY, 'options'], queryFn: () => apiGet<KonduktorOption[]>('/konduktors/options') });

/** The signed-in konduktor's own profile and bus. */
export const useMyKonduktor = () => useQuery({ queryKey: [...KONDUKTORS_KEY, 'me'], queryFn: () => apiGet<Konduktor>('/konduktors/me') });

function useKonduktorMutation<TVars, TResult>(fn: (vars: TVars) => Promise<TResult>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all([qc.invalidateQueries({ queryKey: KONDUKTORS_KEY }), qc.invalidateQueries({ queryKey: ['buses'] })]),
  });
}

export const useCreateKonduktor = () =>
  useKonduktorMutation((body: { email: string; password: string; fullName: string; employeeNo: string; phone?: string }) =>
    apiPost<Konduktor>('/konduktors', body),
  );

export const useUpdateKonduktor = () =>
  useKonduktorMutation(
    ({ id, ...patch }: { id: string; fullName?: string; employeeNo?: string; phone?: string; isActive?: boolean; password?: string }) =>
      apiPatch<Konduktor>(`/konduktors/${id}`, patch),
  );

export const useDeleteKonduktor = () => useKonduktorMutation((id: string) => apiDelete<{ ok: true }>(`/konduktors/${id}`));
