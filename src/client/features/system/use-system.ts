import { useQuery } from '@tanstack/react-query';
import { apiGet } from '@/lib/api/client';
import type { AppEnvironment } from '@shared/app-info';

export type SystemInfo = {
  softwareName: string;
  version: string;
  versionLabel: string;
  environment: AppEnvironment;
  showPocBanner: boolean;
  pocDisclosure: string;
  paymentProvider: string;
};

export const fetchSystemInfo = () => apiGet<SystemInfo>('/system/info');

export function useSystemInfo() {
  return useQuery({ queryKey: ['system', 'info'], queryFn: fetchSystemInfo, staleTime: 5 * 60_000 });
}
