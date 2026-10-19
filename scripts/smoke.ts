/**
 * Smoke test: is a RUNNING system in a fit state to demo? It checks the whole chain over real HTTP, as each kind of user, and
 * prints what it found. It buys nothing and changes nothing (it signs in and reads).
 *
 *   bun run smoke                              the app on http://localhost:3000
 *   bun run smoke -- --base https://my-host    another address
 *
 * Needs the demo data (`bun run db:seed`). Exit code 0 = everything passed, 1 = something failed.
 */
import { DEMO_PASSWORD } from '../src/shared/demo/accounts';

const baseArg = process.argv.indexOf('--base');
const base = (baseArg > 0 ? process.argv[baseArg + 1] : process.env.APP_BASE_URL) ?? 'http://localhost:3000';
const origin = new URL(base).origin;

type Check = { name: string; ok: boolean; detail: string };
const checks: Check[] = [];
const check = (name: string, ok: boolean, detail = '') => {
  checks.push({ name, ok, detail });
  console.log(`${ok ? '  ok ' : ' FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

/** A tiny cookie-keeping client. */
function client() {
  let cookie = '';
  return async (method: string, path: string, body?: unknown) => {
    const res = await fetch(`${origin}/api${path}`, {
      method,
      headers: { Accept: 'application/json', Origin: origin, 'X-Requested-With': 'brt', ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(';')[0]).join('; ');
    let json: { success?: boolean; data?: unknown } = {};
    try {
      json = (await res.json()) as typeof json;
    } catch {
      // not JSON
    }
    return { status: res.status, data: json.data as never };
  };
}

async function signIn(email: string) {
  const call = client();
  const res = await call('POST', '/auth/login', { email, password: DEMO_PASSWORD });
  return { call, ok: res.status === 200 };
}

console.log(`Smoke test against ${origin}\n`);

// 1. The app is up.
try {
  const info = await client()('GET', '/system/info');
  check('the app answers', info.status === 200, `status ${info.status}`);
  const data = info.data as { softwareName?: string; version?: string; paymentProvider?: string; appMode?: string } | undefined;
  check('it says what it is (name and version)', Boolean(data?.softwareName && data?.version), `${data?.softwareName} ${data?.version}`);
  console.log(`        payment: ${data?.paymentProvider ?? '?'}`);
} catch (error) {
  check('the app answers', false, (error as Error).message);
  console.log('\nThe app is not running here. Start it with: bun run dev');
  process.exit(1);
}

// 2. The line: shelters and the road.
const anon = client();
const stations = await anon('GET', '/stations');
const list = (stations.data ?? []) as { id: string; distanceMeters: number }[];
check('20 shelters are loaded', stations.status === 200 && list.length === 20, `${list.length}`);
const route = (await anon('GET', '/route')).data as { roadLegs: number; legs: number; totalMeters: number } | undefined;
check('the route follows real roads', Boolean(route && route.legs > 0 && route.roadLegs === route.legs), route ? `${route.roadLegs} of ${route.legs} legs, ${(route.totalMeters / 1000).toFixed(1)} km` : 'no route');
if (route && route.roadLegs < route.legs) console.log('        run: bun run routes:build');

// 3. Buses and the simulator.
const worker = (await anon('GET', '/tracking/status')).data as { workerOnline?: boolean } | undefined;
check('the bus simulator is running', worker?.workerOnline === true, worker?.workerOnline ? '' : 'start it: bun run workers');
const buses = ((await anon('GET', '/tracking/buses')).data as { buses?: { service: string }[] } | undefined)?.buses ?? [];
check('buses are on the map', buses.length > 0, `${buses.length} buses, ${buses.filter((b) => b.service === 'parked').length} waiting at shelters`);

// 4. Each kind of user can sign in and sees only theirs.
const passenger = await signIn('passenger1@brt.test');
check('a passenger can sign in', passenger.ok);
if (passenger.ok) {
  const mine = await passenger.call('GET', '/tickets/mine');
  check('a passenger sees their tickets', mine.status === 200, `${(mine.data as unknown[] | undefined)?.length ?? 0} tickets`);
  const forbidden = await passenger.call('GET', '/admin/stats');
  check('a passenger cannot open the admin numbers', forbidden.status === 403, `status ${forbidden.status}`);
}

const konduktor = await signIn('konduktor1@brt.test');
check('a konduktor can sign in', konduktor.ok);
if (konduktor.ok) {
  const mine = (await konduktor.call('GET', '/tracking/my-bus')).data as { operation?: string; bus?: { name: string } | null } | undefined;
  check('a konduktor has a bus', Boolean(mine?.bus), mine?.bus ? `${mine.bus.name}, ${mine.operation}` : 'no bus assigned');
  const visible = ((await konduktor.call('GET', '/tracking/buses')).data as { buses?: unknown[] } | undefined)?.buses ?? [];
  check('a konduktor sees only their own bus', visible.length <= 1, `${visible.length} visible`);
  const history = await konduktor.call('GET', '/scans/mine?days=14');
  check('a konduktor has a scan history', history.status === 200 && Array.isArray(history.data), `${(history.data as unknown[] | undefined)?.length ?? 0} days`);
}

const admin = await signIn('admin@brt.test');
check('an admin can sign in', admin.ok);
if (admin.ok) {
  const stats = (await admin.call('GET', '/admin/stats?days=14')).data as { days?: unknown[]; totals?: { ticketsSold: number; salesCentavos: number }; paymentsNeedingReview?: number } | undefined;
  check('the dashboard has numbers', Boolean(stats?.days?.length === 14), stats?.totals ? `${stats.totals.ticketsSold} tickets, ₱${(stats.totals.salesCentavos / 100).toFixed(2)} in 14 days` : '');
  if (stats?.paymentsNeedingReview) console.log(`        ${stats.paymentsNeedingReview} payment(s) need review`);
  const scans = await admin.call('GET', '/scans?limit=5');
  check('the admin scan log works', scans.status === 200, `${(scans.data as unknown[] | undefined)?.length ?? 0} shown`);
  const payments = await admin.call('GET', '/payments');
  check('the admin payments list works', payments.status === 200);
  const noKondukterScan = await admin.call('POST', '/scans', { referenceCode: 'BRT-AAAAAA' });
  check('an admin cannot scan tickets', noKondukterScan.status === 403, `status ${noKondukterScan.status}`);
}

// 5. Nobody gets in without signing in.
check('a stranger cannot read a ticket list', (await anon('GET', '/tickets/mine')).status === 401);
check('a stranger cannot scan', (await anon('POST', '/scans', { referenceCode: 'BRT-AAAAAA' })).status === 401);
check('a forged payment notice is refused', (await anon('POST', '/payments/webhook/mock', { id: 'evt_x' })).status === 401 || (await anon('POST', '/payments/webhook/mock', { id: 'evt_x' })).status === 404);

const failed = checks.filter((c) => !c.ok);
console.log(`\n${checks.length - failed.length} of ${checks.length} checks passed.`);
if (failed.length > 0) {
  console.log('Failed: ' + failed.map((c) => c.name).join('; '));
  process.exit(1);
}
