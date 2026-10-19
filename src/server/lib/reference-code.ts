/**
 * Public ticket reference code (TKT-08): short, easy to read out loud, unique. `BRT-` plus six characters from an
 * alphabet without look-alikes (no 0/O, 1/I). Not a secret and not what the QR carries: the QR token is signed (P6).
 */
import { randomInt } from 'node:crypto';

export const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const REFERENCE_PATTERN = /^BRT-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;

export function generateReferenceCode(): string {
  let code = 'BRT-';
  for (let i = 0; i < 6; i++) code += REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)];
  return code;
}
