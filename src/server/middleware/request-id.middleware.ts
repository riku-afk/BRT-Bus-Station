/**
 * Request ID
 *
 * Every request gets an ID (or keeps a valid incoming X-Request-Id) so API logs, audit events
 * and integrator support tickets can be correlated.
 */
import type { Context, Next } from 'hono';

const VALID_ID = /^[A-Za-z0-9._-]{8,128}$/;

export type RequestIdVariables = { requestId: string };

export async function requestIdMiddleware(c: Context<{ Variables: RequestIdVariables }>, next: Next) {
  const incoming = c.req.header('x-request-id');
  const requestId = incoming && VALID_ID.test(incoming) ? incoming : crypto.randomUUID();
  c.set('requestId', requestId);
  await next();
  c.header('X-Request-Id', requestId);
}
