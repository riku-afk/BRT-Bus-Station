import { describe, expect, it } from 'vitest';
import { env } from '@config/env';
import { createOpenAPIApp } from '@lib/openapi';
import { errorHandler, notFoundHandler } from '@middleware/error.middleware';
import { requestIdMiddleware } from '@middleware/request-id.middleware';
import { systemController } from './system.controller';

function buildApp() {
  const app = createOpenAPIApp();
  app.use('*', requestIdMiddleware);
  app.route('/', systemController);
  app.onError(errorHandler);
  app.notFound(notFoundHandler);
  return app;
}

describe('system controller', () => {
  it('reports liveness in the response envelope with a request id', async () => {
    const res = await buildApp().request('/health');
    expect(res.status).toBe(200);
    expect(res.headers.get('x-request-id')).toBeTruthy();
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
    expect(typeof body.timestamp).toBe('string');
  });

  it('exposes software name and version', async () => {
    const res = await buildApp().request('/system/info');
    const body = await res.json();
    expect(body.data.versionLabel).toMatch(/^Cavite Smart Transport Terminal v\d+\.\d+\.\d+/);
    // Whatever the developer's .env selects (mock or pisopay): it is reported as configured.
    expect(body.data.paymentProvider).toBe(env.payment.provider);
  });

  it('formats unknown routes as an error envelope', async () => {
    const res = await buildApp().request('/nope');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ success: false, error: { code: 'NOT_FOUND' } });
  });
});
