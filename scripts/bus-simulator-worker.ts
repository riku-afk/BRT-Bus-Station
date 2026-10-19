/**
 * Bus simulator worker (TRK-01, TRK-08). Buses with no konduktor run the line automatically from the moment it starts;
 * buses with a konduktor wait parked at a station and run only the trips their konduktor dispatches. Positions are written
 * to the database; the web process pushes them to the maps over SSE.
 *
 *   bun run worker:simulator
 *
 * Speed, dwell time and bus count: SIM_SPEED_KMH, SIM_DWELL_SECONDS, SIM_BUS_COUNT, SIM_TICK_MS (.env).
 */
import { env } from '@config/env';
import { closeDatabase } from '@core/database';
import { routeService } from '@modules/route';
import { createSimulator, positionSink, trackingService } from '@modules/tracking';

if (env.appEnv === 'prod') {
  console.error('Refusing to run the bus simulator when APP_ENV=prod.');
  process.exit(1);
}

const simulator = createSimulator();
// Roads that are not stored yet are fetched in the background; buses follow a straight line over those until they arrive.
routeService.refreshInBackground();
const { speedKmh, dwellSeconds, busCount, tickMs } = env.simulator;
console.log(`[simulator] starting: up to ${busCount} buses, ${speedKmh} km/h, ${dwellSeconds}s at stations, tick ${tickMs}ms`);
console.log('[simulator] buses without a konduktor run the line by themselves; konduktors dispatch their own buses');

async function shutdown() {
  console.log('[simulator] stopping');
  await simulator.stop();
  // A restart starts from a clean slate: drop open dispatches and take the buses off the maps so none sit there frozen.
  await trackingService.cancelActiveTrips().catch(() => {});
  await positionSink.publish([], { replace: true }).catch(() => {});
  await closeDatabase();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

await simulator.start(positionSink);
