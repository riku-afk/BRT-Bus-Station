/**
 * Product identity — browser-safe, used by both the SPA and the API.
 */
import pkg from '../../package.json';

export const APP_INFO = {
  softwareName: 'BRT Bus Station',
  brand: 'BRT Bus Station',
  version: pkg.version,
  pocDisclosure: 'Proof of concept — simulated buses, test payments',
} as const;

export const APP_ENVIRONMENTS = ['local', 'demo', 'prod'] as const;
export type AppEnvironment = (typeof APP_ENVIRONMENTS)[number];

/** "BRT Bus Station v0.1.0" — shown in the footer and /api/system/info. */
export function versionLabel(version: string = APP_INFO.version): string {
  return `${APP_INFO.softwareName} v${version}`;
}

/** Every environment except production shows the proof-of-concept banner. */
export function requiresPocBanner(environment: AppEnvironment): boolean {
  return environment !== 'prod';
}
