import type { Context } from 'hono';
import { env } from '@config/env';
import type { AppEnv } from '@core/types';
import { ApiError } from '@lib/response';
import { hostAllowsRole, normalizeHost, wrongHostMessage } from '@shared/host-roles';
import type { Role } from '@shared/rbac/roles';

/** The address the browser used (behind the proxy this is the forwarded host). */
export function requestHost(c: Context<AppEnv>): string {
  return normalizeHost(c.req.header('x-forwarded-host') ?? c.req.header('host') ?? new URL(c.req.url).host);
}

/** True when this role may use the address the request came to (HOST_ROLES). Unlisted addresses have no restriction. */
export function roleAllowedHere(c: Context<AppEnv>, role: Role): boolean {
  return hostAllowsRole(env.hostRoles, requestHost(c), role);
}

export function assertRoleAllowedHere(c: Context<AppEnv>, role: Role): void {
  if (!roleAllowedHere(c, role)) throw ApiError.forbidden(wrongHostMessage(env.hostRoles, requestHost(c)));
}
