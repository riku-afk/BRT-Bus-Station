import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { manilaDateKey } from '@shared/datetime/ph-time';
import { Session, setupTestApp } from './helpers';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
let qr: typeof import('@lib/qr-token');
let admin: Session;
let pax1: Session;
let pax2: Session;
let kond1: Session; // bus 1, waiting at shelter A
let kond2: Session; // bus 2, waiting at shelter A
let kond3: Session; // no bus
const anon = () => new Session({ request: (p, i) => ctx.api.request(p, i) });
const db = () => ctx.db.getDb();

const st: string[] = [];
const ids: Record<string, string> = {};

type Scan = {
  result: string;
  reason: string | null;
  message: string;
  usedAt: string | null;
  scannedAt: string;
  ticket: { referenceCode: string; originName: string; destinationName: string; fareCentavos: number } | null;
};

/** A ticket the passenger has really paid for, through the demo payment page (so through the signed webhook). */
async function paidTicket(session: Session, from = 0, to = 2) {
  const t = (await session.call('POST', '/tickets', { originId: st[from], destinationId: st[to] })).body.data as { id: string; referenceCode: string };
  const checkout = (await session.call('POST', `/tickets/${t.id}/checkout`)).body.data as { checkoutUrl: string };
  const ref = checkout.checkoutUrl.replace('/pay/mock/', '');
  const done = await anon().call('POST', `/payments/mock/sessions/${ref}/complete`, { outcome: 'paid', method: 'gcash' });
  expect(done.body.data.outcome).toBe('applied');
  return { id: t.id, code: t.referenceCode, token: qr.signTicketToken(t.id) };
}
const scan = async (s: Session, body: Record<string, unknown>) => (await s.call('POST', '/scans', body)).body.data as Scan;
const ticketRow = async (id: string) => (await db().query<{ status: string; used_at: Date | null }>('SELECT status, used_at FROM tickets WHERE id = $1', [id]))[0]!;
const scanRows = (ticketId: string) => db().query<{ result: string; reason: string | null; konduktor_id: string; bus_id: string | null; ticket_id: string | null }>('SELECT result, reason, konduktor_id, bus_id, ticket_id FROM scans WHERE ticket_id = $1 ORDER BY scanned_at', [ticketId]);
const decodeQr = (png: Buffer) => {
  const image = PNG.sync.read(png);
  return jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data ?? null;
};
const noonOf = (key: string) => new Date(key + 'T12:00:00+08:00').getTime();
const DAY = 86_400_000;
// A Manila midnight boundary well inside the 30-day window and away from today/yesterday.
const LATE_KEY = manilaDateKey(new Date(Date.now() - 10 * DAY));
const EARLY_KEY = manilaDateKey(new Date(noonOf(LATE_KEY) + DAY));
const YESTERDAY_KEY = manilaDateKey(new Date(Date.now() - DAY));
const manilaTime = (iso: string) => new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', hour: 'numeric', minute: '2-digit', hour12: true }).format(new Date(iso)).toUpperCase();

beforeAll(async () => {
  ctx = await setupTestApp();
  qr = await import('@lib/qr-token');
  const { authService } = await import('@modules/auth');
  await authService.createUser({ email: 'admin@t.test', password: 'Password123', fullName: 'Admin', role: 'admin' });
  await authService.createUser({ email: 'pax1@t.test', password: 'Password123', fullName: 'Pax One', role: 'passenger' });
  await authService.createUser({ email: 'pax2@t.test', password: 'Password123', fullName: 'Pax Two', role: 'passenger' });
  const signIn = async (email: string) => {
    const s = anon();
    await s.call('POST', '/auth/login', { email, password: 'Password123' });
    return s;
  };
  admin = await signIn('admin@t.test');
  pax1 = await signIn('pax1@t.test');
  pax2 = await signIn('pax2@t.test');
  for (const [i, n] of ['A', 'B', 'C', 'D'].entries()) st.push((await admin.call('POST', '/stations', { name: n, latitude: 14 + i * 0.01, longitude: 121 })).body.data.id);

  ids.bus = (await admin.call('POST', '/buses', { plateNumber: 'S 1', name: 'Scan Bus' })).body.data.id;
  for (const n of [1, 2, 3]) {
    const made = await admin.call('POST', '/konduktors', { email: `kond${n}@t.test`, password: 'Password123', fullName: `Konduktor ${n}`, employeeNo: `K-${n}` });
    ids[`k${n}`] = made.body.data.id;
  }
  ids.bus2 = (await admin.call('POST', '/buses', { plateNumber: 'S 2', name: 'Scan Bus 2' })).body.data.id;
  await admin.call('PUT', `/buses/${ids.bus}/konduktor`, { konduktorId: ids.k1 });
  await admin.call('PUT', `/buses/${ids.bus2}/konduktor`, { konduktorId: ids.k2 }); // konduktor 3 has no bus
  kond1 = await signIn('kond1@t.test');
  kond2 = await signIn('kond2@t.test');
  kond3 = await signIn('kond3@t.test');
}, 120_000);

