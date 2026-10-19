import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Session, setupTestApp } from './helpers';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
let admin: Session;
let passenger: Session;
const anon = () => new Session({ request: (p, i) => ctx.api.request(p, i) });

const ids: Record<string, string> = {};

async function names() {
  const res = await anon().call('GET', '/stations');
  return (res.body.data as { name: string; sequence: number }[]).map((s) => `${s.sequence}:${s.name}`);
}

beforeAll(async () => {
  ctx = await setupTestApp();
  const { authService } = await import('@modules/auth');
  await authService.createUser({ email: 'admin@t.test', password: 'Password123', fullName: 'Admin', role: 'admin' });
  await authService.createUser({ email: 'pax@t.test', password: 'Password123', fullName: 'Pax', role: 'passenger' });
  admin = anon();
  await admin.call('POST', '/auth/login', { email: 'admin@t.test', password: 'Password123' });
  passenger = anon();
  await passenger.call('POST', '/auth/login', { email: 'pax@t.test', password: 'Password123' });

  // A small line at known coordinates (0.01° of latitude ≈ 1.11 km apart).
  for (const [i, n] of ['A', 'B', 'C', 'D'].entries()) {
    const res = await admin.call('POST', '/stations', { name: n, latitude: 14 + i * 0.01, longitude: 121 });
    expect(res.status).toBe(201);
    ids[n] = res.body.data.id;
  }
}, 120_000);

afterAll(async () => {
  await ctx?.close();
});

describe('stations', () => {
  it('lists stations publicly in line order with route distances (STN-02, STN-04)', async () => {
    const res = await anon().call('GET', '/stations');
    expect(res.status).toBe(200);
    const list = res.body.data as { name: string; sequence: number; distanceMeters: number }[];
    expect(list.map((s) => s.name)).toEqual(['A', 'B', 'C', 'D']);
    expect(list.map((s) => s.sequence)).toEqual([1, 2, 3, 4]);
    expect(list[0]!.distanceMeters).toBe(0);
    expect(list[1]!.distanceMeters).toBeGreaterThan(1100);
    expect(list[1]!.distanceMeters).toBeLessThan(1120);
    expect(list[3]!.distanceMeters).toBeGreaterThan(list[2]!.distanceMeters);
  });

  it('only admins may change stations or see inactive ones (AUTH-04)', async () => {
    expect((await anon().call('POST', '/stations', { name: 'X', latitude: 14, longitude: 121 })).status).toBe(401);
    expect((await passenger.call('POST', '/stations', { name: 'X', latitude: 14, longitude: 121 })).status).toBe(403);
    expect((await passenger.call('PATCH', `/stations/${ids.A}`, { name: 'Hacked' })).status).toBe(403);
    expect((await passenger.call('DELETE', `/stations/${ids.A}`)).status).toBe(403);
    expect((await passenger.call('POST', '/stations/reorder', { ids: [ids.A] })).status).toBe(403);
    expect((await passenger.call('GET', '/stations?includeInactive=true')).status).toBe(403);
    expect((await admin.call('GET', '/stations?includeInactive=true')).status).toBe(200);
  });

  it('validates input', async () => {
    expect((await admin.call('POST', '/stations', { name: '', latitude: 14, longitude: 121 })).status).toBe(400);
    expect((await admin.call('POST', '/stations', { name: 'Bad', latitude: 99, longitude: 121 })).status).toBe(400);
    expect((await admin.call('PATCH', `/stations/${ids.A}`, {})).status).toBe(400);
    expect((await admin.call('PATCH', '/stations/00000000-0000-4000-8000-000000000000', { name: 'Nope' })).status).toBe(404);
  });

  it('moves and renames a station (STN-03)', async () => {
    const res = await admin.call('PATCH', `/stations/${ids.B}`, { name: 'B2', latitude: 14.0105, longitude: 121.0003 });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ name: 'B2', latitude: 14.0105, longitude: 121.0003, sequence: 2 });
    await admin.call('PATCH', `/stations/${ids.B}`, { name: 'B', latitude: 14.01, longitude: 121 });
  });

  it('inserts at a position and shifts the rest, then deletes and closes the gap', async () => {
    const mid = await admin.call('POST', '/stations', { name: 'Mid', latitude: 14.015, longitude: 121, sequence: 3 });
    expect(mid.body.data.sequence).toBe(3);
    expect(await names()).toEqual(['1:A', '2:B', '3:Mid', '4:C', '5:D']);
    expect((await admin.call('DELETE', `/stations/${mid.body.data.id}`)).status).toBe(200);
    expect(await names()).toEqual(['1:A', '2:B', '3:C', '4:D']);
  });

  it('reorders the whole line in one step and rejects incomplete orders', async () => {
    expect((await admin.call('POST', '/stations/reorder', { ids: [ids.D, ids.C, ids.B, ids.A] })).status).toBe(200);
    expect(await names()).toEqual(['1:D', '2:C', '3:B', '4:A']);
    expect((await admin.call('POST', '/stations/reorder', { ids: [ids.A, ids.B] })).status).toBe(400);
    expect((await admin.call('POST', '/stations/reorder', { ids: [ids.A, ids.A, ids.B, ids.C] })).status).toBe(400);
    await admin.call('POST', '/stations/reorder', { ids: [ids.A, ids.B, ids.C, ids.D] });
    expect(await names()).toEqual(['1:A', '2:B', '3:C', '4:D']);
  });

  it('hides deactivated stations from the public list and rejects them for fares (STN-05)', async () => {
    await admin.call('PATCH', `/stations/${ids.C}`, { isActive: false });
    expect((await names()).join()).toBe('1:A,2:B,4:D');
    const q = await anon().call('GET', `/fares/quote?origin=${ids.A}&destination=${ids.C}`);
    expect(q.status).toBe(400);
    const all = await admin.call('GET', '/stations?includeInactive=true');
    expect(all.body.data).toHaveLength(4);
    await admin.call('PATCH', `/stations/${ids.C}`, { isActive: true });
  });
});

