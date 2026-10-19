import { describe, expect, it } from 'vitest';
import { clampPage, describeRange, offsetOf, toPage, totalPagesOf } from './pagination';

describe('pagination arithmetic', () => {
  it('counts pages, with at least one even when empty', () => {
    expect(totalPagesOf(0, 10)).toBe(1);
    expect(totalPagesOf(10, 10)).toBe(1);
    expect(totalPagesOf(11, 10)).toBe(2);
    expect(totalPagesOf(83, 10)).toBe(9);
    expect(totalPagesOf(5, 5)).toBe(1);
  });

  it('clamps a page into range: past the end is the last page, below one is the first', () => {
    expect(clampPage(1, 83, 10)).toBe(1);
    expect(clampPage(9, 83, 10)).toBe(9);
    expect(clampPage(10, 83, 10)).toBe(9);
    expect(clampPage(0, 83, 10)).toBe(1);
    expect(clampPage(-4, 83, 10)).toBe(1);
    expect(clampPage(7, 0, 10)).toBe(1);
  });

  it('works out where a page starts', () => {
    expect(offsetOf(1, 10)).toBe(0);
    expect(offsetOf(3, 10)).toBe(20);
    expect(offsetOf(2, 5)).toBe(5);
  });

  it('builds the page', () => {
    expect(toPage(['a', 'b'], 12, 2, 10)).toEqual({ items: ['a', 'b'], page: 2, pageSize: 10, total: 12, totalPages: 2 });
  });

  it('describes the range shown', () => {
    expect(describeRange(1, 10, 83, 10)).toBe('1 to 10 of 83');
    expect(describeRange(9, 10, 83, 3)).toBe('81 to 83 of 83');
    expect(describeRange(1, 10, 0, 0)).toBe('0 results');
  });
});
