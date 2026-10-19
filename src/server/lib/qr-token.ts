/**
 * The signed token a ticket's QR code carries (QR-01, QR-02, D-10): `v1.<ticketId>.<signature>` where the signature is
 * base64url(HMAC-SHA256(secret, "v1." + ticketId)).
 *
 * The token names the TICKET, not the passenger, so every ticket's QR is unique; it cannot be forged without the secret;
 * and the scanner verifies the signature BEFORE touching the database, comparing in constant time. The version prefix
 * lets the secret or the format change later without breaking the parser.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { env } from '@config/env';

const VERSION = 'v1';
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// SHA-256 is 32 bytes = 43 base64url characters.
const TOKEN_PATTERN = new RegExp(`^${VERSION}\\.(${UUID})\\.([A-Za-z0-9_-]{43})$`);

const sign = (ticketId: string, secret: string) => createHmac('sha256', secret).update(`${VERSION}.${ticketId}`).digest();

export function signTicketToken(ticketId: string, secret: string = env.qr.signingSecret): string {
  return `${VERSION}.${ticketId}.${sign(ticketId, secret).toString('base64url')}`;
}

/** The ticket id inside a genuine token, or null for anything else (wrong shape, wrong secret, altered). Never throws. */
export function verifyTicketToken(token: string, secret: string = env.qr.signingSecret): { ticketId: string } | null {
  const match = TOKEN_PATTERN.exec(token.trim());
  if (!match) return null;
  const [, ticketId, given] = match as unknown as [string, string, string];
  const expected = sign(ticketId, secret);
  const actual = Buffer.from(given, 'base64url');
  if (actual.length !== expected.length) return null;
  return timingSafeEqual(expected, actual) ? { ticketId } : null;
}
