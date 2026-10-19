import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Session, setupTestApp } from './helpers';

/** The admin dashboard numbers: tickets sold, passengers, sales and scans per Manila day. */

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
let statsService: typeof import('@modules/stats').statsService;
let admin: Session;
let pax: Session;
const anon = () => new Session({ request: (p, i) => ctx.api.request(p, i) });
const db = () => ctx.db.getDb();
const st: string[] = [];
let passengerId = '';
let konduktorId = '';

// "Now" for the calculations: 20 Oct 2026, 18:00 in Manila.
const NOW = new Date('2026-10-20T10:00:00Z');
let counter = 0;

type Seed = { origin?: number; destination?: number; fare: number; quantity?: number; status: string; createdAt: string; paidAt?: string | null };
async function ticket(t: Seed) {
  await db().query(
    `INSERT INTO tickets (reference_code, passenger_id, origin_station_id, destination_station_id, fare_centavos, quantity, status, valid_until, created_at, paid_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz + interval '1 day', $8, $9)`,
    [`BRT-ST${String(++counter).padStart(4, '0')}`, passengerId, st[t.origin ?? 0], st[t.destination ?? 1], t.fare, t.quantity ?? 1, t.status, t.createdAt, t.paidAt ?? null],
  );
}
const scan = (result: string, reason: string | null, at: string) =>
  db().query('INSERT INTO scans (konduktor_id, result, reason, scanned_at) VALUES ($1, $2, $3, $4)', [konduktorId, result, reason, at]);

beforeAll(async () => {
  ctx = await setupTestApp();
  ({ statsService } = await import('@modules/stats'));
  const { authService } = await import('@modules/auth');
  await authService.createUser({ email: 'admin@t.test', password: 'Password123', fullName: 'Admin', role: 'admin' });
  const p = await authService.createUser({ email: 'pax@t.test', password: 'Password123', fullName: 'Pax One', role: 'passenger' });
  passengerId = p.id;
  admin = anon();
  await admin.call('POST', '/auth/login', { email: 'admin@t.test', password: 'Password123' });
  pax = anon();
  await pax.call('POST', '/auth/login', { email: 'pax@t.test', password: 'Password123' });
  for (const [i, n] of ['A', 'B', 'C'].entries()) st.push((await admin.call('POST', '/stations', { name: n, latitude: 14 + i * 0.01, longitude: 121 })).body.data.id);
  const k = await admin.call('POST', '/konduktors', { email: 'k@t.test', password: 'Password123', fullName: 'Konduktor K', employeeNo: 'K-1' });
  konduktorId = k.body.data.id;

  // 20 Oct (Manila), the day of "now": 00:30 is just after midnight, so it is the 20th even though it is still the 19th in UTC.
  await ticket({ fare: 1700, status: 'used', createdAt: '2026-10-19T16:20:00Z', paidAt: '2026-10-19T16:30:00Z' });
  await ticket({ fare: 3400, quantity: 2, status: 'paid', createdAt: '2026-10-20T02:00:00Z', paidAt: '2026-10-20T02:05:00Z', origin: 1, destination: 2 });
  // 19 Oct, just before Manila midnight (23:30 on the 19th = 15:30Z): the 19th, not the 20th.
  await ticket({ fare: 1700, status: 'used', createdAt: '2026-10-19T15:20:00Z', paidAt: '2026-10-19T15:30:00Z' });
  // 18 Oct: a family of five on one ticket.
  await ticket({ fare: 24500, quantity: 5, status: 'used', createdAt: '2026-10-18T03:00:00Z', paidAt: '2026-10-18T03:02:00Z', origin: 0, destination: 2 });
  // Never paid: not sales.
  await ticket({ fare: 1700, status: 'pending_payment', createdAt: '2026-10-20T09:00:00Z' });
  await ticket({ fare: 1700, status: 'cancelled', createdAt: '2026-10-20T08:00:00Z' });
  await ticket({ fare: 1700, status: 'expired', createdAt: '2026-10-19T03:00:00Z' });
  // Paid long before the 7-day window, inside the 30-day one.
  await ticket({ fare: 9900, status: 'used', createdAt: '2026-10-05T03:00:00Z', paidAt: '2026-10-05T03:05:00Z' });

  await scan('valid', null, '2026-10-20T01:00:00Z');
  await scan('valid', null, '2026-10-20T02:00:00Z');
  await scan('invalid', 'bad_token', '2026-10-20T03:00:00Z');
  await scan('already_used', null, '2026-10-19T04:00:00Z');
  await scan('valid', null, '2026-10-19T16:30:00Z'); // 00:30 on the 20th in Manila
}, 120_000);

afterAll(async () => {
  await ctx?.close();
});

