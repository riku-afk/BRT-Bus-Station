import { SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Session, setupTestApp, TEST_SSO_SECRET } from './helpers';

/**
 * The Senior Citizen / PWD discount: 20% off ONE passenger's fare. The partner app (SSO) vouches for the status and the ID number at
 * every sign-in; the ticket freezes what was applied; an admin can give it over the counter after checking the printed ID.
 */

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
let admin: Session;
let kond: Session;
let qr: typeof import('@lib/qr-token');
const anon = () => new Session({ request: (p, i) => ctx.api.request(p, i) });
const db = () => ctx.db.getDb();
const st: string[] = [];
let unit = 0; // the full fare for one passenger, A to C
let counter = 0;

const enc = (s: string) => new TextEncoder().encode(s);
async function token(sub: string, claims: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ name: 'Lola Basing', email: `${sub}@sce.test`, ...claims })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setIssuer('sce')
    .setAudience('brt')
    .setIssuedAt(now)
    .setExpirationTime(now + 60)
    .setJti(`d-${++counter}-${Math.random().toString(36).slice(2)}`)
    .sign(enc(TEST_SSO_SECRET));
}
/** Open the hand-off link as a person arriving from the partner app. Returns their session. */
async function arrive(sub: string, claims?: Record<string, unknown>) {
  const s = anon();
  const res = await s.call('GET', `/sso/login?token=${encodeURIComponent(await token(sub, claims))}`);
  expect(res.status).toBe(302);
  return s;
}
type Ticket = { id: string; fareCentavos: number; quantity: number; discountType: string | null; discountCentavos: number };
const buy = async (s: Session, quantity?: number) => (await s.call('POST', '/tickets', { originId: st[0], destinationId: st[2], ...(quantity ? { quantity } : {}) })).body.data as Ticket;

beforeAll(async () => {
  ctx = await setupTestApp();
  qr = await import('@lib/qr-token');
  const { authService } = await import('@modules/auth');
  await authService.createUser({ email: 'admin@t.test', password: 'Password123', fullName: 'Ana Admin', role: 'admin' });
  admin = anon();
  await admin.call('POST', '/auth/login', { email: 'admin@t.test', password: 'Password123' });
  for (const [i, n] of ['A', 'B', 'C'].entries()) st.push((await admin.call('POST', '/stations', { name: n, latitude: 14 + i * 0.01, longitude: 121 })).body.data.id);
  unit = (await admin.call('GET', `/fares/quote?origin=${st[0]}&destination=${st[2]}`)).body.data.fareCentavos;
  const bus = (await admin.call('POST', '/buses', { plateNumber: 'D 1', name: 'Bus One' })).body.data.id;
  const made = await admin.call('POST', '/konduktors', { email: 'kond@t.test', password: 'Password123', fullName: 'Konduktor', employeeNo: 'K-1' });
  await admin.call('PUT', `/buses/${bus}/konduktor`, { konduktorId: made.body.data.id });
  kond = anon();
  await kond.call('POST', '/auth/login', { email: 'kond@t.test', password: 'Password123' });
  await db().query(
    `INSERT INTO bus_availability (bus_id, station_id, status) VALUES ($1, $2, 'available')
     ON CONFLICT (bus_id) DO UPDATE SET station_id = $2, status = 'available', parked_at = now(), updated_at = now()`,
    [bus, st[0]],
  );
}, 120_000);

afterAll(async () => {
  await ctx?.close();
});

