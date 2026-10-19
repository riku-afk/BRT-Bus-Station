import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { Session, setupTestApp } from './helpers';

/** The ticket is emailed when it is paid, never blocks the payment, and can be asked for again. */

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
let mail: typeof import('@integrations/mail');
let qr: typeof import('@lib/qr-token');
let payments: typeof import('@integrations/payment');
let admin: Session;
let pax: Session;
let other: Session;
let provider: InstanceType<(typeof import('@integrations/mail'))['ConsoleMailProvider']>;
const anon = () => new Session({ request: (p, i) => ctx.api.request(p, i) });
const db = () => ctx.db.getDb();
const st: string[] = [];
const ids: Record<string, string> = {};

const tick = () => new Promise((r) => setTimeout(r, 60)); // the email is sent in the background, just after the payment
const newTicket = async (body: Record<string, unknown> = { originId: st[0], destinationId: st[1] }) => (await pax.call('POST', '/tickets', body)).body.data as { id: string };
const pay = async (ticketId: string) => {
  const checkout = (await pax.call('POST', `/tickets/${ticketId}/checkout`)).body.data as { checkoutUrl: string };
  const res = await anon().call('POST', `/payments/mock/sessions/${checkout.checkoutUrl.replace('/pay/mock/', '')}/complete`, { outcome: 'paid', method: 'gcash' });
  await tick();
  return res.body.data.outcome as string;
};
const decode = (png: Buffer) => {
  const image = PNG.sync.read(png);
  return jsQR(new Uint8ClampedArray(image.data), image.width, image.height)?.data ?? null;
};

beforeAll(async () => {
  ctx = await setupTestApp();
  mail = await import('@integrations/mail');
  qr = await import('@lib/qr-token');
  payments = await import('@integrations/payment');
  const { authService } = await import('@modules/auth');
  await authService.createUser({ email: 'admin@t.test', password: 'Password123', fullName: 'Admin', role: 'admin' });
  await authService.createUser({ email: 'pax@t.test', password: 'Password123', fullName: 'Pax One', role: 'passenger' });
  await authService.createUser({ email: 'other@t.test', password: 'Password123', fullName: 'Other', role: 'passenger' });
  const signIn = async (email: string) => {
    const s = anon();
    await s.call('POST', '/auth/login', { email, password: 'Password123' });
    return s;
  };
  admin = await signIn('admin@t.test');
  pax = await signIn('pax@t.test');
  other = await signIn('other@t.test');
  for (const [i, n] of ['A', 'B', 'C'].entries()) st.push((await admin.call('POST', '/stations', { name: n, latitude: 14 + i * 0.01, longitude: 121 })).body.data.id);
  ids.bus = (await admin.call('POST', '/buses', { plateNumber: 'M 1', name: 'Mail Bus' })).body.data.id;
  const k = await admin.call('POST', '/konduktors', { email: 'k@t.test', password: 'Password123', fullName: 'Konduktor K', employeeNo: 'K-1' });
  if (!k.body.data) throw new Error(JSON.stringify(k.body));
  await admin.call('PUT', `/buses/${ids.bus}/konduktor`, { konduktorId: k.body.data.id });
}, 120_000);

beforeEach(async () => {
  provider = new mail.ConsoleMailProvider(() => {});
  mail.setMailProvider(provider);
  await db().query("UPDATE tickets SET status = 'cancelled' WHERE status = 'pending_payment'");
  await db().query(
    `INSERT INTO bus_availability (bus_id, station_id, status) VALUES ($1, $2, 'available')
     ON CONFLICT (bus_id) DO UPDATE SET station_id = $2, status = 'available', planned_destination_id = NULL, parked_at = now()`,
    [ids.bus, st[0]],
  );
});

afterAll(async () => {
  mail.setMailProvider(null);
  await ctx?.close();
});