describe('the numbers per day', () => {
  it('counts a ticket as sold on the Manila day it was paid, with its passengers and its total', async () => {
    const stats = await statsService.overview(7, db(), NOW);
    const by = (date: string) => stats.days.find((d) => d.date === date)!;
    // 20th: the ticket paid at 00:30 (a UTC date of the 19th) and the group of two.
    expect(by('2026-10-20')).toMatchObject({ ticketsSold: 2, passengers: 3, salesCentavos: 5100 });
    // 19th: only the one paid before midnight.
    expect(by('2026-10-19')).toMatchObject({ ticketsSold: 1, passengers: 1, salesCentavos: 1700 });
    // 18th: the family of five is one ticket, five passengers, and the money of the whole ticket.
    expect(by('2026-10-18')).toMatchObject({ ticketsSold: 1, passengers: 5, salesCentavos: 24500 });
  });

  it('counts scans per Manila day too: accepted and refused apart', async () => {
    const stats = await statsService.overview(7, db(), NOW);
    const by = (date: string) => stats.days.find((d) => d.date === date)!;
    expect(by('2026-10-20')).toMatchObject({ scansAccepted: 3, scansRefused: 1 }); // the 00:30 scan belongs to the 20th
    expect(by('2026-10-19')).toMatchObject({ scansAccepted: 0, scansRefused: 1 });
  });

  it('has an entry for every day of the window, oldest first, zeros where nothing happened, ending today', async () => {
    const stats = await statsService.overview(7, db(), NOW);
    expect(stats.days.map((d) => d.date)).toEqual(['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20']);
    expect(stats.days[0]).toEqual({ date: '2026-10-14', ticketsSold: 0, passengers: 0, salesCentavos: 0, scansAccepted: 0, scansRefused: 0 });
    expect(stats.today.date).toBe('2026-10-20');
  });

  it('totals are the sum of the days, and a longer window brings in older sales', async () => {
    const week = await statsService.overview(7, db(), NOW);
    expect(week.totals).toMatchObject({ ticketsSold: 4, passengers: 9, salesCentavos: 5100 + 1700 + 24500, scansAccepted: 3, scansRefused: 2 });
    const month = await statsService.overview(30, db(), NOW);
    expect(month.days).toHaveLength(30);
    expect(month.totals.ticketsSold).toBe(5);
    expect(month.totals.salesCentavos).toBe(week.totals.salesCentavos + 9900);
  });

  it('never counts a ticket that was not paid as a sale', async () => {
    const stats = await statsService.overview(30, db(), NOW);
    // Three tickets were pending, cancelled or expired unpaid: none of them is in sales.
    expect(stats.totals.ticketsSold).toBe(5);
    expect(stats.byStatus).toMatchObject({ pending_payment: 1, cancelled: 1, expired: 1 });
  });
});

describe('the breakdowns', () => {
  it('says where the tickets created in the window ended up', async () => {
    const stats = await statsService.overview(7, db(), NOW);
    expect(stats.byStatus).toEqual({ pending_payment: 1, paid: 1, used: 3, expired: 1, cancelled: 1 });
  });

  it('lists the busiest routes by tickets paid, with passengers and sales', async () => {
    const stats = await statsService.overview(7, db(), NOW);
    expect(stats.topRoutes[0]).toEqual({ originName: 'A', destinationName: 'B', tickets: 2, passengers: 2, salesCentavos: 3400 });
    expect(stats.topRoutes.map((r) => `${r.originName}>${r.destinationName}`)).toEqual(['A>B', 'A>C', 'B>C']);
  });

  it('counts payments waiting for an admin, whatever the window', async () => {
    expect((await statsService.overview(7, db(), NOW)).paymentsNeedingReview).toBe(0);
    const t = (await db().query<{ id: string }>('SELECT id FROM tickets LIMIT 1'))[0]!;
    await db().query("INSERT INTO payments (ticket_id, provider, provider_ref, amount_centavos, checkout_url, status, review_reason) VALUES ($1, 'mock', 'review_1', 100, '/x', 'needs_review', 'amount_mismatch')", [t.id]);
    expect((await statsService.overview(7, db(), NOW)).paymentsNeedingReview).toBe(1);
  });
});

describe('the API', () => {
  it('is for admins only', async () => {
    expect((await anon().call('GET', '/admin/stats')).status).toBe(401);
    expect((await pax.call('GET', '/admin/stats')).status).toBe(403);
    expect((await admin.call('GET', '/admin/stats')).status).toBe(200);
  });

  it('defaults to 14 days and accepts 7, 14 or 30, nothing else', async () => {
    expect(((await admin.call('GET', '/admin/stats')).body.data.days as unknown[]).length).toBe(14);
    for (const days of [7, 14, 30]) expect(((await admin.call('GET', `/admin/stats?days=${days}`)).body.data.days as unknown[]).length).toBe(days);
    for (const bad of ['5', '0', '31', 'abc', '-7']) expect((await admin.call('GET', `/admin/stats?days=${bad}`)).status, bad).toBe(400);
  });

  it('shows no passenger names or emails: totals only', async () => {
    const body = JSON.stringify((await admin.call('GET', '/admin/stats?days=30')).body);
    expect(body).not.toMatch(/pax@t\.test|Pax One/);
  });
});