describe('a partner-app passenger who is a Senior Citizen, PWD or Student', () => {
  it('carries the discount from the partner at sign-in, and /auth/me says so', async () => {
    const s = await arrive('sr-1', { discount: 'senior', discount_id: 'OSCA-0001234' });
    expect((await s.call('GET', '/auth/me')).body.data.discountType).toBe('senior');
    const row = (await db().query<{ discount_type: string; discount_id: string }>("SELECT discount_type, discount_id FROM users WHERE external_id = 'sr-1'"))[0]!;
    expect(row).toEqual({ discount_type: 'senior', discount_id: 'OSCA-0001234' });
  });

  it('pays 20% less, and the ticket and the payment agree on the discounted total', async () => {
    const s = await arrive('sr-2', { discount: 'senior', discount_id: 'OSCA-77' });
    const t = await buy(s);
    expect(t).toMatchObject({ discountType: 'senior', quantity: 1 });
    expect(t.discountCentavos).toBe(Math.round(unit * 0.2));
    expect(t.fareCentavos).toBe(unit - Math.round(unit * 0.2));
    const checkout = (await s.call('POST', `/tickets/${t.id}/checkout`)).body.data as { amountCentavos: number };
    expect(checkout.amountCentavos).toBe(t.fareCentavos);
  });

  it('is the same for a PWD', async () => {
    const t = await buy(await arrive('pwd-1', { discount: 'pwd', discount_id: 'PWD-5555' }));
    expect(t.discountType).toBe('pwd');
    expect(t.fareCentavos).toBe(unit - Math.round(unit * 0.2));
  });

  it('on a group ticket reduces only one passenger: the others pay in full', async () => {
    const t = await buy(await arrive('sr-3', { discount: 'senior', discount_id: 'OSCA-3' }), 4);
    expect(t.fareCentavos).toBe(unit * 4 - Math.round(unit * 0.2));
    expect(t.discountCentavos).toBe(Math.round(unit * 0.2));
  });

  it('a senior (by birthday) or a student has no ID number to send: the discount still applies, and the konduktor is told to ask for an ID', async () => {
    for (const [sub, kind] of [['sr-noid', 'senior'], ['stu-1', 'student']] as const) {
      const s = await arrive(sub, { discount: kind });
      expect((await s.call('GET', '/auth/me')).body.data.discountType).toBe(kind);
      const t = await buy(s);
      expect(t).toMatchObject({ discountType: kind });
      expect(t.fareCentavos).toBe(unit - Math.round(unit * 0.2));
      const row = (await db().query<{ discount_id: string | null }>('SELECT discount_id FROM tickets WHERE id = $1', [t.id]))[0]!;
      expect(row.discount_id).toBeNull();
    }
  });

  it('a student with a student ID number keeps it on the ticket', async () => {
    const t = await buy(await arrive('stu-2', { discount: 'student', discount_id: 'STU-2026-0042' }));
    expect(t.discountType).toBe('student');
    expect((await db().query<{ discount_id: string }>('SELECT discount_id FROM tickets WHERE id = $1', [t.id]))[0]!.discount_id).toBe('STU-2026-0042');
  });

  it('stops having it when the partner stops vouching for it, and ignores a kind it does not know', async () => {
    await arrive('sr-4', { discount: 'senior', discount_id: 'OSCA-4' });
    const later = await arrive('sr-4'); // the partner no longer says so
    expect((await later.call('GET', '/auth/me')).body.data.discountType).toBeNull();
    expect((await buy(later)).discountType).toBeNull();

    for (const claims of [{ discount: 'teacher', discount_id: 'TCH-12345' }, { discount: 'Senior' }, { discount: 20 }, { discount_id: 'OSCA-9' }]) {
      const s = await arrive(`sr-bad-${++counter}`, claims);
      expect((await s.call('GET', '/auth/me')).body.data.discountType, JSON.stringify(claims)).toBeNull();
    }
  });
});

describe('everyone else pays the full fare', () => {
  it('a passenger registered on BRT has no discount, and cannot ask for one in the request', async () => {
    const s = anon();
    await s.call('POST', '/auth/register', { email: 'plain@t.test', password: 'Password123', fullName: 'Plain Passenger' });
    expect((await s.call('GET', '/auth/me')).body.data.discountType).toBeNull();
    const res = await s.call('POST', '/tickets', { originId: st[0], destinationId: st[2], discountType: 'senior', discountId: 'FAKE-123', discountCentavos: 999 });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ discountType: null, discountCentavos: 0, fareCentavos: unit });
  });

  it('a partner passenger without a status pays the full fare', async () => {
    expect((await buy(await arrive('plain-sce'))).fareCentavos).toBe(unit);
  });
});

describe('a discount given over the counter', () => {
  const sell = (body: Record<string, unknown>) => admin.call('POST', '/manual-tickets', { originId: st[0], destinationId: st[2], ...body });

  it('needs the ID number the admin checked', async () => {
    expect((await sell({ discountType: 'senior' })).status).toBe(400);
    expect((await sell({ discountType: 'senior', discountId: ' ' })).status).toBe(400);
    expect((await sell({ discountType: 'teacher', discountId: 'TCH-1234' })).status).toBe(400);
  });

  it('is the same for a student, who shows a student ID', async () => {
    const res = await sell({ discountType: 'student', discountId: 'STU-2026-7' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ discountType: 'student', discountId: 'STU-2026-7', fareCentavos: unit - Math.round(unit * 0.2) });
  });

  it('takes 20% off one passenger, records the kind and the ID, and the konduktor is told to check it', async () => {
    const res = await sell({ discountType: 'pwd', discountId: 'PWD-0099', quantity: 3 });
    expect(res.status).toBe(201);
    const t = res.body.data as Ticket & { id: string; discountId: string; referenceCode: string };
    expect(t).toMatchObject({ discountType: 'pwd', discountId: 'PWD-0099', quantity: 3 });
    expect(t.fareCentavos).toBe(unit * 3 - Math.round(unit * 0.2));
    expect(t.discountCentavos).toBe(Math.round(unit * 0.2));

    const scan = (await kond.call('POST', '/scans', { token: qr.signTicketToken(t.id) })).body.data as { result: string; ticket: { discountType: string; discountId: string; quantity: number } };
    expect(scan.result).toBe('valid');
    expect(scan.ticket).toMatchObject({ discountType: 'pwd', discountId: 'PWD-0099', quantity: 3 });
  });

  it('a ticket without a discount shows none to the konduktor', async () => {
    const t = (await sell({})).body.data as { id: string; fareCentavos: number };
    expect(t.fareCentavos).toBe(unit);
    const scan = (await kond.call('POST', '/scans', { token: qr.signTicketToken(t.id) })).body.data as { ticket: { discountType: string | null; discountId: string | null } };
    expect(scan.ticket).toMatchObject({ discountType: null, discountId: null });
  });
});
