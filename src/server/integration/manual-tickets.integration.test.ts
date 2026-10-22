import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Session, setupTestApp } from './helpers';

/**
 * Tickets sold over the counter by an admin: created paid at once, with the fare from the stations, a QR code the admin can print or
 * download, and scannable by a konduktor at the boarding shelter like any other ticket.
 */

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
let admin: Session;
let pax: Session;
let kond: Session;
const anon = () => new Session({ request: (p, i) => ctx.api.request(p, i) });
const db = () => ctx.db.getDb();
const st: string[] = [];
const ids: Record<string, string> = {};

type Manual = {
  id: string;
  referenceCode: string;
  status: string;
  fareCentavos: number;
  quantity: number;
  passengerName: string | null;
  encodedByName: string | null;
  originName: string;
  destinationName: string;
  busId: string | null;
};

beforeAll(async () => {
  ctx = await setupTestApp();
  const { authService } = await import('@modules/auth');
  await authService.createUser({ email: 'admin@t.test', password: 'Password123', fullName: 'Ana Admin', role: 'admin' });
  await authService.createUser({ email: 'pax@t.test', password: 'Password123', fullName: 'Pax', role: 'passenger' });
  const signIn = async (email: string) => {
    const s = anon();
    await s.call('POST', '/auth/login', { email, password: 'Password123' });
    return s;
  };
  admin = await signIn('admin@t.test');
  pax = await signIn('pax@t.test');
  for (const [i, n] of ['A', 'B', 'C'].entries()) st.push((await admin.call('POST', '/stations', { name: n, latitude: 14 + i * 0.01, longitude: 121 })).body.data.id);
  ids.bus = (await admin.call('POST', '/buses', { plateNumber: 'M 1', name: 'Bus One' })).body.data.id;
  const made = await admin.call('POST', '/konduktors', { email: 'kond@t.test', password: 'Password123', fullName: 'Konduktor', employeeNo: 'K-1' });
  await admin.call('PUT', `/buses/${ids.bus}/konduktor`, { konduktorId: made.body.data.id });
  kond = await signIn('kond@t.test');
  await db().query(
    `INSERT INTO bus_availability (bus_id, station_id, status) VALUES ($1, $2, 'available')
     ON CONFLICT (bus_id) DO UPDATE SET station_id = $2, status = 'available', parked_at = now(), updated_at = now()`,
    [ids.bus, st[0]],
  );
}, 120_000);

afterAll(async () => {
  await ctx?.close();
});

const sell = (body: Record<string, unknown>) => admin.call('POST', '/manual-tickets', body);

describe('selling a ticket over the counter', () => {
  it('creates it paid at once, with the fare from the stations and who sold it', async () => {
    const quote = (await admin.call('GET', `/fares/quote?origin=${st[0]}&destination=${st[2]}`)).body.data as { fareCentavos: number };
    const res = await sell({ originId: st[0], destinationId: st[2], quantity: 3, passengerName: '  Maria Santos ' });
    expect(res.status).toBe(201);
    const t = res.body.data as Manual;
    expect(t).toMatchObject({ status: 'paid', quantity: 3, passengerName: 'Maria Santos', encodedByName: 'Ana Admin', originName: 'A', destinationName: 'C', busId: null });
    expect(t.fareCentavos).toBe(quote.fareCentavos * 3);
    expect(t.referenceCode).toMatch(/^BRT-/);
    const row = (await db().query<{ source: string; paid_at: Date | null }>('SELECT source, paid_at FROM tickets WHERE id = $1', [t.id]))[0]!;
    expect(row.source).toBe('manual');
    expect(row.paid_at).not.toBeNull();
    // no payment row: there is no payment provider involved
    expect(Number((await db().query<{ n: string }>('SELECT count(*) AS n FROM payments WHERE ticket_id = $1', [t.id]))[0]!.n)).toBe(0);
  });

  it('never accepts a fare from the request, and the name is optional', async () => {
    const quote = (await admin.call('GET', `/fares/quote?origin=${st[0]}&destination=${st[1]}`)).body.data as { fareCentavos: number };
    const t = (await sell({ originId: st[0], destinationId: st[1], fareCentavos: 1 })).body.data as Manual;
    expect(t.fareCentavos).toBe(quote.fareCentavos);
    expect(t.quantity).toBe(1);
    expect(t.passengerName).toBeNull();
  });

  it('refuses the same station twice, a missing station, and a group that is too large', async () => {
    expect((await sell({ originId: st[0], destinationId: st[0] })).status).toBeGreaterThanOrEqual(400);
    expect((await sell({ originId: st[0] })).status).toBe(400);
    expect((await sell({ originId: st[0], destinationId: st[1], quantity: 21 })).status).toBe(400);
    expect((await sell({ originId: st[0], destinationId: st[1], quantity: 0 })).status).toBe(400);
  });

  it('is for admins only', async () => {
    const body = { originId: st[0], destinationId: st[1] };
    expect((await anon().call('POST', '/manual-tickets', body)).status).toBe(401);
    expect((await pax.call('POST', '/manual-tickets', body)).status).toBe(403);
    expect((await kond.call('POST', '/manual-tickets', body)).status).toBe(403);
    expect((await pax.call('GET', '/manual-tickets')).status).toBe(403);
    expect((await kond.call('GET', '/manual-tickets')).status).toBe(403);
  });
});

