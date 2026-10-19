import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/api/client';
import { ADMIN_PAGE_SIZE, HISTORY_PAGE_SIZE, type Page } from '@shared/pagination';
import type { AdminScanEntry, ScanHistoryPage, ScanResponse, ScanResult } from '@shared/scans/models';

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
export const useMyScans = (page = 1, days = 14) =>
  useQuery({
    queryKey: [...SCANS_KEY, 'mine', days, page],
    queryFn: () => apiGet<ScanHistoryPage>(`/scans/mine?days=${days}&page=${page}&pageSize=${HISTORY_PAGE_SIZE}`),
    placeholderData: keepPreviousData,
  });

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