describe('fares', () => {
  it('quotes base + per-station in either direction (FARE-01, FARE-03)', async () => {
    const ab = await anon().call('GET', `/fares/quote?origin=${ids.A}&destination=${ids.B}`);
    expect(ab.status).toBe(200);
    expect(ab.body.data).toMatchObject({ stationsTravelled: 1, fareCentavos: 1700, source: 'computed' });
    const da = await anon().call('GET', `/fares/quote?origin=${ids.D}&destination=${ids.A}`);
    expect(da.body.data).toMatchObject({ stationsTravelled: 3, fareCentavos: 2100 });
    const ad = await anon().call('GET', `/fares/quote?origin=${ids.A}&destination=${ids.D}`);
    expect(ad.body.data.fareCentavos).toBe(2100);
  });

  it('rejects the same station and unknown stations', async () => {
    expect((await anon().call('GET', `/fares/quote?origin=${ids.A}&destination=${ids.A}`)).status).toBe(400);
    expect((await anon().call('GET', `/fares/quote?origin=${ids.A}&destination=00000000-0000-4000-8000-000000000000`)).status).toBe(404);
    expect((await anon().call('GET', '/fares/quote?origin=x&destination=y')).status).toBe(400);
  });

  it('an admin override replaces the computed fare for that pair, in both directions (FARE-02)', async () => {
    const [a, b] = ids.A! < ids.D! ? [ids.A, ids.D] : [ids.D, ids.A];
    await ctx.db.getDb().query('INSERT INTO fare_overrides (station_a_id, station_b_id, fare_centavos) VALUES ($1, $2, 5000)', [a, b]);
    for (const [o, d] of [[ids.A, ids.D], [ids.D, ids.A]] as const) {
      const res = await anon().call('GET', `/fares/quote?origin=${o}&destination=${d}`);
      expect(res.body.data).toMatchObject({ fareCentavos: 5000, source: 'override' });
    }
    // Other pairs are unaffected.
    expect((await anon().call('GET', `/fares/quote?origin=${ids.A}&destination=${ids.C}`)).body.data.source).toBe('computed');
  });
});