/** Park a bus at a shelter (available) or send it on the road. */
const parkBus = (busId: string, shelter: string | null) =>
  db().query(
    `INSERT INTO bus_availability (bus_id, station_id, status) VALUES ($1, $2, $3)
     ON CONFLICT (bus_id) DO UPDATE SET station_id = $2, status = $3, expected_departure_at = NULL, updated_at = now()`,
    [busId, shelter ?? st[0], shelter ? 'available' : 'on_road'],
  );

beforeEach(async () => {
  await db().query("UPDATE tickets SET status = 'cancelled' WHERE status = 'pending_payment'");
  // Both crewed buses start every test waiting at shelter A, where the tickets bought by default board.
  await parkBus(ids.bus!, st[0]!);
  await parkBus(ids.bus2!, st[0]!);
});

afterAll(async () => {
  await ctx?.close();
});

describe('the QR code (QR-01..04)', () => {
  it('is a PNG of the ticket\'s signed token, and the token is the one the scanner will accept', async () => {
    const t = await paidTicket(pax1);
    const res = await pax1.raw(`/tickets/${t.id}/qr.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('image/png');
    expect(res.headers.get('cache-control')).toMatch(/private/);
    expect(res.headers.get('cache-control')).toMatch(/no-store/);
    const png = Buffer.from(await res.arrayBuffer());
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

    // Read the picture back the way a phone camera would: it holds a genuine token for THIS ticket.
    const text = decodeQr(png);
    expect(text).not.toBeNull();
    expect(text).toMatch(/^v1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
    expect(qr.verifyTicketToken(text!)).toEqual({ ticketId: t.id });
    expect(text).toBe(t.token);
  });

  it('is different for every ticket', async () => {
    const a = await paidTicket(pax1);
    const b = await paidTicket(pax1);
    const textA = decodeQr(Buffer.from(await (await pax1.raw(`/tickets/${a.id}/qr.png`)).arrayBuffer()));
    const textB = decodeQr(Buffer.from(await (await pax1.raw(`/tickets/${b.id}/qr.png`)).arrayBuffer()));
    expect(textA).not.toBe(textB);
  });

  it('is only shown for a paid ticket: unpaid, cancelled, used and expired tickets have none (QR-04)', async () => {
    const pending = (await pax1.call('POST', '/tickets', { originId: st[0], destinationId: st[1] })).body.data.id as string;
    const r = await pax1.raw(`/tickets/${pending}/qr.png`);
    expect(r.status).toBe(409);
    expect(((await r.json()) as { error: { message: string } }).error.message).toMatch(/awaiting payment.*only available while it is paid/i);

    for (const status of ['cancelled', 'used', 'expired']) {
      const t = await paidTicket(pax1);
      await db().query(`UPDATE tickets SET status = '${status}', used_at = CASE WHEN '${status}' = 'used' THEN now() ELSE NULL END WHERE id = $1`, [t.id]);
      expect((await pax1.raw(`/tickets/${t.id}/qr.png`)).status, status).toBe(409);
    }
  });

  it('is private to the owner', async () => {
    const t = await paidTicket(pax1);
    expect((await pax2.raw(`/tickets/${t.id}/qr.png`)).status).toBe(404); // looks like it does not exist
    expect((await anon().raw(`/tickets/${t.id}/qr.png`)).status).toBe(401);
    expect((await admin.raw(`/tickets/${t.id}/qr.png`)).status).toBe(403);
    expect((await kond1.raw(`/tickets/${t.id}/qr.png`)).status).toBe(403);
    expect((await pax1.raw('/tickets/not-an-id/qr.png')).status).toBe(400);
  });

  it('is never exposed as text anywhere in the ticket API', async () => {
    const t = await paidTicket(pax1);
    const body = JSON.stringify([(await pax1.call('GET', `/tickets/${t.id}`)).body, (await pax1.call('GET', '/tickets/mine')).body]);
    expect(body).not.toContain(t.token);
    expect(body).not.toMatch(/v1\.[0-9a-f-]{36}\./);
  });
});

describe('scanning a ticket (SCN-02, SCN-03, SCN-05)', () => {
  it('accepts a paid ticket once, marks it used, and tells the konduktor where the passenger gets off', async () => {
    const t = await paidTicket(pax1, 0, 2);
    const res = await scan(kond1, { token: t.token });
    expect(res).toMatchObject({ result: 'valid', reason: null, message: 'Valid ticket' });
    expect(res.ticket).toEqual({ referenceCode: t.code, originName: 'A', destinationName: 'C', fareCentavos: 1900, quantity: 1 });
    expect((await ticketRow(t.id)).status).toBe('used');
    expect((await ticketRow(t.id)).used_at).not.toBeNull();
    // The konduktor is not told who the passenger is.
    expect(JSON.stringify(res)).not.toMatch(/pax1|Pax One|email|passenger/i);
  });

  it('rejects a second scan with "Already used at <time>", and changes nothing (SCN-03)', async () => {
    const t = await paidTicket(pax1);
    const first = await scan(kond1, { token: t.token });
    expect(first.result).toBe('valid');
    const usedAt = (await ticketRow(t.id)).used_at!.getTime();

    const second = await scan(kond1, { token: t.token });
    expect(second.result).toBe('already_used');
    expect(second.message).toBe(`Already used at ${manilaTime(first.scannedAt)}`);
    expect(second.ticket).toMatchObject({ originName: 'A', destinationName: 'C' }); // still shows the route
    expect(second.usedAt).not.toBeNull();
    expect((await ticketRow(t.id)).used_at!.getTime()).toBe(usedAt); // not touched again

    // A different konduktor scanning the same code gets the same answer.
    expect((await scan(kond2, { token: t.token })).result).toBe('already_used');
  });

  it('works from the real QR image: read the picture, scan what it says', async () => {
    const t = await paidTicket(pax2);
    const text = decodeQr(Buffer.from(await (await pax2.raw(`/tickets/${t.id}/qr.png`)).arrayBuffer()));
    expect((await scan(kond1, { token: text! })).result).toBe('valid');
    expect((await scan(kond1, { token: text! })).result).toBe('already_used');
  });

  it('lets exactly one of many simultaneous scans through', async () => {
    const t = await paidTicket(pax1);
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => scan(i % 2 ? kond1 : kond2, { token: t.token })));
    const counts = results.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.result]: (acc[r.result] ?? 0) + 1 }), {});
    expect(counts).toEqual({ valid: 1, already_used: 7 });
    expect((await scanRows(t.id)).length).toBe(8); // every attempt is on record
    expect((await scanRows(t.id)).filter((r) => r.result === 'valid')).toHaveLength(1);
  });

  it('rejects an expired ticket, and a paid one whose day has ended', async () => {
    const lapsed = await paidTicket(pax1);
    await db().query("UPDATE tickets SET valid_until = now() - interval '1 minute' WHERE id = $1", [lapsed.id]);
    const r = await scan(kond1, { token: lapsed.token });
    expect(r).toMatchObject({ result: 'expired', message: 'This ticket has expired' });
    expect((await ticketRow(lapsed.id)).status).toBe('expired'); // recorded now, not left for the worker
    expect((await ticketRow(lapsed.id)).used_at).toBeNull();

    const already = await paidTicket(pax1);
    await db().query("UPDATE tickets SET status = 'expired' WHERE id = $1", [already.id]);
    expect((await scan(kond1, { token: already.token })).result).toBe('expired');
  });

  it('rejects a ticket that is not paid or was cancelled, without touching it', async () => {
    const unpaid = (await pax1.call('POST', '/tickets', { originId: st[0], destinationId: st[1] })).body.data.id as string;
    const unpaidRes = await scan(kond1, { token: qr.signTicketToken(unpaid) });
    expect(unpaidRes).toMatchObject({ result: 'invalid', reason: 'not_paid', message: 'This ticket has not been paid' });
    expect((await ticketRow(unpaid)).status).toBe('pending_payment');

    await pax1.call('POST', `/tickets/${unpaid}/cancel`);
    expect(await scan(kond1, { token: qr.signTicketToken(unpaid) })).toMatchObject({ result: 'invalid', reason: 'cancelled', message: 'This ticket was cancelled' });
  });

  it('rejects a forged or altered code before it reaches the database, and records the attempt (SCN-04)', async () => {
    const t = await paidTicket(pax1);
    const outsider = qr.signTicketToken(t.id, 'an-attackers-guess-of-the-secret-0123456789');
    const swapped = `v1.${t.id.replace(/.$/, (c) => (c === '0' ? '1' : '0'))}.${t.token.split('.')[2]}`;
    const before = Number((await db().query<{ n: string }>('SELECT count(*) AS n FROM scans'))[0]!.n);

    for (const token of [outsider, swapped, 'garbage', t.token.slice(0, -2) + 'AA', '']) {
      const res = await kond1.call('POST', '/scans', { token: token || ' ' });
      expect(res.status, token).toBe(200);
      expect(res.body.data, token).toMatchObject({ result: 'invalid', reason: 'bad_token', ticket: null, message: 'Not a valid BRT ticket' });
    }
    expect((await ticketRow(t.id)).status).toBe('paid'); // the real ticket is untouched
    expect(Number((await db().query<{ n: string }>('SELECT count(*) AS n FROM scans'))[0]!.n)).toBe(before + 5);
  });

  it('rejects a correctly signed token for a ticket that does not exist', async () => {
    const ghost = qr.signTicketToken('00000000-0000-4000-8000-000000000000');
    expect(await scan(kond1, { token: ghost })).toMatchObject({ result: 'invalid', reason: 'unknown_ticket', ticket: null });
  });

  it('does not store the scanned token, anywhere in the scans table (GEN-06)', async () => {
    const cols = (await db().query<{ column_name: string }>("SELECT column_name FROM information_schema.columns WHERE table_name = 'scans'")).map((c) => c.column_name);
    expect(cols.sort()).toEqual(['bus_id', 'id', 'konduktor_id', 'reason', 'result', 'scanned_at', 'ticket_id']);
  });
});

describe('who is scanning (SCN-07, GEN-05)', () => {
  it('only konduktors can scan', async () => {
    const t = await paidTicket(pax1);
    for (const [s, status] of [[anon(), 401], [pax1, 403], [admin, 403]] as const) {
      expect((await s.call('POST', '/scans', { token: t.token })).status).toBe(status);
    }
    expect((await ticketRow(t.id)).status).toBe('paid');
  });

  it('records the konduktor and their assigned bus from the session, ignoring who the request claims to be', async () => {
    const a = await paidTicket(pax1);
    const b = await paidTicket(pax1);
    // Claims in the request body about who is scanning are ignored.
    const res = await kond1.call('POST', '/scans', { token: a.token, konduktorId: ids.k2, busId: '00000000-0000-4000-8000-000000000000' });
    expect(res.body.data.result).toBe('valid');
    expect((await scan(kond2, { token: b.token })).result).toBe('valid');

    expect((await scanRows(a.id))[0]).toMatchObject({ konduktor_id: ids.k1, bus_id: ids.bus });
    expect((await scanRows(b.id))[0]).toMatchObject({ konduktor_id: ids.k2, bus_id: ids.bus2 });
  });

  it('a konduktor with no bus cannot validate a ticket (there is no shelter to board at), and the attempt is recorded with no bus', async () => {
    const t = await paidTicket(pax1);
    const res = await scan(kond3, { token: t.token });
    expect(res).toMatchObject({ result: 'invalid', reason: 'bus_not_at_station' });
    expect((await ticketRow(t.id)).status).toBe('paid');
    expect((await scanRows(t.id))[0]).toMatchObject({ konduktor_id: ids.k3, bus_id: null, result: 'invalid', reason: 'bus_not_at_station' });
  });

  it('records every attempt, valid or not, against the right ticket', async () => {
    const t = await paidTicket(pax1);
    await scan(kond1, { token: t.token });
    await scan(kond2, { token: t.token });
    const rows = await scanRows(t.id);
    expect(rows.map((r) => r.result)).toEqual(['valid', 'already_used']);
    expect(rows.every((r) => r.ticket_id === t.id)).toBe(true);
  });

  it('stored scans cannot be changed or deleted (insert-only evidence)', async () => {
    await expect(db().query("UPDATE scans SET result = 'valid'")).rejects.toThrow(/insert-only/);
    await expect(db().query('DELETE FROM scans')).rejects.toThrow(/insert-only/);
  });
});

describe('the reference-code fallback (SCN-08)', () => {
  it('checks a ticket typed in by its reference code, in any letter case, just like a scan', async () => {
    const t = await paidTicket(pax1);
    const first = await scan(kond1, { referenceCode: t.code.toLowerCase() });
    expect(first).toMatchObject({ result: 'valid', ticket: { referenceCode: t.code } });
    expect((await scan(kond1, { referenceCode: ` ${t.code} ` })).result).toBe('already_used');
    expect((await ticketRow(t.id)).status).toBe('used');
  });

  it('rejects an unknown or malformed code, and a request that gives both or neither', async () => {
    expect(await scan(kond1, { referenceCode: 'BRT-ZZZZZZ' })).toMatchObject({ result: 'invalid', reason: 'unknown_ticket' });
    expect(await scan(kond1, { referenceCode: '12345' })).toMatchObject({ result: 'invalid', reason: 'bad_code' });
    const t = await paidTicket(pax1);
    expect((await kond1.call('POST', '/scans', { token: t.token, referenceCode: t.code })).status).toBe(400);
    expect((await kond1.call('POST', '/scans', {})).status).toBe(400);
    expect((await ticketRow(t.id)).status).toBe('paid');
  });
});

describe('a ticket is only good at the shelter it was bought at (SCN-09)', () => {
  const boardsAtB = () => paidTicket(pax1, 1, 2); // bought at shelter B

  it('refuses a ticket bought at another shelter, says where it boards, and leaves it unused', async () => {
    const t = await boardsAtB(); // the konduktor's bus is waiting at A
    const res = await scan(kond1, { token: t.token });
    expect(res).toMatchObject({ result: 'invalid', reason: 'wrong_station', ticket: { originName: 'B', destinationName: 'C' } });
    expect(res.message).toBe('Wrong shelter: this ticket boards at B, and your bus is at A');
    expect((await ticketRow(t.id)).status).toBe('paid');
    expect((await ticketRow(t.id)).used_at).toBeNull();
    expect((await scanRows(t.id))[0]).toMatchObject({ result: 'invalid', reason: 'wrong_station', bus_id: ids.bus });
  });

  it('accepts the very same ticket once the bus is waiting at the shelter it was bought at', async () => {
    const t = await boardsAtB();
    expect((await scan(kond1, { token: t.token })).reason).toBe('wrong_station'); // a refused attempt does not use it up
    await parkBus(ids.bus!, st[1]!);
    expect((await scan(kond1, { token: t.token })).result).toBe('valid');
    expect((await ticketRow(t.id)).status).toBe('used');
  });

  it('only the bus waiting at that shelter can take it: another konduktor, elsewhere, is refused', async () => {
    await parkBus(ids.bus2!, st[1]!); // bus 2 is at B, bus 1 stays at A
    const t = await boardsAtB();
    expect((await scan(kond1, { token: t.token })).reason).toBe('wrong_station');
    expect((await scan(kond2, { token: t.token })).result).toBe('valid');
  });

  it('a ticket bought at the shelter of the far end of the line is refused at the other end, in both directions', async () => {
    const atA = await paidTicket(pax1, 0, 3);
    await parkBus(ids.bus!, st[3]!); // bus 1 is now at D
    expect((await scan(kond1, { token: atA.token })).reason).toBe('wrong_station');
    const atD = await paidTicket(pax1, 3, 0);
    expect((await scan(kond1, { token: atD.token })).result).toBe('valid');
  });

  it('refuses while the bus is on the road: tickets are checked where it waits, not while it drives', async () => {
    const t = await paidTicket(pax1);
    await parkBus(ids.bus!, null); // dispatched
    const res = await scan(kond1, { token: t.token });
    expect(res).toMatchObject({ result: 'invalid', reason: 'bus_not_at_station' });
    expect(res.message).toMatch(/not waiting at a shelter/);
    expect((await ticketRow(t.id)).status).toBe('paid');
  });

  it('the typed reference code follows the same rule', async () => {
    const t = await boardsAtB();
    expect(await scan(kond1, { referenceCode: t.code })).toMatchObject({ result: 'invalid', reason: 'wrong_station' });
    await parkBus(ids.bus!, st[1]!);
    expect((await scan(kond1, { referenceCode: t.code })).result).toBe('valid');
  });

  it('the shelter only matters for a ticket that could otherwise be accepted: used, expired and unpaid tickets keep their own answers', async () => {
    const used = await boardsAtB();
    await parkBus(ids.bus!, st[1]!);
    expect((await scan(kond1, { token: used.token })).result).toBe('valid');
    await parkBus(ids.bus!, st[0]!); // now somewhere else
    expect((await scan(kond1, { token: used.token })).result).toBe('already_used');

    const lapsed = await boardsAtB();
    await db().query("UPDATE tickets SET valid_until = now() - interval '1 minute' WHERE id = $1", [lapsed.id]);
    expect((await scan(kond1, { token: lapsed.token })).result).toBe('expired');

    const unpaid = (await pax1.call('POST', '/tickets', { originId: st[1], destinationId: st[2] })).body.data.id as string;
    expect(await scan(kond1, { token: qr.signTicketToken(unpaid) })).toMatchObject({ reason: 'not_paid' });
  });

  it('simultaneous scans at the right shelter still let exactly one through', async () => {
    const t = await paidTicket(pax1);
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => scan(i % 2 ? kond1 : kond2, { token: t.token })));
    expect(results.filter((r) => r.result === 'valid')).toHaveLength(1);
  });

  it('a dispatch cannot slip between the shelter check and the ticket being used', async () => {
    // Many scans race a dispatch of the same bus: every ticket accepted must have been accepted while the bus was still at A.
    const tickets = await Promise.all(Array.from({ length: 5 }, () => paidTicket(pax1)));
    const racing = tickets.map((t) => scan(kond1, { token: t.token }));
    const dispatch = parkBus(ids.bus!, null);
    const results = await Promise.all([...racing, dispatch]);
    for (const r of results.slice(0, 5) as { result: string; reason: string | null }[]) {
      expect(r.result === 'valid' || r.reason === 'bus_not_at_station').toBe(true);
    }
  });
});

describe('a konduktor\'s history (SCN-06)', () => {
  const insertAt = async (konduktorId: string, result: string, scannedAt: string, reason: string | null = null) =>
    db().query('INSERT INTO scans (konduktor_id, result, reason, scanned_at) VALUES ($1, $2, $3, $4)', [konduktorId, result, reason, scannedAt]);

  beforeAll(async () => {
    // Konduktor 2: a few known scans on earlier Manila days. 2026-10-14 15:30Z is 23:30 Manila on the 14th;
    // 2026-10-14 16:30Z is 00:30 Manila on the 15th: the day boundary is Manila's, not UTC's.
    const now = Date.now();
    const yDay = (hour: number) => new Date(noonOf(YESTERDAY_KEY) + (hour - 12) * 3_600_000).toISOString();
    const day = (n: number) => new Date(now - n * DAY).toISOString();
    await insertAt(ids.k2!, 'valid', yDay(9));
    await insertAt(ids.k2!, 'valid', yDay(10));
    await insertAt(ids.k2!, 'invalid', yDay(11), 'bad_token');
    await insertAt(ids.k2!, 'valid', day(3));
    await insertAt(ids.k2!, 'valid', day(40)); // too old for the default window
    await insertAt(ids.k1!, 'valid', yDay(9)); // someone else's
    await insertAt(ids.k2!, 'valid', LATE_KEY + 'T23:30:00+08:00');
    await insertAt(ids.k2!, 'valid', EARLY_KEY + 'T00:30:00+08:00');
  });

  it('groups my scans by Manila day with counts, today first, and only mine', async () => {
    const today = await paidTicket(pax1);
    await scan(kond2, { token: today.token }); // valid, now
    await scan(kond2, { token: today.token }); // already used, now

    // The day counts cover the whole window; the scans themselves come five to a page.
    const history = (await kond2.call('GET', '/scans/mine?days=30&pageSize=50')).body.data as {
      items: { result: string; scannedAt: string }[];
      days: { date: string; total: number; valid: number; rejected: number }[];
      total: number;
    };
    const days = history.days;
    // Newest day first, no duplicates, in order.
    expect(days.map((d) => d.date)).toEqual([...days.map((d) => d.date)].sort().reverse());
    expect(new Set(days.map((d) => d.date)).size).toBe(days.length);
    expect(days[0]!.date).toBe(manilaDateKey(new Date()));

    const todays = days[0]!;
    expect(todays.valid).toBeGreaterThanOrEqual(1);
    expect(todays.rejected).toBeGreaterThanOrEqual(1);
    expect(todays.total).toBe(todays.valid + todays.rejected);
    expect(history.items.filter((s) => manilaDateKey(s.scannedAt) === todays.date)).toHaveLength(todays.total);

    const yesterday = days.find((d) => d.date === YESTERDAY_KEY);
    expect(yesterday).toMatchObject({ total: 3, valid: 2, rejected: 1 });
    // Scans either side of Manila midnight land on different days.
    expect(days.find((d) => d.date === LATE_KEY)!.total).toBe(1);
    expect(days.find((d) => d.date === EARLY_KEY)!.total).toBe(1);
    // The scans listed are the ones the day counts add up to.
    expect(history.items.length).toBe(days.reduce((n, d) => n + d.total, 0));
    expect(history.total).toBe(history.items.length);
  });

  it('does not show another konduktor\'s scans', async () => {
    const mine = (await kond1.call('GET', '/scans/mine?days=30')).body.data as { total: number };
    const theirs = (await kond2.call('GET', '/scans/mine?days=30')).body.data as { total: number };
    // Konduktor 1 has scans of their own (this file's earlier tests) and one inserted yesterday; konduktor 2's rows are not among them.
    const rows = await db().query<{ konduktor_id: string; n: string }>('SELECT konduktor_id, count(*) AS n FROM scans WHERE scanned_at >= now() - interval \'30 days\' GROUP BY konduktor_id');
    const countOf = (k: string) => Number(rows.find((r) => r.konduktor_id === k)?.n ?? 0);
    expect(mine.total).toBe(countOf(ids.k1!));
    expect(theirs.total).toBe(countOf(ids.k2!));
  });

  it('keeps to the window asked for, and rejects a silly one', async () => {
    const short = (await kond2.call('GET', '/scans/mine?days=1')).body.data as { days: { date: string }[] };
    expect(short.days.every((d) => d.date >= manilaDateKey(new Date(Date.now() - 36 * 3_600_000)))).toBe(true);
    expect((await kond2.call('GET', '/scans/mine?days=0')).status).toBe(400);
    expect((await kond2.call('GET', '/scans/mine?days=31')).status).toBe(400);
  });

  it('pages the history five at a time, newest first, and clamps a page past the end', async () => {
    type H = { items: { id: string; scannedAt: string }[]; page: number; pageSize: number; total: number; totalPages: number };
    const first = (await kond2.call('GET', '/scans/mine?days=30')).body.data as H;
    expect(first.pageSize).toBe(5);
    expect(first.total).toBeGreaterThan(5);
    expect(first.items).toHaveLength(5);
    expect(first.totalPages).toBe(Math.ceil(first.total / 5));

    const second = (await kond2.call('GET', '/scans/mine?days=30&page=2')).body.data as H;
    expect(second.page).toBe(2);
    expect(second.items.length).toBeGreaterThan(0);
    // No scan on two pages, and page two is older than page one.
    expect(second.items.some((s) => first.items.some((f) => f.id === s.id))).toBe(false);
    expect(first.items[first.items.length - 1]!.scannedAt >= second.items[0]!.scannedAt).toBe(true);

    const past = (await kond2.call('GET', '/scans/mine?days=30&page=999')).body.data as H;
    expect(past.page).toBe(first.totalPages);
    expect(past.items.length).toBeGreaterThan(0);
    expect((await kond2.call('GET', '/scans/mine?page=0')).status).toBe(400);
    expect((await kond2.call('GET', '/scans/mine?pageSize=51')).status).toBe(400);
  });

  it('is for konduktors only', async () => {
    expect((await anon().call('GET', '/scans/mine')).status).toBe(401);
    expect((await pax1.call('GET', '/scans/mine')).status).toBe(403);
    expect((await admin.call('GET', '/scans/mine')).status).toBe(403);
  });
});

describe('the admin scan log (ADM-04)', () => {
  type Row = { result: string; konduktorName: string; busId: string | null; scannedAt: string; referenceCode: string | null };
  type Paged = { items: Row[]; page: number; pageSize: number; total: number; totalPages: number };
  const logPage = async (query = '') => (await admin.call('GET', `/scans${query}`)).body.data as Paged;
  const log = async (query = '') => (await logPage(query.includes('pageSize') ? query : query + (query.includes('?') ? '&' : '?') + 'pageSize=50')).items;

  it('is for admins only', async () => {
    expect((await anon().call('GET', '/scans')).status).toBe(401);
    expect((await pax1.call('GET', '/scans')).status).toBe(403);
    expect((await kond1.call('GET', '/scans')).status).toBe(403);
  });

  it('lists scans newest first with the konduktor, bus, result and ticket', async () => {
    const rows = await log();
    expect(rows.length).toBeGreaterThan(5);
    for (let i = 1; i < rows.length; i++) expect(rows[i - 1]!.scannedAt >= rows[i]!.scannedAt).toBe(true);
    expect(rows.some((r) => r.konduktorName === 'Konduktor 1' && r.busId === ids.bus)).toBe(true);
    expect(rows.some((r) => r.referenceCode && /^BRT-/.test(r.referenceCode))).toBe(true);
  });

  it('filters by konduktor, bus, result and day', async () => {
    expect((await log(`?konduktorId=${ids.k2}`)).every((r) => r.konduktorName === 'Konduktor 2')).toBe(true);
    const byBus = await log(`?busId=${ids.bus}`);
    expect(byBus.length).toBeGreaterThan(0);
    expect(byBus.every((r) => r.busId === ids.bus)).toBe(true);
    expect((await log('?result=already_used')).every((r) => r.result === 'already_used')).toBe(true);
    expect((await log('?result=valid')).length).toBeGreaterThan(0);

    // Manila day: 2026-10-14T16:30Z is 00:30 on the 15th, 2026-10-14T15:30Z is 23:30 on the 14th.
    const lateIso = new Date(LATE_KEY + 'T23:30:00+08:00').toISOString();
    const earlyIso = new Date(EARLY_KEY + 'T00:30:00+08:00').toISOString();
    expect((await log('?date=' + EARLY_KEY)).map((r) => r.scannedAt)).toContain(earlyIso);
    expect((await log('?date=' + EARLY_KEY)).map((r) => r.scannedAt)).not.toContain(lateIso);
    expect((await log('?date=' + LATE_KEY)).map((r) => r.scannedAt)).toContain(lateIso);
    expect(await log('?date=2001-01-01')).toEqual([]);
  });

  it('combines filters, honours the limit, and validates input', async () => {
    const both = await log(`?konduktorId=${ids.k2}&result=valid`);
    expect(both.every((r) => r.konduktorName === 'Konduktor 2' && r.result === 'valid')).toBe(true);
    expect(await log('?pageSize=2')).toHaveLength(2);
    expect((await admin.call('GET', '/scans?date=15-10-2026')).status).toBe(400);
    expect((await admin.call('GET', '/scans?result=maybe')).status).toBe(400);
    expect((await admin.call('GET', '/scans?konduktorId=nope')).status).toBe(400);
    expect((await admin.call('GET', '/scans?pageSize=9999')).status).toBe(400);
  });

  it('pages ten at a time, and a filter changes the total, not just the page', async () => {
    const first = await logPage();
    expect(first.pageSize).toBe(10);
    expect(first.items).toHaveLength(Math.min(10, first.total));
    expect(first.totalPages).toBe(Math.ceil(first.total / 10));
    if (first.total > 10) {
      const second = await logPage('?page=2');
      expect(second.page).toBe(2);
      expect(first.items[first.items.length - 1]!.scannedAt >= second.items[0]!.scannedAt).toBe(true);
    }
    const past = await logPage('?page=9999');
    expect(past.page).toBe(first.totalPages);

    const k2 = await logPage(`?konduktorId=${ids.k2}`);
    expect(k2.total).toBeLessThan(first.total);
    const none = await logPage('?date=2001-01-01');
    expect(none).toMatchObject({ items: [], total: 0, page: 1, totalPages: 1 });
  });
});
