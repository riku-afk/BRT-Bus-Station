import { describe, expect, it } from 'vitest';
import { passwordStrength } from './register-page';

describe('passwordStrength', () => {
  it('counts down the characters still needed, then says it looks good', () => {
    expect(passwordStrength('')).toEqual({ level: 0, hint: 'At least 8 characters.' });
    expect(passwordStrength('abcdefg')).toEqual({ level: 1, hint: '1 more character needed.' });
    expect(passwordStrength('abc')).toEqual({ level: 1, hint: '5 more characters needed.' });
    expect(passwordStrength('abcdefgh')).toEqual({ level: 3, hint: 'Looks good.' });
    expect(passwordStrength('abcdefghijkl')).toEqual({ level: 4, hint: 'Looks good.' });
  });
});
