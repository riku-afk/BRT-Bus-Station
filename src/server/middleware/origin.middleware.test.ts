import { describe, expect, it, vi } from 'vitest';

// The settings are read when the app's code is first loaded, so they are set before any import.
vi.hoisted(() => {
  process.env.APP_BASE_URL = 'http://10.10.0.4:8080';
  process.env.APP_EXTRA_ORIGINS = 'http://localhost:8080, http://10.0.2.2:8080';
});

import { createOpenAPIApp } from '@lib/openapi';
import { errorHandler } from '@middleware/error.middleware';
import { originMiddleware } from './auth.middleware';

function app() {
  const a = createOpenAPIApp();
  a.use('*', originMiddleware);
  a.get('/thing', (c) => c.json({ ok: true }));
  a.post('/thing', (c) => c.json({ ok: true }));
  a.onError(errorHandler);
  return a;
}

const post = (origin?: string) => app().request('http://internal:3000/thing', { method: 'POST', headers: origin ? { Origin: origin } : {} });

describe('originMiddleware (writes from another site are refused)', () => {
  it('accepts a write with no Origin (a server calling us), from the app\'s own address, and from the listed extra addresses', async () => {
    expect((await post()).status).toBe(200);
    expect((await post('http://internal:3000')).status).toBe(200); // the address the request arrived at
    expect((await post('http://10.10.0.4:8080')).status).toBe(200); // APP_BASE_URL
    expect((await post('http://localhost:8080')).status).toBe(200); // APP_EXTRA_ORIGINS: the emulator through adb reverse
    expect((await post('http://10.0.2.2:8080')).status).toBe(200);
  });

  it('refuses a write from any other site, even one that looks similar', async () => {
    for (const origin of ['https://evil.example', 'http://localhost:9999', 'http://localhost', 'https://localhost:8080', 'http://10.10.0.4:8081']) {
      const res = await post(origin);
      expect(res.status, origin).toBe(403);
    }
  });

  it('does not look at reads', async () => {
    const res = await app().request('http://internal:3000/thing', { headers: { Origin: 'https://evil.example' } });
    expect(res.status).toBe(200);
  });
});