describe('emailing the ticket when it is paid (NTF-01)', () => {
  it('sends the owner one email with the trip and a QR that is the real ticket', async () => {
    const t = await newTicket();
    expect(await pay(t.id)).toBe('applied');
    expect(provider.sent).toHaveLength(1);
    const m = provider.sent[0]!;
    expect(m.to).toBe('pax@t.test');
    expect(m.subject).toMatch(/^Your BRT ticket BRT-[A-Z2-9]{6}: A to B$/);
    // The attached picture scans back to this ticket's signed token: it IS the ticket.
    const png = m.attachments![0]!.content;
    expect(qr.verifyTicketToken(decode(png)!)).toEqual({ ticketId: t.id });
  });

  it('says the bus and, for a group, how many it admits', async () => {
    const t = await newTicket({ busId: ids.bus, quantity: 4 });
    await pay(t.id);
    const m = provider.sent[0]!;
    expect(m.text).toContain('Bus: Mail Bus');
    expect(m.text).toContain('Passengers: 4');
    expect(m.text).toContain('One scan admits all 4 of you');
  });

  it('is sent once even if the payment notice is delivered again', async () => {
    const t = await newTicket();
    const checkout = (await pax.call('POST', `/tickets/${t.id}/checkout`)).body.data as { checkoutUrl: string; amountCentavos: number };
    const mock = payments.getMockProvider();
    const body = mock.buildEvent({ providerRef: checkout.checkoutUrl.replace('/pay/mock/', ''), kind: 'succeeded', amountCentavos: checkout.amountCentavos, method: 'gcash' });
    const send = () => ctx.api.request('/payments/webhook/mock', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-brt-signature': mock.signBody(body) }, body });
    await send();
    await send();
    await send();
    await tick();
    expect(provider.sent).toHaveLength(1);
  });

  it('is not sent for a payment that was not applied: a wrong amount, a failed attempt', async () => {
    const t = await newTicket();
    const checkout = (await pax.call('POST', `/tickets/${t.id}/checkout`)).body.data as { checkoutUrl: string };
    const mock = payments.getMockProvider();
    const ref = checkout.checkoutUrl.replace('/pay/mock/', '');
    for (const [kind, amount] of [['succeeded', 1], ['failed', 1700]] as const) {
      const body = mock.buildEvent({ providerRef: ref, kind, amountCentavos: amount, method: 'gcash' });
      await ctx.api.request('/payments/webhook/mock', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-brt-signature': mock.signBody(body) }, body });
    }
    await tick();
    expect(provider.sent).toHaveLength(0);
  });
});

describe('a mail problem never touches the payment (NTF-02)', () => {
  it('if sending throws, the ticket is still paid and the passenger still gets their confirmation', async () => {
    mail.setMailProvider({ name: 'smtp', send: vi.fn(async () => Promise.reject(new Error('connect ECONNREFUSED'))) });
    const t = await newTicket();
    expect(await pay(t.id)).toBe('applied');
    expect(((await pax.call('GET', `/tickets/${t.id}`)).body.data as { status: string }).status).toBe('paid');
    const row = (await db().query<{ status: string }>('SELECT status FROM payments WHERE ticket_id = $1', [t.id]))[0]!;
    expect(row.status).toBe('succeeded');
  });

  it('a mail service that hangs does not delay the confirmation', async () => {
    mail.setMailProvider({ name: 'smtp', send: () => new Promise<void>(() => {}) });
    const t = await newTicket();
    const checkout = (await pax.call('POST', `/tickets/${t.id}/checkout`)).body.data as { checkoutUrl: string };
    const started = Date.now();
    const res = await anon().call('POST', `/payments/mock/sessions/${checkout.checkoutUrl.replace('/pay/mock/', '')}/complete`, { outcome: 'paid', method: 'gcash' });
    expect(res.body.data.outcome).toBe('applied');
    expect(Date.now() - started).toBeLessThan(2000);
  });
});

describe('asking for the email again', () => {
  it('resends a paid ticket to its owner', async () => {
    const t = await newTicket();
    await pay(t.id);
    provider.sent.length = 0;
    const res = await pax.call('POST', `/tickets/${t.id}/email`);
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ sent: true });
    expect(provider.sent).toHaveLength(1);
    expect(provider.sent[0]!.to).toBe('pax@t.test');
  });

  it('not more than once a minute for one ticket', async () => {
    const t = await newTicket();
    await pay(t.id);
    expect((await pax.call('POST', `/tickets/${t.id}/email`)).status).toBe(200);
    const again = await pax.call('POST', `/tickets/${t.id}/email`);
    expect(again.status).toBe(429);
    expect(again.body.error.message).toMatch(/wait a minute/);
  });

  it('a send that failed does not use up the minute, and says it did not go', async () => {
    const t = await newTicket();
    await pay(t.id);
    mail.setMailProvider({ name: 'smtp', send: vi.fn(async () => Promise.reject(new Error('down'))) });
    expect((await pax.call('POST', `/tickets/${t.id}/email`)).body.data).toEqual({ sent: false });
    mail.setMailProvider(provider);
    expect((await pax.call('POST', `/tickets/${t.id}/email`)).body.data).toEqual({ sent: true });
  });

  it('only for the owner, and only while the ticket is paid', async () => {
    const t = await newTicket();
    expect((await pax.call('POST', `/tickets/${t.id}/email`)).status).toBe(409); // not paid yet
    await pay(t.id);
    expect((await other.call('POST', `/tickets/${t.id}/email`)).status).toBe(404);
    expect((await anon().call('POST', `/tickets/${t.id}/email`)).status).toBe(401);
    expect((await admin.call('POST', `/tickets/${t.id}/email`)).status).toBe(403);
    await db().query("UPDATE tickets SET status = 'used', used_at = now() WHERE id = $1", [t.id]);
    expect((await pax.call('POST', `/tickets/${t.id}/email`)).status).toBe(409); // used: nothing to show a konduktor
  });
});
