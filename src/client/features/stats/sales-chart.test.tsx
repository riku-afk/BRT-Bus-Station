import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { DayStats } from '@shared/stats/models';
import { SalesChart } from './sales-chart';

const day = (date: string, ticketsSold: number, passengers: number, salesCentavos: number, ok = 0, refused = 0): DayStats => ({ date, ticketsSold, passengers, salesCentavos, scansAccepted: ok, scansRefused: refused });
const days = [day('2026-10-18', 1, 5, 24500, 1, 0), day('2026-10-19', 0, 0, 0), day('2026-10-20', 2, 3, 5100, 3, 1)];

afterEach(cleanup);

describe('SalesChart', () => {
  it('draws one bar per day, tallest for the most sales, from zero, with a bar for a day with nothing too', () => {
    render(<SalesChart days={days} />);
    const bars = screen.getAllByTestId('chart-bar');
    expect(bars).toHaveLength(3);
    expect(bars.map((b) => b.getAttribute('data-value'))).toEqual(['24500', '0', '5100']);
    const heights = bars.map((b) => parseFloat((b.firstElementChild as HTMLElement).style.height));
    expect(heights[0]).toBeGreaterThan(heights[2]!);
    expect(heights[1]).toBe(0);
    // The axis tops out at a tidy number above the maximum.
    expect(heights[0]).toBeCloseTo((24500 / 25000) * 100, 3);
  });

  it('names the measure and the peak for assistive technology, and every bar for the keyboard', () => {
    render(<SalesChart days={days} />);
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe('Sales per day for the last 3 days. Most: ₱245.00.');
    expect(screen.getByLabelText('Oct 20: ₱51.00')).toBeTruthy();
  });

  it('shows that day\'s numbers on hover or focus', () => {
    render(<SalesChart days={days} />);
    expect(screen.getByTestId('chart-readout').textContent).toMatch(/Hover or focus a bar/);
    fireEvent.mouseEnter(screen.getAllByTestId('chart-bar')[2]!);
    expect(screen.getByTestId('chart-readout').textContent).toContain('Oct 20');
    expect(screen.getByTestId('chart-readout').textContent).toContain('₱51.00');
    expect(screen.getByTestId('chart-readout').textContent).toContain('2 tickets');
    fireEvent.focus(screen.getAllByTestId('chart-bar')[0]!);
    expect(screen.getByTestId('chart-readout').textContent).toContain('₱245.00');
    expect(screen.getByTestId('chart-readout').textContent).toContain('1 ticket');
    fireEvent.mouseLeave(screen.getByRole('img'));
    expect(screen.getByTestId('chart-readout').textContent).toMatch(/Hover or focus/);
  });

  it('switches what is charted: tickets and passengers, each on its own scale', () => {
    render(<SalesChart days={days} />);
    fireEvent.click(screen.getByRole('button', { name: 'Passengers' }));
    expect(screen.getAllByTestId('chart-bar').map((b) => b.getAttribute('data-value'))).toEqual(['5', '0', '3']);
    expect(screen.getByRole('button', { name: 'Passengers' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Passengers per day');
    fireEvent.click(screen.getByRole('button', { name: 'Tickets sold' }));
    expect(screen.getAllByTestId('chart-bar').map((b) => b.getAttribute('data-value'))).toEqual(['1', '0', '2']);
  });

  it('has a table with every number as text, newest day first, and goes back to the chart', () => {
    render(<SalesChart days={days} />);
    fireEvent.click(screen.getByRole('button', { name: 'Show as table' }));
    expect(screen.queryByRole('img')).toBeNull();
    const rows = within(screen.getByTestId('stats-table')).getAllByRole('row').slice(1);
    expect(rows.map((r) => r.textContent)).toEqual(['Oct 2023₱51.003 / 1', 'Oct 1900₱0.000 / 0', 'Oct 1815₱245.001 / 0']);
    fireEvent.click(screen.getByRole('button', { name: 'Show as chart' }));
    expect(screen.getByRole('img')).toBeTruthy();
  });

  it('does not fall over when there are no sales at all', () => {
    render(<SalesChart days={[day('2026-10-19', 0, 0, 0), day('2026-10-20', 0, 0, 0)]} />);
    expect(screen.getAllByTestId('chart-bar')).toHaveLength(2);
    expect(screen.getByRole('img').getAttribute('aria-label')).toContain('Most: ₱0.00');
  });
});
