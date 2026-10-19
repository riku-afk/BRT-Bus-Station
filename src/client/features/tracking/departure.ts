import { formatManilaTime, manilaDateKey } from '@shared/datetime/ph-time';

/**
 * How a parked bus's expected departure reads to a passenger. The time is what the konduktor entered, not a computed
 * estimate (arrival ETAs for buses on the road come later).
 */
export function describeDeparture(expectedIso: string | null, now: number = Date.now()): { text: string; set: boolean } {
  if (!expectedIso) return { text: 'No departure time set yet', set: false };
  const at = new Date(expectedIso).getTime();
  if (at <= now) return { text: 'Departing any moment', set: true };
  const minutes = Math.ceil((at - now) / 60_000);
  return { text: `Departs about ${formatManilaTime(expectedIso)} (in ${minutes} min)`, set: true };
}

/** The longest ahead a departure can be set (the server's limit, in minutes). */
export const MAX_DEPARTURE_MINUTES = 480;

/**
 * Turn a clock time the konduktor typed ("14:35", Manila time, today) into "minutes from now" for the API.
 * Rounded up, so the stored time never shows a minute earlier than the one typed. Returns an error message the
 * konduktor can act on instead of a number when the time cannot be used.
 */
export function minutesUntilManilaTime(hhmm: string, now: number = Date.now()): { minutes: number } | { error: string } {
  if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(hhmm)) return { error: 'Pick a time first' };
  const target = Date.parse(manilaDateKey(new Date(now)) + 'T' + hhmm + ':00+08:00');
  const minutes = Math.ceil((target - now) / 60_000);
  if (minutes < 1) return { error: 'That time has already passed. Pick a later time today.' };
  if (minutes > MAX_DEPARTURE_MINUTES) return { error: 'Pick a time within the next 8 hours.' };
  return { minutes };
}

/** Whether a departure time the konduktor gave has already passed (the bus is due to leave any moment). */
export function departureHasPassed(expectedIso: string | null, now: number = Date.now()): boolean {
  return expectedIso !== null && new Date(expectedIso).getTime() <= now;
}
