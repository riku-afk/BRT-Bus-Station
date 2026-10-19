import type { ScanHistoryEntry, ScanResult } from '@shared/scans/models';
import { scanMessage } from '@shared/scans/models';

export const RESULT_LABEL: Record<ScanResult, string> = {
  valid: 'Valid',
  already_used: 'Already used',
  expired: 'Expired',
  invalid: 'Not valid',
};

export const RESULT_STYLE: Record<ScanResult, string> = {
  valid: 'bg-success/15 text-success',
  already_used: 'bg-warning/20 text-warning',
  expired: 'bg-muted text-muted-foreground',
  invalid: 'bg-destructive/15 text-destructive',
};

/** One line describing a past scan, from what is stored. */
export function describeScan(entry: Pick<ScanHistoryEntry, 'result' | 'reason'>): string {
  return scanMessage(entry.result, entry.reason);
}

/** `YYYY-MM-DD` (Manila) as a heading, e.g. "Friday, October 16, 2026". */
export function formatDayHeading(key: string): string {
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(
    new Date(`${key}T12:00:00+08:00`),
  );
}
