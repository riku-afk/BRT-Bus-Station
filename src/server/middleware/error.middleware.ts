/**
 * Global error and not-found handlers. Unexpected errors never leak internals outside development.
 */
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { env } from '@config/env';
import { ApiError, errorResponse } from '@lib/response';

export function errorHandler(err: Error, c: Context) {
  if (err instanceof ApiError) {
    return c.json(err.toResponse(), err.statusCode as ContentfulStatusCode);
  }

  if (err instanceof HTTPException) {
    return c.json(errorResponse('HTTP_ERROR', err.message), err.status);
  }

  if (err.name === 'ZodError') {
    const issues = (err as unknown as { issues?: Array<{ path: PropertyKey[]; code: string; message: string }> }).issues ?? [];
    return c.json(
      errorResponse('VALIDATION_ERROR', issues[0]?.message || 'Validation failed', {
        errors: issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code, message: issue.message })),
      }),
      400,
    );
  }

  // The X-Request-Id response header is only set after the handler returns; read the context value.
  const requestId = (c.get('requestId' as never) as string | undefined) ?? 'unknown';
  const dbCode = 'code' in err && typeof err.code === 'string' ? ` code=${err.code}` : '';
  console.error(`[api-error] requestId=${requestId} ${c.req.method} ${c.req.path} ${err.name}${dbCode}: ${err.message}`);
  if (err.stack) console.error(err.stack);

  return c.json(errorResponse('INTERNAL_ERROR', env.isDev ? err.message : 'Internal server error', { requestId }), 500);
}

export function notFoundHandler(c: Context) {
  return c.json(errorResponse('NOT_FOUND', `Route ${c.req.method} ${c.req.path} not found`), 404);
}
