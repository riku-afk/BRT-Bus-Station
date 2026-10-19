import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Session, setupTestApp } from './helpers';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
const app = () => ({ request: (p: string, i?: RequestInit) => ctx.api.request(p, i) });

beforeAll(async () => {
  ctx = await setupTestApp();
  const { authService } = await import('@modules/auth');
  await authService.createUser({ email: 'admin@t.test', password: 'Password123', fullName: 'Test Admin', role: 'admin' });
  await authService.createUser({ email: 'kond@t.test', password: 'Password123', fullName: 'Test Konduktor', role: 'konduktor' });
}, 120_000);

afterAll(async () => {
  await ctx?.close();
});

describe('auth', () => {
  it('registers a passenger, signs them in, and ignores a role in the body (AUTH-01, GEN-05)', async () => {
    const s = new Session(app());
    const res = await s.call('POST', '/auth/register', { email: 'New@T.test', password: 'Password123', fullName: 'New Passenger', role: 'admin' });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ email: 'new@t.test', role: 'passenger' });
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    expect(res.headers.get('set-cookie')).toMatch(/SameSite=Lax/i);

    const me = await s.call('GET', '/auth/me');
    expect(me.body.data).toMatchObject({ email: 'new@t.test', role: 'passenger' });
    expect(JSON.stringify(me.body)).not.toContain('password');
  });

  it('rejects duplicate emails, weak passwords, and bad credentials', async () => {
    const s = new Session(app());
    const dup = await s.call('POST', '/auth/register', { email: 'admin@t.test', password: 'Password123', fullName: 'Dup' });
    expect(dup.status).toBe(409);
    const weak = await s.call('POST', '/auth/register', { email: 'weak@t.test', password: 'short', fullName: 'Weak' });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe('VALIDATION_ERROR');
    const bad = await s.call('POST', '/auth/login', { email: 'admin@t.test', password: 'wrong-password' });
    expect(bad.status).toBe(401);
    expect(bad.body.error.code).toBe('INVALID_CREDENTIALS');
    const unknown = await s.call('POST', '/auth/login', { email: 'nobody@t.test', password: 'Password123' });
    expect(unknown.body.error.message).toBe(bad.body.error.message);
  });

  it('logs in, reports the user, and logs out', async () => {
    const s = new Session(app());
    expect((await s.call('GET', '/auth/me')).body.data).toBeNull();
    const login = await s.call('POST', '/auth/login', { email: 'kond@t.test', password: 'Password123' });
    expect(login.status).toBe(200);
    expect((await s.call('GET', '/auth/me')).body.data.role).toBe('konduktor');
    await s.call('POST', '/auth/logout');
    expect((await s.call('GET', '/auth/me')).body.data).toBeNull();
  });

  it('rejects a deactivated user immediately, even with a valid session (AUTH-07)', async () => {
    const s = new Session(app());
    await s.call('POST', '/auth/login', { email: 'kond@t.test', password: 'Password123' });
    await ctx.db.getDb().query("UPDATE users SET is_active = false WHERE email = 'kond@t.test'");
    expect((await s.call('GET', '/auth/me')).body.data).toBeNull();
    const again = await new Session(app()).call('POST', '/auth/login', { email: 'kond@t.test', password: 'Password123' });
    expect(again.status).toBe(401);
    await ctx.db.getDb().query("UPDATE users SET is_active = true WHERE email = 'kond@t.test'");
  });

  it('rate-limits repeated failed sign-ins (AUTH-06)', async () => {
    const s = new Session(app());
    let last = 0;
    for (let i = 0; i < 12; i++) last = (await s.call('POST', '/auth/login', { email: 'limit@t.test', password: 'nope-nope' })).status;
    expect(last).toBe(429);
  });

  it('refuses cross-site writes (AUTH-06)', async () => {
    const res = await ctx.api.request('/auth/logout', { method: 'POST', headers: { Origin: 'http://evil.example' } });
    expect(res.status).toBe(403);
  });
});
