import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Session, setupTestApp, TEST_SSO_SECRET } from './helpers';

/** Single sign-on from the partner system (the Smart City app): the hand-off link and the server-to-server ticket list. */

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
const anon = () => new Session({ request: (p, i) => ctx.api.request(p, i) });
const db = () => ctx.db.getDb();

const enc = (s: string) => new TextEncoder().encode(s);
let counter = 0;

type Opts = { sub?: string; name?: string; email?: string; aud?: string; secret?: string; iss?: string; ageSeconds?: number; expiresIn?: string; alg?: 'HS256' | 'HS512'; jti?: string | null };
/** What the partner's backend does: sign a short-lived token. */
async function token(o: Opts = {}) {
  const issuedAt = Math.floor(Date.now() / 1000) - (o.ageSeconds ?? 0);
  const jwt = new SignJWT({ name: o.name ?? 'Juan Dela Cruz', email: o.email ?? 'juan@sce.test' })
    .setProtectedHeader({ alg: o.alg ?? 'HS256' })
    .setSubject(o.sub ?? 'citizen-1')
    .setIssuer(o.iss ?? 'sce')
    .setAudience(o.aud ?? 'brt')
    .setIssuedAt(issuedAt)
    .setExpirationTime(o.expiresIn ?? issuedAt + 60);
  if (o.jti !== null) jwt.setJti(o.jti ?? `jti-${++counter}-${Math.random().toString(36).slice(2)}`);
  return jwt.sign(enc(o.secret ?? TEST_SSO_SECRET));
}

const login = (s: Session, t: string, next?: string) => s.call('GET', `/sso/login?token=${encodeURIComponent(t)}${next ? `&next=${encodeURIComponent(next)}` : ''}`);
const partnerTickets = (t?: string) => ctx.api.request('/partner/tickets', { headers: t ? { Authorization: `Bearer ${t}` } : {} });

beforeAll(async () => {
  ctx = await setupTestApp();
}, 120_000);
afterAll(async () => {
  await ctx?.close();
});

