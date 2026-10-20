/**
 * Session + role guards.
 *
 * `sessionMiddleware` verifies the signed session cookie and reloads the user from the database
 * (so deactivation takes effect immediately, AUTH-07); `requireRole` guards routes (AUTH-04).
 * `originMiddleware` guards state-changing requests against cross-site calls (AUTH-06).
 */
import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { env } from '@config/env';
import { ApiError } from '@lib/response';
import type { AppEnv, AuthContext } from '@core/types';
import { authService, SESSION_COOKIE } from '@modules/auth';
import type { Role } from '@shared/rbac/roles';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Same-origin SPA, no CORS: refuse writes whose Origin header names another site. */
export async function originMiddleware(c: Context<AppEnv>, next: Next) {
  if (!SAFE_METHODS.has(c.req.method)) {
    // Webhooks come from provider servers (no Origin header) and authenticate by signature instead.
    const origin = c.req.header('origin');
    if (origin) {
      const allowed = new Set([new URL(c.req.url).origin, new URL(env.baseUrl).origin, ...env.extraOrigins.map((o) => new URL(o).origin)]);
      if (!allowed.has(origin)) throw ApiError.forbidden('Cross-site request refused');
    }
  }
  await next();
}

export async function sessionMiddleware(c: Context<AppEnv>, next: Next) {
  const token = getCookie(c, SESSION_COOKIE);
  const user = token ? await authService.userFromSessionToken(token) : null;
  c.set('auth', user ? { user } : null);
  await next();
}

/** Route guard: 401 when unauthenticated, 403 when the role is not allowed. Services re-check ownership. */
export function requireRole(...roles: Role[]) {
  return async (c: Context<AppEnv>, next: Next) => {
    const auth = c.get('auth');
    if (!auth) throw ApiError.unauthorized();
    if (!roles.includes(auth.user.role)) throw ApiError.forbidden();
    await next();
  };
}

/**
 * Handler-level guard for typed OpenAPI routes: returns the auth context or throws 401 / 403.
 * Call it first in the handler; services still re-check ownership.
 */
export function authorize(c: Context<AppEnv>, ...roles: Role[]): AuthContext {
  const auth = c.get('auth');
  if (!auth) throw ApiError.unauthorized();
  if (roles.length > 0 && !roles.includes(auth.user.role)) throw ApiError.forbidden();
  return auth;
}
