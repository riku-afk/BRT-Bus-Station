/**
 * Single sign-on from the partner system (the Smart City app, "SCE").
 *
 * Two kinds of signed token (HS256, shared secret, never the mobile app's business):
 *  - hand-off token (audience `brt`): put in the URL that opens the passenger pages in the app's browser. Used once.
 *  - API token (audience `brt-api`): sent by the partner's backend, server to server, to ask for one citizen's tickets.
 * The partner's user id (`sub`) is what identifies the person. A token can only ever create or sign in a PASSENGER.
 */
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { jwtVerify, type JWTPayload } from 'jose';
import { env } from '@config/env';
import { getDb, transaction } from '@core/database';
import { ApiError } from '@lib/response';
import type { UserRow } from '@modules/auth/auth.types';
import { ticketsService } from '@modules/tickets';
import { toPage } from '@shared/pagination';
import type { TicketFilter } from '@shared/tickets/status';
import { ssoRepository } from './sso.repository';

/** Which system the user ids come from; stored with the id so ids from two systems could never collide. */
export const SSO_PROVIDER = 'sce';

const key = () => new TextEncoder().encode(env.sso.secret);
const bad = (message = 'This sign-in link is not valid or has expired') => new ApiError(401, 'SSO_INVALID', message);

export type SsoClaims = { sub: string; jti: string; name: string; email: string };

function claimsOf(payload: JWTPayload): SsoClaims {
  const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
  const jti = typeof payload.jti === 'string' ? payload.jti : '';
  const name = typeof payload.name === 'string' ? payload.name.trim() : '';
  const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';
  if (!sub || sub.length > 100 || !jti || jti.length > 200) throw bad();
  return { sub, jti, name: name.slice(0, 200), email: email.slice(0, 254) };
}

async function verify(token: string, audience: string): Promise<JWTPayload> {
  if (!env.sso.enabled) throw ApiError.notFound('Not found');
  try {
    const { payload } = await jwtVerify(token, key(), {
      algorithms: ['HS256'],
      issuer: env.sso.issuer,
      audience,
      maxTokenAge: env.sso.maxTokenAgeSeconds,
      requiredClaims: ['exp', 'iat', 'sub'],
    });
    return payload;
  } catch {
    throw bad();
  }
}

/** The address a passenger gets when the partner's email is missing or already belongs to another BRT account. */
const aliasEmail = (externalId: string) => `sce-${externalId.replace(/[^a-z0-9]/gi, '').toLowerCase()}@sso.invalid`;

export const ssoService = {
  /** Verifies a hand-off token, uses it up, and returns the passenger it names (creating the account the first time). */
  async signIn(token: string): Promise<UserRow> {
    const claims = claimsOf(await verify(token, env.sso.audience));
    // A token works once. This is committed on its own, before anything else, so even an attempt that then fails cannot be retried.
    if (!(await ssoRepository.recordTokenUse(getDb(), claims.jti))) throw bad();

    return transaction(async (tx) => {
      const existing = await ssoRepository.findByExternal(tx, SSO_PROVIDER, claims.sub);
      if (existing) {
        if (!existing.is_active) throw new ApiError(403, 'FORBIDDEN', 'This account is not active');
        if (existing.role !== 'passenger') throw new ApiError(403, 'FORBIDDEN', 'Only passenger accounts can sign in this way');
        if (claims.name) await ssoRepository.updateName(tx, existing.id, claims.name);
        return existing;
      }

      // Never merge into an existing BRT account just because the email matches: that would be an account takeover by email.
      const email = claims.email && !(await ssoRepository.emailTaken(tx, claims.email)) ? claims.email : aliasEmail(claims.sub);
      if (await ssoRepository.emailTaken(tx, email)) throw ApiError.conflict('Could not create the account');
      return ssoRepository.insertExternal(tx, {
        provider: SSO_PROVIDER,
        externalId: claims.sub,
        email,
        passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 10),
        fullName: claims.name || 'Passenger',
      });
    });
  },

  /** The QR image of one PAID ticket of the citizen named by a server-to-server token. Someone else's ticket is "not found". */
  async qrFor(token: string, ticketId: string): Promise<Buffer> {
    const claims = claimsOf(await verify(token, env.sso.apiAudience));
    const user = await ssoRepository.findByExternal(getDb(), SSO_PROVIDER, claims.sub);
    if (!user || user.role !== 'passenger') throw ApiError.notFound('Ticket not found');
    return ticketsService.qrFor(user.id, ticketId);
  },

  /** The tickets of the citizen named by a server-to-server token. A citizen who has never opened BRT simply has none. */
  async ticketsFor(token: string, query: { filter: TicketFilter; page: number; pageSize: number }) {
    const claims = claimsOf(await verify(token, env.sso.apiAudience));
    const user = await ssoRepository.findByExternal(getDb(), SSO_PROVIDER, claims.sub);
    if (!user || user.role !== 'passenger') return { ...toPage([], 0, 1, query.pageSize), counts: { all: 0, pay: 0, ready: 0, transactions: 0 } };
    return ticketsService.listPage(user.id, query);
  },
};