describe('the hand-off link (GET /sso/login)', () => {
  it('signs a new person in as a passenger, creates their account, and lands on the passenger pages', async () => {
    const s = anon();
    const res = await login(s, await token({ sub: 'citizen-new', name: 'Maria Santos', email: 'maria@sce.test' }));
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
    const me = (await s.call('GET', '/auth/me')).body.data;
    expect(me).toMatchObject({ email: 'maria@sce.test', fullName: 'Maria Santos', role: 'passenger' });
    const row = (await db().query<{ external_provider: string; external_id: string; role: string }>("SELECT external_provider, external_id, role FROM users WHERE email = 'maria@sce.test'"))[0]!;
    expect(row).toMatchObject({ external_provider: 'sce', external_id: 'citizen-new', role: 'passenger' });
  });

  it('is the same account the next time, found by the partner id, and the name follows the partner', async () => {
    const first = anon();
    await login(first, await token({ sub: 'citizen-same', name: 'Old Name', email: 'same@sce.test' }));
    const id = (await first.call('GET', '/auth/me')).body.data.id;
    const second = anon();
    await login(second, await token({ sub: 'citizen-same', name: 'New Name', email: 'changed@sce.test' }));
    const me = (await second.call('GET', '/auth/me')).body.data;
    expect(me.id).toBe(id);
    expect(me.fullName).toBe('New Name');
    expect(Number((await db().query<{ n: string }>("SELECT count(*) AS n FROM users WHERE external_id = 'citizen-same'"))[0]!.n)).toBe(1);
  });

  it('works once: the same link opened again is refused and signs nobody in', async () => {
    const t = await token({ sub: 'citizen-once' });
    expect((await login(anon(), t)).headers.get('location')).toBe('/');
    const again = anon();
    const res = await login(again, t);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/login?sso=failed');
    expect((await again.call('GET', '/auth/me')).body.data).toBeNull();
  });

  it.each([
    ['signed with another secret', { secret: 'another-shared-secret-0123456789abcdefgh' }],
    ['from another issuer', { iss: 'someone-else' }],
    ['meant for the ticket API, not the browser', { aud: 'brt-api' }],
    ['already expired', { ageSeconds: 300, expiresIn: undefined }],
    ['older than the maximum age even though it has not expired', { ageSeconds: 600, expiresIn: '1h' }],
    ['signed with another algorithm', { alg: 'HS512' as const }],
    ['without an id', { jti: null }],
  ])('refuses a token %s', async (_why, opts) => {
    const s = anon();
    const res = await login(s, await token({ sub: 'citizen-bad', ...opts }));
    expect(res.headers.get('location')).toBe('/login?sso=failed');
    expect((await s.call('GET', '/auth/me')).body.data).toBeNull();
    expect((await db().query("SELECT 1 FROM users WHERE external_id = 'citizen-bad'")).length).toBe(0);
  });

  it('refuses something that is not a token at all', async () => {
    expect((await anon().call('GET', '/sso/login?token=' + 'x'.repeat(40))).headers.get('location')).toBe('/login?sso=failed');
    expect((await anon().call('GET', '/sso/login')).status).toBe(400);
  });

  it('only lands on the passenger pages: another address in `next` is ignored', async () => {
    expect((await login(anon(), await token({ sub: 'n1' }), '/tickets')).headers.get('location')).toBe('/tickets');
    expect((await login(anon(), await token({ sub: 'n2' }), '/tickets/3f2b1c0e-9a4d-4e0b-8c1a-7d6e5f4a3b2c')).headers.get('location')).toBe('/tickets/3f2b1c0e-9a4d-4e0b-8c1a-7d6e5f4a3b2c');
    for (const bad of ['https://evil.example', '//evil.example', '/admin', '/api/auth/logout', 'javascript:alert(1)']) {
      expect((await login(anon(), await token({ sub: 'n3' }), bad)).headers.get('location')).toBe('/');
    }
  });

  it('never merges into an existing BRT account that has the same email', async () => {
    const { authService } = await import('@modules/auth');
    const local = await authService.createUser({ email: 'taken@sce.test', password: 'Password123', fullName: 'Local Person', role: 'passenger' });
    const s = anon();
    expect((await login(s, await token({ sub: 'citizen-clash', email: 'taken@sce.test', name: 'Someone Else' }))).headers.get('location')).toBe('/');
    const me = (await s.call('GET', '/auth/me')).body.data;
    expect(me.id).not.toBe(local.id);
    expect(me.email).toMatch(/@sso\.invalid$/);
    expect(me.fullName).toBe('Someone Else');
    // the local account is untouched
    const still = (await db().query<{ external_id: string | null; full_name: string }>('SELECT external_id, full_name FROM users WHERE id = $1', [local.id]))[0]!;
    expect(still).toEqual({ external_id: null, full_name: 'Local Person' });
  });

  it('cannot sign in anyone who is not a passenger, or whose account is switched off', async () => {
    const make = async (sub: string) => {
      const s = anon();
      await login(s, await token({ sub }));
      return (await s.call('GET', '/auth/me')).body.data.id as string;
    };
    const adminId = await make('citizen-admin');
    await db().query("UPDATE users SET role = 'admin' WHERE id = $1", [adminId]);
    expect((await login(anon(), await token({ sub: 'citizen-admin' }))).headers.get('location')).toBe('/login?sso=failed');

    const offId = await make('citizen-off');
    await db().query('UPDATE users SET is_active = false WHERE id = $1', [offId]);
    const s = anon();
    expect((await login(s, await token({ sub: 'citizen-off' }))).headers.get('location')).toBe('/login?sso=failed');
    expect((await s.call('GET', '/auth/me')).body.data).toBeNull();
  });
});

