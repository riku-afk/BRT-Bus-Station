import { describe, expect, it } from 'vitest';
import { isKonduktorApp } from './native-app';

describe('isKonduktorApp', () => {
  it('is true inside the Android app, whose user agent carries the marker', () => {
    expect(isKonduktorApp('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/126 Mobile Safari/537.36 BRTKonduktorApp')).toBe(true);
  });
  it('is false in an ordinary browser, or with nothing to look at', () => {
    expect(isKonduktorApp('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126 Safari/537.36')).toBe(false);
    expect(isKonduktorApp('')).toBe(false);
  });
});
