import { env } from '@config/env';
import { OsrmRoutingProvider } from './osrm.provider';
import type { RoutingProvider } from './routing-provider';

export type { RoadLeg, RoutingProvider } from './routing-provider';
export { OsrmRoutingProvider } from './osrm.provider';

const none: RoutingProvider = { name: 'none', leg: async () => null };
let osrm: OsrmRoutingProvider | null = null;

/** The routing service chosen by `ROUTING_PROVIDER`. */
export function getRoutingProvider(): RoutingProvider {
  if (env.routing.provider === 'none') return none;
  return (osrm ??= new OsrmRoutingProvider(env.routing.osrmBaseUrl));
}