describe('the ticket list for the partner backend (GET /partner/tickets)', () => {
  const st: string[] = [];

  beforeAll(async () => {
    const { authService } = await import('@modules/auth');
    await authService.createUser({ email: 'admin@t.test', password: 'Password123', fullName: 'Admin', role: 'admin' });
    const admin = anon();
    await admin.call('POST', '/auth/login', { email: 'admin@t.test', password: 'Password123' });
    for (const [i, n] of ['A', 'B', 'C'].entries()) st.push((await admin.call('POST', '/stations', { name: n, latitude: 14 + i * 0.01, longitude: 121 })).body.data.id);
  });

  it('needs a Bearer token, of the right kind', async () => {
    expect((await partnerTickets()).status).toBe(401);
    expect((await partnerTickets('not-a-token-at-all-not-a-token-at-all')).status).toBe(401);
    // a hand-off token (audience brt) is not a ticket-list token
    expect((await partnerTickets(await token({ aud: 'brt' }))).status).toBe(401);
    expect((await partnerTickets(await token({ aud: 'brt-api', secret: 'another-shared-secret-0123456789abcdefgh' }))).status).toBe(401);
  });

  it('is empty for a citizen who has never opened BRT', async () => {
    const res = await partnerTickets(await token({ aud: 'brt-api', sub: 'citizen-never' }));
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ items: [], total: 0, page: 1, pageSize: 10, totalPages: 1, counts: { all: 0, pay: 0, ready: 0, transactions: 0 } });
  });

  it('lists the tickets bought by that citizen, and only theirs, without any QR token', async () => {
    const a = anon();
    await login(a, await token({ sub: 'citizen-buyer', email: 'buyer@sce.test' }));
    const bought = (await a.call('POST', '/tickets', { originId: st[0], destinationId: st[2] })).body.data as { id: string };
    const b = anon();
    await login(b, await token({ sub: 'citizen-other', email: 'other@sce.test' }));
    await b.call('POST', '/tickets', { originId: st[1], destinationId: st[2] });

    const page = (await (await partnerTickets(await token({ aud: 'brt-api', sub: 'citizen-buyer' }))).json()).data as { items: { id: string; status: string; originName: string; destinationName: string }[] };
    const mine = page.items;
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id: bought.id, status: 'pending_payment', originName: 'A', destinationName: 'C' });
    expect(JSON.stringify(mine)).not.toMatch(/qr|token|password|email/i);
  });
});

describe('the ticket list is paged, ten at a time, and filtered by the server', () => {
  const listFor = async (sub: string, query = '') => {
    const res = await ctx.api.request(`/partner/tickets${query}`, { headers: { Authorization: `Bearer ${await token({ aud: 'brt-api', sub })}` } });
    return { status: res.status, data: (await res.json()).data as { items: { referenceCode: string; status: string }[]; page: number; pageSize: number; total: number; totalPages: number; counts: Record<string, number> } };
  };

  beforeAll(async () => {
    const s = anon();
    await login(s, await token({ sub: 'citizen-many', email: 'many@sce.test' }));
    const userId = (await s.call('GET', '/auth/me')).body.data.id as string;
    const { authService } = await import('@modules/auth');
    await authService.createUser({ email: 'admin2@t.test', password: 'Password123', fullName: 'Admin Two', role: 'admin' });
    const admin = anon();
    await admin.call('POST', '/auth/login', { email: 'admin2@t.test', password: 'Password123' });
    const a = (await admin.call('POST', '/stations', { name: 'P1', latitude: 14.5, longitude: 121 })).body.data.id;
    const b = (await admin.call('POST', '/stations', { name: 'P2', latitude: 14.6, longitude: 121 })).body.data.id;
    // 14 tickets, oldest first: 7 used, 5 expired, 2 paid.
    for (let i = 0; i < 14; i++) {
      const status = i < 7 ? 'used' : i < 12 ? 'expired' : 'paid';
      await db().query(
        `INSERT INTO tickets (reference_code, passenger_id, origin_station_id, destination_station_id, fare_centavos, status, valid_until, created_at, quantity)
         VALUES ($1, $2, $3, $4, 100, $5, now() + interval '1 day', now() - ($6 || ' minutes')::interval, 1)`,
        [`BRT-PG${String(i).padStart(2, '0')}`, userId, a, b, status, String(100 - i)],
      );
    }
  });

  it('returns ten at a time with the totals, newest first', async () => {
    const first = (await listFor('citizen-many')).data;
    expect(first).toMatchObject({ page: 1, pageSize: 10, total: 14, totalPages: 2 });
    expect(first.items).toHaveLength(10);
    expect(first.items[0]!.referenceCode).toBe('BRT-PG13'); // the newest
    const second = (await listFor('citizen-many', '?page=2')).data;
    expect(second.items).toHaveLength(4);
    expect(second.items.some((t) => first.items.some((f) => f.referenceCode === t.referenceCode))).toBe(false);
    expect(second.items[second.items.length - 1]!.referenceCode).toBe('BRT-PG00'); // the oldest
  });

  it('says how many there are under each filter, and filters on the server', async () => {
    const ready = (await listFor('citizen-many', '?filter=ready')).data;
    // The tickets were bought 1 to 100 minutes ago, so all of them are recent.
    expect(ready.counts).toEqual({ all: 14, pay: 0, ready: 2, transactions: 12 });
    expect(ready.total).toBe(2);
    expect(ready.items.every((t) => t.status === 'paid')).toBe(true);
    const past = (await listFor('citizen-many', '?filter=transactions')).data;
    expect(past).toMatchObject({ total: 12, totalPages: 2 });
    expect(past.items.every((t) => ['used', 'expired', 'cancelled'].includes(t.status))).toBe(true);
    expect((await listFor('citizen-many', '?filter=pay')).data).toMatchObject({ total: 0, items: [] });
  });

  it('lists as transactions only the finished tickets bought in the last week', async () => {
    const s = anon();
    await login(s, await token({ sub: 'citizen-week', email: 'week@sce.test' }));
    const userId = (await s.call('GET', '/auth/me')).body.data.id as string;
    const [a, b] = (await db().query<{ id: string }>('SELECT id FROM stations ORDER BY name LIMIT 2')).map((r) => r.id);
    const add = (code: string, status: string, daysAgo: number) =>
      db().query(
        "INSERT INTO tickets (reference_code, passenger_id, origin_station_id, destination_station_id, fare_centavos, status, valid_until, created_at, quantity) VALUES ($1, $2, $3, $4, 100, $5, now() + interval '1 day', now() - ($6 || ' days')::interval, 1)",
        [code, userId, a, b, status, String(daysAgo)],
      );
    await add('BRT-WK01', 'used', 1);
    await add('BRT-WK02', 'expired', 6);
    await add('BRT-WK03', 'cancelled', 9); // older than a week
    await add('BRT-WK04', 'used', 30); // much older
    await add('BRT-WK05', 'paid', 20); // not finished: Ready to ride, whatever its age
    const tx = (await listFor('citizen-week', '?filter=transactions')).data;
    expect(tx.items.map((t) => t.referenceCode)).toEqual(['BRT-WK01', 'BRT-WK02']);
    expect(tx.total).toBe(2);
    // All still counts and lists everything, and Ready to ride has no time limit.
    const all = (await listFor('citizen-week')).data;
    expect(all.counts).toEqual({ all: 5, pay: 0, ready: 1, transactions: 2 });
    expect((await listFor('citizen-week', '?filter=ready')).data.items.map((t) => t.referenceCode)).toEqual(['BRT-WK05']);
  });

  it('clamps a page past the end, and refuses silly sizes and filters', async () => {
    expect((await listFor('citizen-many', '?page=99')).data.page).toBe(2);
    expect((await listFor('citizen-many', '?pageSize=51')).status).toBe(400);
    expect((await listFor('citizen-many', '?page=0')).status).toBe(400);
    expect((await listFor('citizen-many', '?filter=everything')).status).toBe(400);
  });
});

