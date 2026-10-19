/** One page of a long list. Browser-safe: the API returns it and the lists on the admin pages read it. */
export type Page<T> = { items: T[]; page: number; pageSize: number; total: number; totalPages: number };

/** Admin lists show this many rows at a time. */
export const ADMIN_PAGE_SIZE = 10;
/** A konduktor's scan history shows this many scans at a time (a phone screen). */
export const HISTORY_PAGE_SIZE = 5;
/** The most rows a client may ask for at once, so no request can pull a whole table. */
export const MAX_PAGE_SIZE = 50;

export const totalPagesOf = (total: number, pageSize: number) => Math.max(1, Math.ceil(total / pageSize));

/** Clamp a requested page into range: past the end (rows were deleted meanwhile) is the last page, never an empty one. */
export const clampPage = (page: number, total: number, pageSize: number) => Math.min(Math.max(1, page), totalPagesOf(total, pageSize));

export const offsetOf = (page: number, pageSize: number) => (page - 1) * pageSize;

export function toPage<T>(items: T[], total: number, page: number, pageSize: number): Page<T> {
  return { items, page, pageSize, total, totalPages: totalPagesOf(total, pageSize) };
}

/** "11 to 20 of 83" for a page; "0 results" when empty. */
export function describeRange(page: number, pageSize: number, total: number, shown: number): string {
  if (total === 0 || shown === 0) return '0 results';
  const first = offsetOf(page, pageSize) + 1;
  return `${first} to ${first + shown - 1} of ${total}`;
}