describe('the QR code and the list', () => {
  it('gives a PNG QR for a paid manual ticket, to admins only', async () => {
    const t = (await sell({ originId: st[0], destinationId: st[2], quantity: 2 })).body.data as Manual;
    const png = await admin.raw(`/manual-tickets/${t.id}/qr.png`);
    expect(png.status).toBe(200);
    expect(png.headers.get('content-type')).toBe('image/png');
    expect(png.headers.get('cache-control')).toContain('no-store');
    expect((await pax.raw(`/manual-tickets/${t.id}/qr.png`)).status).toBe(403);
    expect((await anon().raw(`/manual-tickets/${t.id}/qr.png`)).status).toBe(401);
  });

  it('has no QR for a ticket that is not a manual one, or does not exist', async () => {
    const online = (await pax.call('POST', '/tickets', { originId: st[0], destinationId: st[1] })).body.data as { id: string };
    expect((await admin.raw(`/manual-tickets/${online.id}/qr.png`)).status).toBe(404);
    expect((await admin.raw('/manual-tickets/6f0c5a7e-0000-4000-8000-000000000000/qr.png')).status).toBe(404);
  });

  it('is scanned like any ticket: valid once at its boarding shelter, then used (and its QR is gone)', async () => {
    const qr = await import('@lib/qr-token');
    const t = (await sell({ originId: st[0], destinationId: st[2], quantity: 4 })).body.data as Manual;
    const first = (await kond.call('POST', '/scans', { token: qr.signTicketToken(t.id) })).body.data as { result: string };
    expect(first.result).toBe('valid');
    const again = (await kond.call('POST', '/scans', { referenceCode: t.referenceCode })).body.data as { result: string };
    expect(again.result).toBe('already_used');
    expect((await admin.raw(`/manual-tickets/${t.id}/qr.png`)).status).toBe(409);
  });

  it('lists the manual tickets newest first, ten to a page, and not the online ones', async () => {
    for (let i = 0; i < 9; i++) await sell({ originId: st[0], destinationId: st[1], passengerName: `Walk-in ${i}` });
    const first = (await admin.call('GET', '/manual-tickets')).body.data as { items: Manual[]; page: number; pageSize: number; total: number; totalPages: number };
    expect(first.pageSize).toBe(10);
    expect(first.items).toHaveLength(10);
    expect(first.total).toBeGreaterThan(10);
    expect(first.items[0]!.passengerName).toBe('Walk-in 8'); // the newest
    const second = (await admin.call('GET', '/manual-tickets?page=2')).body.data as { items: Manual[]; page: number };
    expect(second.page).toBe(2);
    expect(second.items.length).toBeGreaterThan(0);
    const all = [...first.items, ...second.items];
    expect(new Set(all.map((t) => t.id)).size).toBe(all.length);
  });
});
