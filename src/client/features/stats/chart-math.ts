import { formatPeso } from '@shared/money';

/** The smallest "round" number (1, 2, 2.5, 5 times a power of ten) that is at least `value`: a tidy top for an axis. */
export function niceCeil(value: number): number {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * power >= value) return step * power;
  return 10 * power;
}

/** Axis labels for a bar chart: 0, half and the top. */
export function axisTicks(max: number): number[] {
  const top = niceCeil(max);
  return [0, top / 2, top];
}

/** "Oct 20" from a `YYYY-MM-DD` Manila date. */
export function shortDate(key: string): string {
  return new Intl.DateTimeFormat('en-PH', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric' }).format(new Date(`${key}T12:00:00+08:00`));
}

export const METRICS = {
  sales: { label: 'Sales', unit: '₱', format: (v: number) => formatPeso(v), axis: (v: number) => `₱${Math.round(v / 100).toLocaleString('en-PH')}` },
  tickets: { label: 'Tickets sold', unit: '', format: (v: number) => String(v), axis: (v: number) => String(v) },
  passengers: { label: 'Passengers', unit: '', format: (v: number) => String(v), axis: (v: number) => String(v) },
} as const;
export type MetricKey = keyof typeof METRICS;
