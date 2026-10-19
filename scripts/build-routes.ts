/**
 * Fetch the real road between every pair of neighbouring shelters and store it, so the maps and the simulated buses follow roads
 * instead of straight lines.
 *
 *   bun run routes:build            fetch only what is missing or stale
 *   bun run routes:build -- --force  fetch everything again
 *
 * Uses ROUTING_PROVIDER / OSRM_BASE_URL from .env (the public OSRM demo server by default: development only).
 */
import { env } from '@config/env';
import { closeDatabase } from '@core/database';
import { routeService } from '@modules/route';

if (env.routing.provider === 'none') {
  console.error('ROUTING_PROVIDER=none: nothing to fetch. Set ROUTING_PROVIDER=osrm in .env.');
  process.exit(1);
}
const force = process.argv.includes('--force');
console.log(`[routes] fetching roads from ${env.routing.osrmBaseUrl}${force ? ' (all again)' : ''}`);
const { built, failed } = await routeService.ensure({
  force,
  onProgress: (done, total, ok) => console.log(`[routes] ${done}/${total} ${ok ? 'ok' : 'no road found (straight line kept)'}`),
});
const path = await routeService.path();
console.log(`[routes] built ${built}, failed ${failed}. ${path.roadLegs} of ${path.legs} legs follow a road; the line is ${(path.totalMeters / 1000).toFixed(2)} km.`);
await closeDatabase();
process.exit(failed > 0 ? 2 : 0);
