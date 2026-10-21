import { createRoute } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { deleteCookie, setCookie } from 'hono/cookie';
import { env } from '@config/env';
import type { AppEnv } from '@core/types';
import { createOpenAPIApp } from '@lib/openapi';
import { assertRoleAllowedHere, roleAllowedHere } from '@lib/host-roles';
import { createRateLimiter } from '@lib/rate-limit';
import { ApiError, apiResponse } from '@lib/response';
import { LoginBody, NullableUserResponse, OkResponse, RegisterBody, UserResponse } from './auth.schema';
import { authService, SESSION_COOKIE, toView } from './auth.service';

// AUTH-06: 10 attempts per client+email per 15 minutes.
const loginLimiter = createRateLimiter({ max: 10, windowMs: 15 * 60_000 });

const cookieOptions = () => ({
  httpOnly: true,
  sameSite: 'Lax' as const,
  secure: env.appEnv === 'prod',
  path: '/',
});

export async function startSession(c: Context<AppEnv>, userId: string) {
  const token = await authService.issueSessionToken(userId);
  setCookie(c, SESSION_COOKIE, token, { ...cookieOptions(), maxAge: env.session.ttlHours * 3600 });
}

function clientKey(c: Context<AppEnv>, email: string) {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0]?.trim() || c.req.header('x-real-ip') || 'local';
  return `${ip}|${email}`;
}

const json = <T extends object>(schema: T) => ({ content: { 'application/json': { schema } } });

const registerRoute = createRoute({
  method: 'post',
  path: '/auth/register',
  tags: ['Auth'],
  summary: 'Passenger self-registration',
  request: { body: { ...json(RegisterBody), required: true } },
  responses: { 201: { description: 'Account created and signed in', ...json(UserResponse) } },
});

const loginRoute = createRoute({
  method: 'post',
  path: '/auth/login',
  tags: ['Auth'],
  summary: 'Sign in with email and password',
  request: { body: { ...json(LoginBody), required: true } },
  responses: { 200: { description: 'Signed in', ...json(UserResponse) } },
});

const logoutRoute = createRoute({
  method: 'post',
  path: '/auth/logout',
  tags: ['Auth'],
  summary: 'Sign out',
  responses: { 200: { description: 'Signed out', ...json(OkResponse) } },
});

const meRoute = createRoute({
  method: 'get',
  path: '/auth/me',
  tags: ['Auth'],
  summary: 'Current user, or null when signed out',
  responses: { 200: { description: 'Current user', ...json(NullableUserResponse) } },
});

export const authController = createOpenAPIApp()
  .openapi(registerRoute, async (c) => {
    if (!roleAllowedHere(c, 'passenger')) throw ApiError.forbidden('Registration is not available here');
    const user = await authService.register(c.req.valid('json'));
    await startSession(c, user.id);
    return c.json(apiResponse(toView(user)), 201);
  })
  .openapi(loginRoute, async (c) => {
    const { email, password } = c.req.valid('json');
    const key = clientKey(c, email);
    const limit = loginLimiter.hit(key);
    if (!limit.allowed) {
      c.header('Retry-After', String(limit.retryAfterSeconds));
      throw new ApiError(429, 'RATE_LIMITED', 'Too many sign-in attempts. Try again later.');
    }
    const user = await authService.authenticate(email, password);
    // Each address is for one kind of account: the right password on the wrong address fails exactly like a wrong password
    // (and, like it, counts toward the attempt limit).
    assertRoleAllowedHere(c, user.role);
    loginLimiter.reset(key);
    await startSession(c, user.id);
    return c.json(apiResponse(toView(user)), 200);
  })
  .openapi(logoutRoute, (c) => {
    deleteCookie(c, SESSION_COOKIE, cookieOptions());
    return c.json(apiResponse({ ok: true as const }), 200);
  })
  .openapi(meRoute, (c) => c.json(apiResponse(c.get('auth')?.user ?? null), 200));
