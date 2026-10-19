import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Session, setupTestApp } from './helpers';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
let admin: Session;
let passenger: Session;
const anon = () => new Session({ request: (p, i) => ctx.api.request(p, i) });

const konduktorBody = (n: number) => ({
  email: `Kond${n}@T.test`,
  password: 'Password123',
  fullName: `Konduktor ${n}`,
  employeeNo: `KND-${n}`,
  phone: '0917 000 000' + n,
});

beforeAll(async () => {
  ctx = await setupTestApp();
  const { authService } = await import('@modules/auth');
  await authService.createUser({ email: 'admin@t.test', password: 'Password123', fullName: 'Admin', role: 'admin' });
  await authService.createUser({ email: 'pax@t.test', password: 'Password123', fullName: 'Pax', role: 'passenger' });
  admin = anon();
  await admin.call('POST', '/auth/login', { email: 'admin@t.test', password: 'Password123' });
  passenger = anon();
  await passenger.call('POST', '/auth/login', { email: 'pax@t.test', password: 'Password123' });
}, 120_000);

afterAll(async () => {
  await ctx?.close();
});

describe('konduktors', () => {
  it('admin creates a konduktor who can then sign in (KON-02)', async () => {
    const res = await admin.call('POST', '/konduktors', konduktorBody(1));
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email: 'kond1@t.test', fullName: 'Konduktor 1', employeeNo: 'KND-1', isActive: true, bus: null });

    const k = anon();
    const login = await k.call('POST', '/auth/login', { email: 'kond1@t.test', password: 'Password123' });
    expect(login.status).toBe(200);
    expect(login.body.data.role).toBe('konduktor');
  });

  it('only admins manage konduktors, and passengers cannot self-register as one (AUTH-04, AUTH-05)', async () => {
    expect((await anon().call('GET', '/konduktors')).status).toBe(401);
    expect((await passenger.call('GET', '/konduktors')).status).toBe(403);
    expect((await passenger.call('POST', '/konduktors', konduktorBody(9))).status).toBe(403);
    const reg = await anon().call('POST', '/auth/register', { email: 'sneaky@t.test', password: 'Password123', fullName: 'Sneaky', role: 'konduktor' });
    expect(reg.body.data.role).toBe('passenger');
  });

  it('rejects duplicate emails and employee numbers, and rolls back the half-created account', async () => {
    expect((await admin.call('POST', '/konduktors', konduktorBody(1))).status).toBe(409);
    const dupNo = await admin.call('POST', '/konduktors', { ...konduktorBody(2), employeeNo: 'knd-1' });
    expect(dupNo.status).toBe(409);
    expect(dupNo.body.error.message).toMatch(/employee number/i);
    // The user row from the failed attempt must not linger: the same email works with a free employee number.
    expect((await admin.call('POST', '/konduktors', konduktorBody(2))).status).toBe(201);
  });

  it('updates the profile, resets the password, and deactivates (login blocked)', async () => {
    const list = await admin.call('GET', '/konduktors?pageSize=50');
    const k2 = (list.body.data.items as { id: string; email: string }[]).find((k) => k.email === 'kond2@t.test')!;
    const upd = await admin.call('PATCH', `/konduktors/${k2.id}`, { fullName: 'Konduktor Two', phone: '', password: 'NewPassword456' });
    expect(upd.status).toBe(200);
    expect(upd.body.data).toMatchObject({ fullName: 'Konduktor Two', phone: null });
    expect((await anon().call('POST', '/auth/login', { email: 'kond2@t.test', password: 'Password123' })).status).toBe(401);
    expect((await anon().call('POST', '/auth/login', { email: 'kond2@t.test', password: 'NewPassword456' })).status).toBe(200);

    await admin.call('PATCH', `/konduktors/${k2.id}`, { isActive: false });
    expect((await anon().call('POST', '/auth/login', { email: 'kond2@t.test', password: 'NewPassword456' })).status).toBe(401);
    expect((await admin.call('PATCH', `/konduktors/${k2.id}`, {})).status).toBe(400);
  });

  it('a konduktor sees only their own profile and bus (KON-03)', async () => {
    const k = anon();
    await k.call('POST', '/auth/login', { email: 'kond1@t.test', password: 'Password123' });
    const me = await k.call('GET', '/konduktors/me');
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe('kond1@t.test');
    expect((await k.call('GET', '/konduktors')).status).toBe(403);
    expect((await admin.call('GET', '/konduktors/me')).status).toBe(403);
  });
});

