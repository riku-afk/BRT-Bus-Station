import { describe, expect, it } from 'vitest';
import { signTicketToken, verifyTicketToken } from './qr-token';

const SECRET = 'a-test-signing-secret-that-is-long-enough-0123';
const TICKET = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
const OTHER = '9b2c3d4e-5f60-4a71-8b92-a3b4c5d6e7f8';

describe('QR ticket token', () => {
  it('has the versioned shape v1.<ticketId>.<signature>', () => {
    const token = signTicketToken(TICKET, SECRET);
    expect(token).toMatch(/^v1\.[0-9a-f-]{36}\.[A-Za-z0-9_-]{43}$/);
    expect(token.startsWith(`v1.${TICKET}.`)).toBe(true);
    expect(token.length).toBeLessThan(100); // small enough for a compact QR
  });

  it('round-trips: verifying a token returns the ticket it was made for', () => {
    expect(verifyTicketToken(signTicketToken(TICKET, SECRET), SECRET)).toEqual({ ticketId: TICKET });
  });

  it('is unique per ticket and stable for the same ticket', () => {
    expect(signTicketToken(TICKET, SECRET)).toBe(signTicketToken(TICKET, SECRET));
    expect(signTicketToken(TICKET, SECRET)).not.toBe(signTicketToken(OTHER, SECRET));
  });

  it('refuses a token made with a different secret', () => {
    expect(verifyTicketToken(signTicketToken(TICKET, 'someone-elses-secret-0123456789abcdef'), SECRET)).toBeNull();
  });

  it('refuses a token whose ticket id was swapped for another (the signature belongs to one ticket)', () => {
    const signature = signTicketToken(TICKET, SECRET).split('.')[2];
    expect(verifyTicketToken(`v1.${OTHER}.${signature}`, SECRET)).toBeNull();
  });

  it('refuses a token with any character of the signature changed', () => {
    const token = signTicketToken(TICKET, SECRET);
    for (const i of [token.length - 1, token.length - 20, token.length - 43]) {
      const flipped = token.slice(0, i) + (token[i] === 'A' ? 'B' : 'A') + token.slice(i + 1);
      expect(verifyTicketToken(flipped, SECRET)).toBeNull();
    }
  });

  it('refuses another version, truncated, padded or malformed tokens, and never throws', () => {
    const good = signTicketToken(TICKET, SECRET);
    const sig = good.split('.')[2]!;
    const bad = [
      '',
      'garbage',
      good.replace('v1.', 'v2.'),
      good.slice(0, -1),
      good + 'A',
      `v1.${TICKET}`,
      `v1.${TICKET}.${sig}.extra`,
      `v1.not-a-uuid.${sig}`,
      `v1.${TICKET}.${'A'.repeat(43)}`,
      `v1.${TICKET}.${'!'.repeat(43)}`,
      'v1..',
      '\u0000\u0001',
      'x'.repeat(10_000),
    ];
    for (const token of bad) expect(verifyTicketToken(token, SECRET), token.slice(0, 30)).toBeNull();
  });

  it('tolerates surrounding whitespace from a scanner, but not whitespace inside', () => {
    const token = signTicketToken(TICKET, SECRET);
    expect(verifyTicketToken(`  ${token}\n`, SECRET)).toEqual({ ticketId: TICKET });
    expect(verifyTicketToken(token.replace('.', ' .'), SECRET)).toBeNull();
  });
});
