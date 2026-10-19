import { describe, expect, it } from 'vitest';
import type { MoveParams } from './movement';
import { runProgress, startTrip, stepTrip, type TripRun } from './trip';

// Stations 1000 m apart: 0, 1000, 2000, 3000, 4000. 10 m/s, 5 s dwell.
const stations = [0, 1000, 2000, 3000, 4000];
const params: MoveParams = { speedMps: 10, dwellSeconds: 5 };

function runToEnd(run: TripRun, p = params, step = 1, maxSeconds = 2000) {
  let current = run;
  const frames: { run: TripRun; seconds: number }[] = [];
  for (let t = 0; t < maxSeconds; t += step) {
    const next = stepTrip(current, p, step);
    current = next.run;
    frames.push({ run: current, seconds: t + step });
    if (next.finished) return { finishedAt: t + step, run: current, frames };
  }
  return { finishedAt: null, run: current, frames };
}

describe('startTrip', () => {
  it('starts at the origin, dwelling, ready to head for the destination (forward)', () => {
    const run = startTrip(stations, 1, 3, 5);
    expect(run.dir).toBe(1);
    expect(run.span).toEqual([1000, 3000]);
    expect(run.state).toMatchObject({ distance: 1000, dwellRemaining: 5, atStationIndex: 0 });
    expect(run.arrived).toBe(false);
  });

  it('works against the direction of the line too', () => {
    const run = startTrip(stations, 3, 1, 5);
    expect(run.dir).toBe(-1);
    expect(run.span).toEqual([1000, 3000]);
    expect(run.state).toMatchObject({ distance: 3000, atStationIndex: 1 });
  });

  it('does not dwell at the origin when the dwell time is zero', () => {
    expect(startTrip(stations, 0, 2, 0).state.atStationIndex).toBeNull();
  });
});

describe('stepTrip', () => {
  it('waits at the origin, then drives non-stop, dwells at the destination, and finishes', () => {
    // 5 s dwell, 2000 m at 10 m/s = 200 s, 5 s dwell at the destination.
    const { finishedAt, frames } = runToEnd(startTrip(stations, 1, 3, 5));
    expect(finishedAt).toBeGreaterThanOrEqual(209);
    expect(finishedAt).toBeLessThanOrEqual(211);

    // Dwelling at the origin first: not moving.
    expect(frames[2]!.run.state.distance).toBe(1000);
    expect(frames[2]!.run.state.atStationIndex).toBe(0);
    // Express: it never stops at the stations in between (2000 m).
    const stopsBetween = frames.filter((f) => f.run.state.atStationIndex !== null && f.run.state.distance > 1000 && f.run.state.distance < 3000);
    expect(stopsBetween).toHaveLength(0);
    // Dwelling at the destination just before finishing.
    const beforeEnd = frames[frames.length - 2]!.run.state;
    expect(beforeEnd.distance).toBe(3000);
    expect(beforeEnd.atStationIndex).toBe(1);
  });

  it('runs backwards along the line and never leaves the span', () => {
    const { finishedAt, frames } = runToEnd(startTrip(stations, 4, 2, 5));
    expect(finishedAt).not.toBeNull();
    for (const f of frames) {
      expect(f.run.state.distance).toBeGreaterThanOrEqual(2000);
      expect(f.run.state.distance).toBeLessThanOrEqual(4000);
    }
    // Distance only ever decreases while en route.
    const moving = frames.filter((f) => f.run.state.atStationIndex === null).map((f) => f.run.state.distance);
    for (let i = 1; i < moving.length; i++) expect(moving[i]).toBeLessThanOrEqual(moving[i - 1]!);
  });

  it('is not finished until the dwell at the destination is over', () => {
    let run = startTrip(stations, 0, 1, 0); // no origin dwell, 100 s to go
    let result = stepTrip(run, params, 99);
    expect(result.finished).toBe(false);
    result = stepTrip(result.run, params, 2); // arrives, starts dwelling
    expect(result.run.arrived).toBe(true);
    expect(result.finished).toBe(false);
    run = result.run;
    result = stepTrip(run, params, 5); // dwell over
    expect(result.finished).toBe(true);
  });

  it('finishes straight away on arrival when the dwell is zero', () => {
    const zero: MoveParams = { speedMps: 10, dwellSeconds: 0 };
    const { finishedAt } = runToEnd(startTrip(stations, 0, 1, 0), zero);
    expect(finishedAt).toBe(100);
  });

  it('a huge step still finishes the trip', () => {
    const result = stepTrip(startTrip(stations, 0, 4, 5), params, 10_000);
    expect(result.finished).toBe(true);
  });

  it('does not move at zero speed', () => {
    const run = startTrip(stations, 0, 2, 0);
    const result = stepTrip(run, { speedMps: 0, dwellSeconds: 0 }, 100);
    expect(result.run.state.distance).toBe(0);
    expect(result.finished).toBe(false);
  });
});

describe('runProgress', () => {
  it('reports how far along a run is, in either direction, clamped to 0–1', () => {
    expect(runProgress(1500, 1000, 3000)).toBe(0.25);
    expect(runProgress(2500, 3000, 1000)).toBe(0.25);
    expect(runProgress(0, 1000, 3000)).toBe(0);
    expect(runProgress(9999, 1000, 3000)).toBe(1);
    expect(runProgress(5, 100, 100)).toBe(1);
  });
});