describe('buses', () => {
  const ids: Record<string, string> = {};

  it('admin creates buses; plates are normalized and unique (BUS-01, BUS-02)', async () => {
    const a = await admin.call('POST', '/buses', { plateNumber: '  ncv   1101 ', name: 'Bus 1' });
    expect(a.status).toBe(201);
    expect(a.body.data).toMatchObject({ plateNumber: 'NCV 1101', name: 'Bus 1', status: 'active', konduktor: null });
    ids.a = a.body.data.id;
    expect((await admin.call('POST', '/buses', { plateNumber: 'ncv 1101', name: 'Dup' })).status).toBe(409);
    const b = await admin.call('POST', '/buses', { plateNumber: 'NCV 1102', name: 'Bus 2' });
    ids.b = b.body.data.id;
    expect((await admin.call('POST', '/buses', { plateNumber: '', name: 'X' })).status).toBe(400);
    expect((await passenger.call('GET', '/buses')).status).toBe(403);
    expect((await admin.call('GET', '/buses')).body.data).toMatchObject({ total: 2, page: 1, pageSize: 10, totalPages: 1 });
  });

  it('edits status and rejects bad values', async () => {
    const res = await admin.call('PATCH', `/buses/${ids.b}`, { status: 'maintenance', name: 'Bus Two' });
    expect(res.body.data).toMatchObject({ status: 'maintenance', name: 'Bus Two' });
    expect((await admin.call('PATCH', `/buses/${ids.b}`, { status: 'flying' })).status).toBe(400);
    expect((await admin.call('PATCH', `/buses/${ids.b}`, { plateNumber: 'NCV 1101' })).status).toBe(409);
    await admin.call('PATCH', `/buses/${ids.b}`, { status: 'active' });
  });

  it('assigns and unassigns a konduktor; one bus per konduktor, one konduktor per bus (BUS-03)', async () => {
    const list = await admin.call('GET', '/konduktors?pageSize=50');
    const k1 = (list.body.data.items as { id: string; email: string }[]).find((k) => k.email === 'kond1@t.test')!;

    const assigned = await admin.call('PUT', `/buses/${ids.a}/konduktor`, { konduktorId: k1.id });
    expect(assigned.status).toBe(200);
    expect(assigned.body.data.konduktor).toMatchObject({ id: k1.id, fullName: 'Konduktor 1' });

    // The same konduktor cannot also drive bus B.
    const clash = await admin.call('PUT', `/buses/${ids.b}/konduktor`, { konduktorId: k1.id });
    expect(clash.status).toBe(409);
    expect(clash.body.error.message).toMatch(/already assigned to Bus 1/);

    // Re-assigning to the same bus is fine; unassigning frees them.
    expect((await admin.call('PUT', `/buses/${ids.a}/konduktor`, { konduktorId: k1.id })).status).toBe(200);
    expect((await admin.call('PUT', `/buses/${ids.a}/konduktor`, { konduktorId: null })).body.data.konduktor).toBeNull();
    expect((await admin.call('PUT', `/buses/${ids.b}/konduktor`, { konduktorId: k1.id })).status).toBe(200);

    const me = anon();
    await me.call('POST', '/auth/login', { email: 'kond1@t.test', password: 'Password123' });
    expect((await me.call('GET', '/konduktors/me')).body.data.bus).toMatchObject({ plateNumber: 'NCV 1102' });

    expect((await admin.call('PUT', `/buses/${ids.a}/konduktor`, { konduktorId: '00000000-0000-4000-8000-000000000000' })).status).toBe(404);
    expect((await passenger.call('PUT', `/buses/${ids.a}/konduktor`, { konduktorId: null })).status).toBe(403);
  });

  it('cannot assign a deactivated konduktor, and deactivating frees their bus', async () => {
    const list = await admin.call('GET', '/konduktors?pageSize=50');
    const k1 = (list.body.data.items as { id: string; email: string }[]).find((k) => k.email === 'kond1@t.test')!;
    const k2 = (list.body.data.items as { id: string; email: string }[]).find((k) => k.email === 'kond2@t.test')!;
    expect((await admin.call('PUT', `/buses/${ids.a}/konduktor`, { konduktorId: k2.id })).status).toBe(400);

    await admin.call('PATCH', `/konduktors/${k1.id}`, { isActive: false });
    const buses = await admin.call('GET', '/buses?pageSize=50');
    expect((buses.body.data.items as { id: string; konduktor: unknown }[]).find((b) => b.id === ids.b)!.konduktor).toBeNull();
    await admin.call('PATCH', `/konduktors/${k1.id}`, { isActive: true });
  });

  it('deletes a bus; deleting a konduktor frees their bus and removes the login', async () => {
    expect((await admin.call('DELETE', `/buses/${ids.a}`)).status).toBe(200);
    expect((await admin.call('DELETE', `/buses/${ids.a}`)).status).toBe(404);

    const list = await admin.call('GET', '/konduktors?pageSize=50');
    const k1 = (list.body.data.items as { id: string; email: string }[]).find((k) => k.email === 'kond1@t.test')!;
    await admin.call('PUT', `/buses/${ids.b}/konduktor`, { konduktorId: k1.id });
    expect((await admin.call('DELETE', `/konduktors/${k1.id}`)).status).toBe(200);
    expect((await anon().call('POST', '/auth/login', { email: 'kond1@t.test', password: 'Password123' })).status).toBe(401);
    const buses = await admin.call('GET', '/buses?pageSize=50');
    expect((buses.body.data.items as { id: string; konduktor: unknown }[]).find((b) => b.id === ids.b)!.konduktor).toBeNull();
  });
});

