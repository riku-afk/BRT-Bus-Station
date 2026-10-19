/**
 * Request logger: pretty in development, one JSON line per request otherwise.
 * Never log bodies, headers, cookies or query values
 */
import type { Context, Next } from 'hono';
import { env } from '@config/env';

export async function loggerMiddleware(c: Context, next: Next) {
  const start = performance.now();
  await next();
  const durationMs = Math.round(performance.now() - start);
  const entry = {
    timestamp: new Date().toISOString(),
    requestId: c.res.headers.get('X-Request-Id') ?? undefined,
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs,
  };

  if (env.logFormat === 'json') {
    console.log(JSON.stringify(entry));
  } else {
    console.log(`${entry.timestamp.slice(11, 19)} ${entry.method.padEnd(6)} ${entry.path} ${entry.status} ${durationMs}ms`);
  }
}
