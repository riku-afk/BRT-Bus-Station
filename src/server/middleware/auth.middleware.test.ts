import { describe, expect, it } from 'vitest';
import { createOpenAPIApp } from '@lib/openapi';
import { errorHandler } from '@middleware/error.middleware';
import { authService } from '@modules/auth';
import { requireRole } from './auth.middleware';

function appWith(user: { role: 'passenger' | 'konduktor' | 'admin' } | null) {
  const app = createOpenAPIApp();
  app.use('*', async (c, next) => {
    c.set('auth', user ? { user: { id: 'u1', email: 'a@b.c', fullName: 'A', role: user.role } } : null);
    await next();
  });
  app.get('/admin-only', requireRole('admin'), (c) => c.json({ ok: true }));
  app.onError(errorHandler);
  return app;
}

describe('requireRole', () => {
  it('401 when signed out, 403 for the wrong role, 200 for the right one', async () => {
    expect((await appWith(null).request('/admin-only')).status).toBe(401);
    expect((await appWith({ role: 'passenger' }).request('/admin-only')).status).toBe(403);
    expect((await appWith({ role: 'admin' }).request('/admin-only')).status).toBe(200);
  });
});

describe('session token', () => {
  it('round-trips a signed token and rejects tampered or garbage tokens before touching the database', async () => {
    const token = await authService.issueSessionToken('00000000-0000-0000-0000-000000000001');
    expect(token.split('.')).toHaveLength(3);
    const fakeDb = { query: async () => [] };
    // Valid signature but unknown user → null (the fake database finds nobody).
    expect(await authService.userFromSessionToken(token, fakeDb)).toBeNull();
    const [h, p, s] = token.split('.');
    const forged = `${h}.${Buffer.from(JSON.stringify({ sub: 'someone-else' })).toString('base64url')}.${s}`;
    const exploding = { query: async () => { throw new Error('database must not be queried'); } };
    expect(await authService.userFromSessionToken(forged, exploding)).toBeNull();
    expect(await authService.userFromSessionToken(`${h}.${p}.x`, exploding)).toBeNull();
    expect(await authService.userFromSessionToken('garbage', exploding)).toBeNull();
  });
});
