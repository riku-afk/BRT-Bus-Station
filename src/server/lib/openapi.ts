/**
 * OpenAPI app factory.
 *
 * Routes declared with `createRoute` feed /api/openapi.json and the Swagger UI at /api/docs.
 * Use the `z` exported by @hono/zod-openapi in route schemas, not root `zod`.
 */
import { OpenAPIHono } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import type { Context } from 'hono';
import { APP_INFO } from '@shared/app-info';
import { env } from '@config/env';
import { errorResponse } from '@lib/response';
import type { AppEnv } from '@core/types';

type ValidationIssue = { path: PropertyKey[]; code: string; message: string };

export function openApiValidationHook(
  result: { success: true } | { success: false; error: { issues: ValidationIssue[] } },
  c: Context,
) {
  if (result.success) return;
  const issues = result.error.issues;
  return c.json(
    errorResponse('VALIDATION_ERROR', issues[0]?.message?.trim() || 'Validation failed', {
      errors: issues.map((issue) => ({ path: issue.path.join('.'), code: issue.code, message: issue.message })),
    }),
    400,
  );
}

export function createOpenAPIApp() {
  return new OpenAPIHono<AppEnv>({ defaultHook: openApiValidationHook });
}

export function mountApiDocs(app: OpenAPIHono<AppEnv>) {
  if (env.appEnv === 'prod') return; // PLT-10: docs in non-production only
  app.openAPIRegistry.registerComponent('securitySchemes', 'sessionCookie', {
    type: 'apiKey',
    in: 'cookie',
    name: 'brt_session',
    description: 'Browser session.',
  });
  app.doc('/openapi.json', {
    openapi: '3.0.0',
    info: { title: `${APP_INFO.softwareName} API`, version: APP_INFO.version, description: APP_INFO.pocDisclosure },
    servers: [{ url: '/api', description: APP_INFO.brand }],
  });
  app.get('/docs', swaggerUI({ url: '/api/openapi.json' }));
}
