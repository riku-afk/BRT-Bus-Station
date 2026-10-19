/**
 * Road routing adapter. The app only ever asks one question: "what road does a bus drive from A to B?". The answer is the road
 * as a polyline plus its length, or null when the service has no road between the two points (the map then keeps a straight line).
 *
 *   osrm   OSRM's HTTP API. The public demo server (router.project-osrm.org) is for development only: it is rate limited and has
 *          no guarantees. Point OSRM_BASE_URL at your own OSRM (or swap this adapter for another service) for production.
 *   none   no routing: straight lines (tests, offline).
 */
import type { LatLng } from '@shared/geo/route';

export type RoadLeg = { points: LatLng[]; distanceMeters: number };

export interface RoutingProvider {
  readonly name: 'osrm' | 'none';
  /** The road from `from` to `to`, or null if there is none (or the service is unavailable). Never throws. */
  leg(from: LatLng, to: LatLng): Promise<RoadLeg | null>;
}
