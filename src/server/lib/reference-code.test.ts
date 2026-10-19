import { describe, expect, it } from 'vitest';
import { generateReferenceCode, REFERENCE_ALPHABET, REFERENCE_PATTERN } from './reference-code';

describe('reference codes', () => {
  it('have the BRT- format and avoid look-alike characters', () => {
    expect(REFERENCE_ALPHABET).not.toMatch(/[01OI]/);
    for (let i = 0; i < 500; i++) expect(generateReferenceCode()).toMatch(REFERENCE_PATTERN);
  });

  it('are random: 2000 codes collide essentially never', () => {
    const codes = new Set(Array.from({ length: 2000 }, generateReferenceCode));
    expect(codes.size).toBeGreaterThan(1995);
  });
});
