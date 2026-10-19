import { describe, expect, it } from 'vitest';
import { axisTicks, METRICS, niceCeil, shortDate } from './chart-math';

describe('niceCeil', () => {
  it('rounds up to 1, 2, 2.5, 5 or 10 times a power of ten', () => {
    expect(niceCeil(0)).toBe(1);
    expect(niceCeil(-5)).toBe(1);
    expect(niceCeil(1)).toBe(1);
    expect(niceCeil(1.1)).toBe(2);
    expect(niceCeil(2.3)).toBe(2.5);
    expect(niceCeil(4)).toBe(5);
    expect(niceCeil(7)).toBe(10);
    expect(niceCeil(24500)).toBe(25000);
    expect(niceCeil(90)).toBe(100);
  });

  it('never goes below the value', () => {
    for (const v of [0.4, 3, 11, 49, 51, 999, 1001, 123456]) expect(niceCeil(v)).toBeGreaterThanOrEqual(v);
  });
});

describe('axisTicks', () => {
  it('is zero, half and a tidy top', () => {
    expect(axisTicks(24500)).toEqual([0, 12500, 25000]);
    expect(axisTicks(7)).toEqual([0, 5, 10]);
    expect(axisTicks(0)).toEqual([0, 0.5, 1]);
  });
});

describe('shortDate', () => {
  it('is the month and day of a Manila date', () => {
    expect(shortDate('2026-10-20')).toBe('Oct 20');
    expect(shortDate('2026-01-05')).toBe('Jan 5');
  });
});

describe('the metrics', () => {
  it('format money in pesos and counts as plain numbers', () => {
    expect(METRICS.sales.format(24500)).toBe('₱245.00');
    expect(METRICS.sales.axis(25000)).toBe('₱250');
    expect(METRICS.sales.axis(12_500_000)).toBe('₱125,000');
    expect(METRICS.tickets.format(12)).toBe('12');
    expect(METRICS.passengers.axis(5)).toBe('5');
  });
});
