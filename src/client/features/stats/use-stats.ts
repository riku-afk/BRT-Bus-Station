import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import type { AdminStats } from '@shared/stats/models';

export const useAdminStats = (days: number) =>
  useQuery({ queryKey: ['stats', 'admin', days], queryFn: () => apiGet<AdminStats>(`/admin/stats?days=${days}`), refetchInterval: 30_000 });
