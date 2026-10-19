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

export type HealthStatus = { status: 'ok'; uptimeSeconds: number };
export type DatabaseHealth = { status: 'ok' | 'unavailable' };
