import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { DayStats } from '@shared/stats/models';
import { axisTicks, METRICS, shortDate, type MetricKey } from './chart-math';

const VALUE: Record<MetricKey, (d: DayStats) => number> = {
  sales: (d) => d.salesCentavos,
  tickets: (d) => d.ticketsSold,
  passengers: (d) => d.passengers,
};

/**
 * One measure per day as thin bars, on one axis, from zero. A single series, so no legend: the selector above names it. Hover or
 * focus a bar for that day's numbers; "Show as table" gives every number as text (the chart is never the only way to read them).
 */
export function SalesChart({ days }: { days: readonly DayStats[] }) {
  const [metric, setMetric] = useState<MetricKey>('sales');
  const [table, setTable] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  const pick = VALUE[metric];
  const max = Math.max(0, ...days.map(pick));
  const ticks = axisTicks(max);
  const top = ticks[2]!;
  const shown = active !== null ? days[active] : undefined;

  return (
    <div className="flex flex-col gap-3" data-testid="sales-chart">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="group" aria-label="What to chart" className="flex gap-1 rounded-xl bg-surface-2 p-1">
          {(Object.keys(METRICS) as MetricKey[]).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={metric === key}
              onClick={() => setMetric(key)}
              className={cn('h-8 rounded-[9px] px-3 text-xs font-bold transition-colors', metric === key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
            >
              {METRICS[key].label}
            </button>
          ))}
        </div>
        <button type="button" onClick={() => setTable((t) => !t)} aria-pressed={table} className="text-xs font-semibold text-[#4f46e5] underline-offset-2 hover:underline dark:text-[#a5b4fc]">
          {table ? 'Show as chart' : 'Show as table'}
        </button>
      </div>

      {table ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="stats-table">
            <thead>
              <tr className="border-b text-left text-xs text-muted-foreground">
                <th className="py-1.5 pr-3 font-medium">Day</th>
                <th className="py-1.5 pr-3 text-right font-medium">Tickets</th>
                <th className="py-1.5 pr-3 text-right font-medium">Passengers</th>
                <th className="py-1.5 pr-3 text-right font-medium">Sales</th>
                <th className="py-1.5 text-right font-medium">Scans (ok / refused)</th>
              </tr>
            </thead>
            <tbody>
              {[...days].reverse().map((d) => (
                <tr key={d.date} className="border-b last:border-0">
                  <td className="py-1.5 pr-3">{shortDate(d.date)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{d.ticketsSold}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{d.passengers}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{METRICS.sales.format(d.salesCentavos)}</td>
                  <td className="py-1.5 text-right tabular-nums">
                    {d.scansAccepted} / {d.scansRefused}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative">
          <div className="min-h-9 text-sm" aria-live="polite" data-testid="chart-readout">
            {shown ? (
              <span>
                <strong>{shortDate(shown.date)}</strong> · {METRICS[metric].label}: <strong>{METRICS[metric].format(pick(shown))}</strong>
                {metric === 'sales' ? ` · ${shown.ticketsSold} ticket${shown.ticketsSold === 1 ? '' : 's'}` : ''}
              </span>
            ) : (
              <span className="text-muted-foreground">Hover or focus a bar for that day.</span>
            )}
          </div>
          <div className="flex gap-2">
            {/* The axis: 0, half, top. Recessive: the labels only, with faint guide lines behind the bars. */}
            <div className="flex h-44 w-12 shrink-0 flex-col justify-between text-right text-[11px] text-muted-foreground tabular-nums" aria-hidden>
              {[...ticks].reverse().map((t) => (
                <span key={t}>{METRICS[metric].axis(t)}</span>
              ))}
            </div>
            <div
              role="img"
              aria-label={`${METRICS[metric].label} per day for the last ${days.length} days. Most: ${METRICS[metric].format(max)}.`}
              className="relative h-44 flex-1 border-b"
              onMouseLeave={() => setActive(null)}
            >
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between" aria-hidden>
                <div className="border-t border-border/60" />
                <div className="border-t border-border/60" />
                <div />
              </div>
              <div className="absolute inset-0 flex items-end gap-[3px]">
                {days.map((d, i) => {
                  const value = pick(d);
                  const height = top === 0 ? 0 : (value / top) * 100;
                  return (
                    <div
                      key={d.date}
                      tabIndex={0}
                      data-testid="chart-bar"
                      data-value={value}
                      aria-label={`${shortDate(d.date)}: ${METRICS[metric].format(value)}`}
                      className="group flex h-full flex-1 items-end justify-center rounded-md outline-none focus-visible:bg-surface-2"
                      onMouseEnter={() => setActive(i)}
                      onFocus={() => setActive(i)}
                      onBlur={() => setActive(null)}
                    >
                      <div
                        className={cn('w-full max-w-10 rounded-t-lg rounded-b-[3px] transition-[opacity,filter] group-hover:brightness-110', active !== null && active !== i && 'opacity-45')}
                        style={{ height: `${Math.max(height, 0)}%`, minHeight: 4, background: i === days.length - 1 ? '#f59e0b' : '#6366f1' }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="ml-14 mt-1 flex justify-between text-[11px] text-muted-foreground" aria-hidden>
            <span>{shortDate(days[0]!.date)}</span>
            <span>{shortDate(days[days.length - 1]!.date)}</span>
          </div>
        </div>
      )}
      <div className="flex gap-[18px] text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-[#6366f1]" />
          Earlier days
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-[3px] bg-[#f59e0b]" />
          Today
        </span>
      </div>
    </div>
  );
}
