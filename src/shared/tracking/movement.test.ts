import { describe, expect, it } from 'vitest';
import { advance, initialState, kmhToMps, type MoveParams, type MoveState } from './movement';

// Stations 1000 m apart: 0, 1000, 2000, 3000. 10 m/s, 5 s dwell.
const stations = [0, 1000, 2000, 3000];
const params: MoveParams = { speedMps: 10, dwellSeconds: 5 };

/** Run in small steps, as the worker does. */
function run(state: MoveState, seconds: number, step = 1, p = params, st = stations) {
  let s = state;
  const trail: MoveState[] = [];
  for (let t = 0; t < seconds; t += step) {
    s = advance(s, st, p, step);
    trail.push(s);
  }
  return { s, trail };
}

describe('initialState', () => {
  it('heads for the next station in the travel direction', () => {
    expect(initialState(stations, 500, 1)).toMatchObject({ distance: 500, direction: 1, nextIndex: 1 });
    expect(initialState(stations, 500, -1)).toMatchObject({ distance: 500, direction: -1, nextIndex: 0 });
    expect(initialState(stations, 1500, 1)).toMatchObject({ nextIndex: 2 });
  });

  it('when exactly on a station, heads for the one beyond it', () => {
    expect(initialState(stations, 1000, 1)).toMatchObject({ direction: 1, nextIndex: 2 });
    expect(initialState(stations, 1000, -1)).toMatchObject({ direction: -1, nextIndex: 0 });
  });

  it('turns around when placed at the end it is heading for, and clamps out-of-range distances', () => {
    expect(initialState(stations, 3000, 1)).toMatchObject({ direction: -1, nextIndex: 2 });
    expect(initialState(stations, 0, -1)).toMatchObject({ direction: 1, nextIndex: 1 });
    expect(initialState(stations, 9999, 1).distance).toBe(3000);
    expect(initialState(stations, -5, 1).distance).toBe(0);
  });

  it('tolerates a line with fewer than two stations', () => {
    expect(initialState([0], 0, 1)).toMatchObject({ distance: 0 });
    expect(advance(initialState([0], 0, 1), [0], params, 100).distance).toBe(0);
  });
});

describe('advance', () => {
  it('moves at the configured speed', () => {
    const s = advance(initialState(stations, 0, 1), stations, params, 30);
    expect(s.distance).toBeCloseTo(300, 6);
    expect(s.atStationIndex).toBeNull();
  });

  it('stops at a station for the dwell time, then continues', () => {
    let s = initialState(stations, 900, 1); // 100 m to station 1 = 10 s
    s = advance(s, stations, params, 10);
    expect(s).toMatchObject({ distance: 1000, atStationIndex: 1, dwellRemaining: 5, nextIndex: 2 });
    s = advance(s, stations, params, 3);
    expect(s).toMatchObject({ distance: 1000, atStationIndex: 1, dwellRemaining: 2 });
    s = advance(s, stations, params, 2); // dwell ends
    expect(s.atStationIndex).toBeNull();
    s = advance(s, stations, params, 10);
    expect(s.distance).toBeCloseTo(1100, 6);
  });

  it('carries leftover time across a station within one step', () => {
    // 100 m to the station (10 s), 5 s dwell, then 5 s of travel = 50 m past it.
    const s = advance(initialState(stations, 900, 1), stations, params, 20);
    expect(s.distance).toBeCloseTo(1050, 6);
    expect(s.atStationIndex).toBeNull();
  });

  it('a huge step is the same as many small ones', () => {
    const start = initialState(stations, 123, 1);
    const big = advance(start, stations, params, 400);
    const small = run(start, 400, 0.5).s;
    expect(big.distance).toBeCloseTo(small.distance, 3);
    expect(big.direction).toBe(small.direction);
    expect(big.nextIndex).toBe(small.nextIndex);
  });

  it('turns around at the last station and at the first', () => {
    let s = initialState(stations, 2900, 1);
    s = advance(s, stations, params, 10);
    expect(s).toMatchObject({ distance: 3000, atStationIndex: 3, direction: -1, nextIndex: 2 });
    s = advance(s, stations, params, 5 + 10);
    expect(s.distance).toBeCloseTo(2900, 6); // 5 s dwell, then 10 s back towards station 2
    // Drive to the first station and check the second turnaround.
    s = advance(s, stations, params, 400);
    const trail = run(s, 600, 1).trail;
    expect(trail.some((t) => t.atStationIndex === 0 && t.direction === 1)).toBe(true);
  });

  it('never leaves the line and always dwells at every station on a full loop', () => {
    let s = initialState(stations, 0, 1);
    const visits: number[] = [];
    let previous: number | null = null;
    for (let i = 0; i < 2000; i++) {
      s = advance(s, stations, params, 1);
      expect(s.distance).toBeGreaterThanOrEqual(0);
      expect(s.distance).toBeLessThanOrEqual(3000);
      if (s.atStationIndex !== null && s.atStationIndex !== previous) visits.push(s.atStationIndex);
      previous = s.atStationIndex;
    }
    // 0 → 3 → 0 → 3 ... visiting each station in order, turning only at the ends.
    expect(visits.slice(0, 7)).toEqual([1, 2, 3, 2, 1, 0, 1]);
  });

  it('with no dwell it passes straight through stations', () => {
    const s = advance(initialState(stations, 900, 1), stations, { speedMps: 10, dwellSeconds: 0 }, 20);
    expect(s.distance).toBeCloseTo(1100, 6);
    expect(s.atStationIndex).toBeNull();
  });

  it('does not move at zero speed or for a non-positive step', () => {
    const start = initialState(stations, 500, 1);
    expect(advance(start, stations, { speedMps: 0, dwellSeconds: 5 }, 100)).toEqual(start);
    expect(advance(start, stations, params, 0)).toEqual(start);
    expect(advance(start, stations, params, -3)).toEqual(start);
  });

  it('terminates when stations share a position and dwell is zero', () => {
    const coincident = [0, 0, 0, 100];
    const s = advance(initialState(coincident, 0, 1), coincident, { speedMps: 10, dwellSeconds: 0 }, 50);
    expect(Number.isFinite(s.distance)).toBe(true);
  });

  it('converts km/h to m/s', () => {
    expect(kmhToMps(36)).toBe(10);
    expect(kmhToMps(60)).toBeCloseTo(16.6667, 3);
  });
});
