import { describe, expect, it } from 'vitest';
import { endOfManilaDay, formatManilaTime, manilaDateKey } from './ph-time';

describe('formatManilaTime', () => {
  it('shows UTC instants in Manila time (UTC+8)', () => {
    expect(formatManilaTime('2026-10-16T01:45:00Z')).toBe('9:45 AM');
    expect(formatManilaTime(new Date('2026-10-16T13:05:00Z'))).toBe('9:05 PM');
  });

  it('rolls over midnight correctly', () => {
    expect(formatManilaTime('2026-10-15T16:30:00Z')).toBe('12:30 AM');
  });
});

describe('endOfManilaDay', () => {
  it('is 23:59:59 Manila time on the same Manila day', () => {
    // 09:00 Manila on 16 Oct = 01:00 UTC; the day ends at 15:59:59 UTC.
    expect(endOfManilaDay(new Date('2026-10-16T01:00:00Z')).toISOString()).toBe('2026-10-16T15:59:59.000Z');
  });

  it('uses the Manila date, not the UTC date, around midnight', () => {
    // 23:58 Manila on 16 Oct = 15:58 UTC. Still the 16th in Manila.
    expect(endOfManilaDay(new Date('2026-10-16T15:58:00Z')).toISOString()).toBe('2026-10-16T15:59:59.000Z');
    // 00:03 Manila on 17 Oct = 16:03 UTC on the 16th. The next Manila day.
    expect(endOfManilaDay(new Date('2026-10-16T16:03:00Z')).toISOString()).toBe('2026-10-17T15:59:59.000Z');
  });

  it('is always after the instant it was computed from, and less than a day away', () => {
    for (let h = 0; h < 48; h++) {
      const at = new Date(Date.UTC(2026, 9, 16, h));
      const end = endOfManilaDay(at);
      expect(end.getTime()).toBeGreaterThan(at.getTime());
      expect(end.getTime() - at.getTime()).toBeLessThanOrEqual(24 * 3600_000);
    }
  });
});

describe('manilaDateKey', () => {
  it('is the Manila calendar day, not the UTC day', () => {
    expect(manilaDateKey('2026-10-16T01:00:00Z')).toBe('2026-10-16'); // 9:00 AM Manila
    expect(manilaDateKey('2026-10-16T15:59:59Z')).toBe('2026-10-16'); // 11:59:59 PM Manila
    expect(manilaDateKey('2026-10-16T16:00:00Z')).toBe('2026-10-17'); // midnight Manila: already the 17th
    expect(manilaDateKey(new Date('2026-10-15T23:30:00Z'))).toBe('2026-10-16'); // 7:30 AM Manila
  });
});
