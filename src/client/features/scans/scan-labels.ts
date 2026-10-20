import type { ScanHistoryEntry, ScanResult } from '@shared/scans/models';
import { scanMessage } from '@shared/scans/models';

export const RESULT_LABEL: Record<ScanResult, string> = {
  valid: 'Valid',
  already_used: 'Already used',
  expired: 'Expired',
  invalid: 'Not valid',
};

export const RESULT_STYLE: Record<ScanResult, string> = {
  valid: 'bg-[#dcfce7] text-[#166534] dark:bg-[#16a34a]/20 dark:text-[#86efac]',
  already_used: 'bg-[#fef3c7] text-[#92400e] dark:bg-[#d97706]/20 dark:text-[#fcd34d]',
  expired: 'bg-surface-2 text-muted-foreground',
  invalid: 'bg-[#ffe4e6] text-[#9f1239] dark:bg-[#e11d48]/20 dark:text-[#fda4af]',
};

/** The solid tile colour for a result (a row's status tile). */
export const RESULT_TILE: Record<ScanResult, string> = {
  valid: '#16a34a',
  already_used: '#d97706',
  expired: '#94a3b8',
  invalid: '#e11d48',
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
