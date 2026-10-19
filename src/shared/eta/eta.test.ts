import { describe, expect, it } from 'vitest';
import { dispatchEta, etaMinutes, formatEta, lineEtas, travelSeconds } from './eta';

// Stations every 1 000 m: 0, 1000, ..., 4000. At 36 km/h a bus does 10 m/s, so 1 000 m takes 100 s.
const stations = [0, 1000, 2000, 3000, 4000];
const params = { speedKmh: 36, dwellSeconds: 20 };

describe('travelSeconds', () => {
  it('is distance over speed', () => {
    expect(travelSeconds(1000, 36)).toBe(100);
    expect(travelSeconds(0, 36)).toBe(0);
    expect(travelSeconds(-5, 36)).toBe(0);
    expect(travelSeconds(1000, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('lineEtas (ETA-01)', () => {
  it('lists every station ahead in the direction of travel, nearest first, with a dwell at each stop passed', () => {
    const etas = lineEtas(stations, { distanceMeters: 500, direction: 1 }, params);
    expect(etas.map((e) => e.stationIndex)).toEqual([1, 2, 3, 4]);
    expect(etas.map((e) => e.stopsAway)).toEqual([1, 2, 3, 4]);
    // 500 m = 50 s to the next; then 100 s driving + 20 s dwell for each further station.
    expect(etas.map((e) => e.seconds)).toEqual([50, 170, 290, 410]);
  });

  it('works the other way: heading towards the start of the line', () => {
    const etas = lineEtas(stations, { distanceMeters: 2500, direction: -1 }, params);
    expect(etas.map((e) => e.stationIndex)).toEqual([2, 1, 0]);
    expect(etas.map((e) => e.seconds)).toEqual([50, 170, 290]);
  });

  it('a bus stopped at a station is not arriving there', () => {
    const etas = lineEtas(stations, { distanceMeters: 2000, direction: 1 }, params);
    expect(etas.map((e) => e.stationIndex)).toEqual([3, 4]);
    expect(etas[0]!.seconds).toBe(100);
  });

  it('has nothing ahead at the end of the line in its direction', () => {
    expect(lineEtas(stations, { distanceMeters: 4000, direction: 1 }, params)).toEqual([]);
    expect(lineEtas(stations, { distanceMeters: 0, direction: -1 }, params)).toEqual([]);
  });

  it('is longer with a longer dwell and shorter with a higher speed', () => {
    const base = lineEtas(stations, { distanceMeters: 0, direction: 1 }, params).at(-1)!.seconds;
    expect(lineEtas(stations, { distanceMeters: 0, direction: 1 }, { ...params, dwellSeconds: 60 }).at(-1)!.seconds).toBeGreaterThan(base);
    expect(lineEtas(stations, { distanceMeters: 0, direction: 1 }, { ...params, speedKmh: 72 }).at(-1)!.seconds).toBeLessThan(base);
  });

  it('is monotonic: a station further on never arrives sooner', () => {
    const etas = lineEtas(stations, { distanceMeters: 137, direction: 1 }, params);
    for (let i = 1; i < etas.length; i++) expect(etas[i]!.seconds).toBeGreaterThan(etas[i - 1]!.seconds);
  });
});

describe('dispatchEta: non-stop', () => {
  it('has no dwell on the way', () => {
    expect(dispatchEta(stations, { distanceMeters: 0 }, 4, params)).toBe(400);
    expect(dispatchEta(stations, { distanceMeters: 4000 }, 1, params)).toBe(300); // either direction
  });

  it('is zero when already there, and null for an unknown station', () => {
    expect(dispatchEta(stations, { distanceMeters: 3000.4 }, 3, params)).toBe(0);
    expect(dispatchEta(stations, { distanceMeters: 0 }, 9, params)).toBeNull();
  });
});

describe('reading an ETA', () => {
  it('rounds minutes up', () => {
    expect(etaMinutes(1)).toBe(1);
    expect(etaMinutes(60)).toBe(1);
    expect(etaMinutes(61)).toBe(2);
    expect(etaMinutes(0)).toBe(0);
  });

  it('says "Arriving now" under 45 seconds, then minutes', () => {
    expect(formatEta(10)).toBe('Arriving now');
    expect(formatEta(44)).toBe('Arriving now');
    expect(formatEta(45)).toBe('1 min');
    expect(formatEta(300)).toBe('5 min');
    expect(formatEta(3600)).toBe('1 h');
    expect(formatEta(3900)).toBe('1 h 5 min');
  });

  it('has no estimate when it cannot be worked out', () => {
    expect(formatEta(null)).toBe('No estimate');
    expect(formatEta(undefined)).toBe('No estimate');
    expect(formatEta(Number.POSITIVE_INFINITY)).toBe('No estimate');
  });
});
