/** Times are stored in UTC and shown in Asia/Manila (GEN-02). Browser-safe. */
export const MANILA_TZ = 'Asia/Manila';

/** Manila has no daylight saving: it is always UTC+8. */
const MANILA_OFFSET_MS = 8 * 3600_000;
const DAY_MS = 24 * 3600_000;

const time = new Intl.DateTimeFormat('en-PH', { timeZone: MANILA_TZ, hour: 'numeric', minute: '2-digit', hour12: true });
const dateTime = new Intl.DateTimeFormat('en-PH', { timeZone: MANILA_TZ, month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

/** "9:45 AM" in Manila time, from an ISO string or a Date. */
export function formatManilaTime(value: string | Date): string {
  return time.format(typeof value === 'string' ? new Date(value) : value).toUpperCase();
}

/** "Oct 16, 9:45 AM" in Manila time. */
export function formatManilaDateTime(value: string | Date): string {
  return dateTime.format(typeof value === 'string' ? new Date(value) : value).replace(/\bam\b|\bpm\b/i, (m) => m.toUpperCase());
}

/** The Manila calendar day of an instant, as `YYYY-MM-DD`. Used to group a konduktor's scans by day. */
export function manilaDateKey(value: string | Date): string {
  const at = typeof value === 'string' ? new Date(value) : value;
  return new Date(at.getTime() + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

/** 23:59:59 on the Manila calendar day that contains `at` (TKT-04: a ticket is valid until the end of its purchase day). */
export function endOfManilaDay(at: Date): Date {
  const manilaDayStart = Math.floor((at.getTime() + MANILA_OFFSET_MS) / DAY_MS) * DAY_MS;
  return new Date(manilaDayStart + DAY_MS - 1000 - MANILA_OFFSET_MS);
}