describe('the QR of one paid ticket for the partner backend (GET /partner/tickets/:id/qr.png)', () => {
  const qr = async (sub: string | null, id: string) => {
    const headers: Record<string, string> = {};
    if (sub) headers.Authorization = `Bearer ${await token({ aud: 'brt-api', sub })}`;
    return ctx.api.request(`/partner/tickets/${id}/qr.png`, { headers });
  };
  const idOf = async (code: string) => (await db().query<{ id: string }>('SELECT id FROM tickets WHERE reference_code = $1', [code]))[0]!.id;

  it('is a PNG image for a paid ticket of that citizen, never cached', async () => {
    const res = await qr('citizen-many', await idOf('BRT-PG13')); // paid, see the paging tests above
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toContain('no-store');
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it('has none for a ticket that is not paid (used, expired)', async () => {
    expect((await qr('citizen-many', await idOf('BRT-PG00'))).status).toBe(409); // used
    expect((await qr('citizen-many', await idOf('BRT-PG08'))).status).toBe(409); // expired
  });

  it("is not found for another citizen's ticket, an unknown ticket or a bad id", async () => {
    const paid = await idOf('BRT-PG13');
    expect((await qr('citizen-other', paid)).status).toBe(404);
    expect((await qr('citizen-never-opened', paid)).status).toBe(404);
    expect((await qr('citizen-many', '3f2b1c0e-9a4d-4e0b-8c1a-7d6e5f4a3b2c')).status).toBe(404);
    expect((await qr('citizen-many', 'not-an-id')).status).toBe(404);
  });

  it('needs a Bearer token of the right kind', async () => {
    const paid = await idOf('BRT-PG13');
    expect((await qr(null, paid)).status).toBe(401);
    const wrong = await ctx.api.request(`/partner/tickets/${paid}/qr.png`, { headers: { Authorization: `Bearer ${await token({ aud: 'brt', sub: 'citizen-many' })}` } });
    expect(wrong.status).toBe(401);
  });
});
