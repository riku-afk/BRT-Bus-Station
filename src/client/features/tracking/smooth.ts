/**
 * Smooth bus movement (TRK-05). Positions arrive about once a second; instead of jumping, each marker glides from
 * where it is drawn to the new position over roughly one update interval. Pure functions so the maths is testable;
 * the map runs them from a requestAnimationFrame loop.
 */
import { haversineMeters, type LatLng } from '@shared/geo/route';

export type Tween = { from: LatLng; to: LatLng; startedAt: number; duration: number };

/** A jump this large is a reset or a reconnect, not driving: snap instead of gliding across the map. */
export const SNAP_DISTANCE_METERS = 1500;
const MIN_DURATION_MS = 400;
const MAX_DURATION_MS = 2500;
const DEFAULT_DURATION_MS = 1000;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

export function positionAt(tween: Tween, now: number): LatLng {
  const t = tween.duration <= 0 ? 1 : clamp((now - tween.startedAt) / tween.duration, 0, 1);
  return {
    latitude: tween.from.latitude + (tween.to.latitude - tween.from.latitude) * t,
    longitude: tween.from.longitude + (tween.to.longitude - tween.from.longitude) * t,
  };
}

/**
 * Start gliding from `displayed` (where the marker is drawn right now) to `target`.
 * `lastUpdateAt` is when the previous update arrived: the glide lasts about one update interval so the marker
 * reaches the new position just as the next one lands.
 */
export function nextTween(displayed: LatLng, target: LatLng, lastUpdateAt: number | null, now: number): Tween {
  if (haversineMeters(displayed, target) > SNAP_DISTANCE_METERS) {
    return { from: target, to: target, startedAt: now, duration: 0 };
  }
  const interval = lastUpdateAt === null ? DEFAULT_DURATION_MS : now - lastUpdateAt;
  return { from: displayed, to: target, startedAt: now, duration: clamp(interval, MIN_DURATION_MS, MAX_DURATION_MS) };
}