describe('fare settings and overrides', () => {
  const st: string[] = [];

  beforeAll(async () => {
    for (const [i, n] of ['A', 'B', 'C'].entries()) {
      st.push((await admin.call('POST', '/stations', { name: n, latitude: 14 + i * 0.01, longitude: 121 })).body.data.id);
    }
  });

  it('only admins read or change the fare rule; changing it changes new quotes (FARE-01)', async () => {
    expect((await passenger.call('GET', '/fares/settings')).status).toBe(403);
    expect((await passenger.call('PUT', '/fares/settings', { baseFareCentavos: 1, perStationCentavos: 1 })).status).toBe(403);
    expect((await admin.call('GET', '/fares/settings')).body.data).toEqual({ baseFareCentavos: 1500, perStationCentavos: 200 });

    const saved = await admin.call('PUT', '/fares/settings', { baseFareCentavos: 2000, perStationCentavos: 300 });
    expect(saved.body.data).toEqual({ baseFareCentavos: 2000, perStationCentavos: 300 });
    expect((await anon().call('GET', `/fares/quote?origin=${st[0]}&destination=${st[2]}`)).body.data.fareCentavos).toBe(2600);

    expect((await admin.call('PUT', '/fares/settings', { baseFareCentavos: -1, perStationCentavos: 1 })).status).toBe(400);
    expect((await admin.call('PUT', '/fares/settings', { baseFareCentavos: 1.5, perStationCentavos: 1 })).status).toBe(400);
    expect((await admin.call('PUT', '/fares/settings', { baseFareCentavos: 99999999, perStationCentavos: 1 })).status).toBe(400);
    await admin.call('PUT', '/fares/settings', { baseFareCentavos: 1500, perStationCentavos: 200 });
  });

  it('sets, replaces and removes a fixed fare for a pair, in both directions (FARE-02)', async () => {
    expect((await passenger.call('GET', '/fares/overrides')).status).toBe(403);
    const set = await admin.call('PUT', '/fares/overrides', { originId: st[2], destinationId: st[0], fareCentavos: 4000 });
    expect(set.status).toBe(200);
    // Presented with the station nearer the start of the line first, whichever way it was entered.
    expect(set.body.data).toEqual([{ originId: st[0], destinationId: st[2], originName: 'A', destinationName: 'C', fareCentavos: 4000 }]);
    for (const [o, d] of [[st[0], st[2]], [st[2], st[0]]] as const) {
      expect((await anon().call('GET', `/fares/quote?origin=${o}&destination=${d}`)).body.data).toMatchObject({ fareCentavos: 4000, source: 'override' });
    }

    await admin.call('PUT', '/fares/overrides', { originId: st[0], destinationId: st[2], fareCentavos: 3500 });
    expect(((await admin.call('GET', '/fares/overrides')).body.data as unknown[]).length).toBe(1);
    expect((await anon().call('GET', `/fares/quote?origin=${st[0]}&destination=${st[2]}`)).body.data.fareCentavos).toBe(3500);

    expect((await admin.call('PUT', '/fares/overrides', { originId: st[0], destinationId: st[0], fareCentavos: 100 })).status).toBe(400);
    expect((await admin.call('PUT', '/fares/overrides', { originId: st[0], destinationId: '00000000-0000-4000-8000-000000000000', fareCentavos: 100 })).status).toBe(404);

    expect((await admin.call('DELETE', `/fares/overrides?origin=${st[2]}&destination=${st[0]}`)).body.data).toEqual([]);
    expect((await anon().call('GET', `/fares/quote?origin=${st[0]}&destination=${st[2]}`)).body.data).toMatchObject({ fareCentavos: 1900, source: 'computed' });
    expect((await admin.call('DELETE', `/fares/overrides?origin=${st[2]}&destination=${st[0]}`)).status).toBe(404);
  });
});
