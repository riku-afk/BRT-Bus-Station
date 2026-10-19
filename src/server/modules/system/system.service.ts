import { env } from '@config/env';
import { getDb } from '@core/database';
import { APP_INFO, requiresPocBanner, versionLabel } from '@shared/app-info';
import { systemRepository } from './system.repository';
import type { DatabaseHealth, HealthStatus, SystemInfo } from './system.types';

export const systemService = {
  getHealth(): HealthStatus {
    return { status: 'ok', uptimeSeconds: Math.round(process.uptime()) };
  },

  async getDatabaseHealth(): Promise<DatabaseHealth> {
    try {
      return { status: (await systemRepository.ping(getDb())) ? 'ok' : 'unavailable' };
    } catch {
      return { status: 'unavailable' };
    }
  },

  getInfo(): SystemInfo {
    return {
      softwareName: APP_INFO.softwareName,
      version: APP_INFO.version,
      versionLabel: versionLabel(),
      environment: env.appEnv,
      showPocBanner: requiresPocBanner(env.appEnv),
      pocDisclosure: APP_INFO.pocDisclosure,
      paymentProvider: env.payment.provider,
    };
  },
};
