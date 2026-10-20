import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api/client';
import { ADMIN_PAGE_SIZE, HISTORY_PAGE_SIZE, type Page } from '@shared/pagination';
import type { AdminScanEntry, RideCompletion, RideSummary, ScanHistoryPage, ScanResponse, ScanResult } from '@shared/scans/models';

export const SCANS_KEY = ['scans'] as const;

/** Check a ticket: either what the QR carried, or (fallback) the reference code typed in. */
export const useScan = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { token: string } | { referenceCode: string }) => apiPost<ScanResponse>('/scans', input),
    onSuccess: () => qc.invalidateQueries({ queryKey: SCANS_KEY }),
  });
};

/** One page (5) of the konduktor's own scans, plus the per-day counts of the whole window. */
export type HistoryFilter = 'all' | 'valid' | 'rejected';

export const useMyScans = (page = 1, days = 14, result: HistoryFilter = 'all') =>
  useQuery({
    queryKey: [...SCANS_KEY, 'mine', days, result, page],
    queryFn: () => apiGet<ScanHistoryPage>(`/scans/mine?days=${days}&page=${page}&pageSize=${HISTORY_PAGE_SIZE}&result=${result}`),
    placeholderData: keepPreviousData,
  });

/** The passengers on my bus since its last completed ride. Refreshed after every scan, and now and then in case another device scanned. */
export const useRide = () => useQuery({ queryKey: [...SCANS_KEY, 'ride'], queryFn: () => apiGet<RideSummary>('/scans/ride'), refetchInterval: 8000 });

/** The bus has arrived: complete the ride, and the count starts again from zero. */
export const useCompleteRide = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiPost<RideCompletion>('/scans/ride/complete'),
    onSuccess: () => qc.invalidateQueries({ queryKey: SCANS_KEY }),
  });
};

export type AdminScanFilter = { konduktorId?: string; busId?: string; date?: string; result?: ScanResult | '' };

export const useAdminScans = (filter: AdminScanFilter, page = 1) => {
  const params = new URLSearchParams({ page: String(page), pageSize: String(ADMIN_PAGE_SIZE) });
  for (const [key, value] of Object.entries(filter)) if (value) params.set(key, value);
  const qs = params.toString();
  return useQuery({
    queryKey: [...SCANS_KEY, 'admin', qs],
    queryFn: () => apiGet<Page<AdminScanEntry>>(`/scans?${qs}`),
    placeholderData: keepPreviousData,
    refetchInterval: 10_000,
  });
};
