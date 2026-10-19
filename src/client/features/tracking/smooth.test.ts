import { describe, expect, it } from 'vitest';
import { nextTween, positionAt, SNAP_DISTANCE_METERS } from './smooth';

const a = { latitude: 14.0, longitude: 121.0 };
const b = { latitude: 14.001, longitude: 121.001 }; // ~157 m away

describe('smooth bus movement', () => {
  it('glides linearly from the drawn position to the new one', () => {
    const tween = nextTween(a, b, 1000, 2000); // updates are 1000 ms apart
    expect(tween.duration).toBe(1000);
    expect(positionAt(tween, 2000)).toEqual(a);
    expect(positionAt(tween, 2500).latitude).toBeCloseTo(14.0005, 6);
    expect(positionAt(tween, 3000)).toEqual(b);
  });

  it('holds at the target once the glide is over, and never starts before it begins', () => {
    const tween = nextTween(a, b, 0, 1000);
    expect(positionAt(tween, 5000)).toEqual(b);
    expect(positionAt(tween, 0)).toEqual(a);
  });

  it('matches the glide to the update interval, within sensible bounds', () => {
    expect(nextTween(a, b, null, 100).duration).toBe(1000); // first update: assume 1 s
    expect(nextTween(a, b, 0, 50).duration).toBe(400); // a burst of updates must not make it jerky
    expect(nextTween(a, b, 0, 60_000).duration).toBe(2500); // a long gap must not make it crawl
  });

  it('starts from where the marker is drawn, so a new update mid-glide never jumps back', () => {
    const first = nextTween(a, b, 0, 1000);
    const midway = positionAt(first, 1500);
    const c = { latitude: 14.002, longitude: 121.002 };
    const second = nextTween(midway, c, 1000, 2000);
    expect(second.from).toEqual(midway);
    expect(positionAt(second, 2000)).toEqual(midway);
  });

  it('snaps instead of gliding across the map after a reset or a long disconnect', () => {
    const far = { latitude: 14.05, longitude: 121.0 }; // ~5.5 km
    const tween = nextTween(a, far, 0, 1000);
    expect(tween.duration).toBe(0);
    expect(positionAt(tween, 1000)).toEqual(far);
    expect(SNAP_DISTANCE_METERS).toBeGreaterThan(500);
  });

  it('does not snap for ordinary movement even at high simulated speeds', () => {
    // 150 km/h for 1 s ≈ 42 m.
    const near = { latitude: 14.0004, longitude: 121.0 };
    expect(nextTween(a, near, 0, 1000).duration).toBeGreaterThan(0);
  });
});
