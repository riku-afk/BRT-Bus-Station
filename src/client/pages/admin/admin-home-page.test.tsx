import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { AdminStats, DayStats } from '@shared/stats/models';
import { AdminHomePage } from './admin-home-page';

const day = (date: string, ticketsSold: number, passengers: number, salesCentavos: number, ok = 0, refused = 0): DayStats => ({ date, ticketsSold, passengers, salesCentavos, scansAccepted: ok, scansRefused: refused });

const stats = (days: number, overrides: Partial<AdminStats> = {}): AdminStats => {
  const series = Array.from({ length: days }, (_, i) => day(new Date(Date.UTC(2026, 9, 20 - (days - 1 - i))).toISOString().slice(0, 10), 0, 0, 0));
  series[series.length - 1] = day('2026-10-20', 4, 9, 18900, 6, 2);
  series[series.length - 2] = day('2026-10-19', 1, 1, 1700);
  return {
    days: series,
    today: series[series.length - 1]!,
    totals: { ticketsSold: 5, passengers: 10, salesCentavos: 20600, scansAccepted: 6, scansRefused: 2 },
    byStatus: { pending_payment: 1, paid: 2, used: 3, expired: 0, cancelled: 1 },
    topRoutes: [
      { originName: 'Bus Shelter S3', destinationName: 'Bus Shelter S20', tickets: 3, passengers: 7, salesCentavos: 14700 },
      { originName: 'Bus Shelter S1', destinationName: 'Bus Shelter S2', tickets: 2, passengers: 3, salesCentavos: 5900 },
    ],
    paymentsNeedingReview: 0,
    ...overrides,
  };
};

const requested: string[] = [];
function fakeApi(over: Partial<AdminStats> = {}) {
  requested.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      requested.push(url);
      if (url === '/api/auth/me') return new Response(JSON.stringify({ success: true, data: { id: 'a', email: 'admin@t.test', fullName: 'Ana Admin', role: 'admin' }, timestamp: '' }));
      const days = Number(new URL(url, 'http://x').searchParams.get('days') ?? 14);
      return new Response(JSON.stringify({ success: true, data: stats(days, over), timestamp: '' }));
    }),
  );
}
const view = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <AdminHomePage />
      </MemoryRouter>
    </QueryClientProvider>,
  );

beforeEach(() => fakeApi());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the admin dashboard', () => {
  it('opens with today\'s sales, tickets, passengers and scans, and the totals for the period', async () => {
    view();
    expect((await screen.findByTestId('tile-sales')).textContent).toBe('₱189.00');
    expect(screen.getByTestId('tile-tickets').textContent).toBe('4');
    expect(screen.getByTestId('tile-passengers').textContent).toBe('9');
    expect(screen.getByTestId('tile-scans').textContent).toBe('6');
    expect(screen.getByText('accepted')).toBeTruthy();
    expect(screen.getByText('2 refused')).toBeTruthy();
    expect(screen.getByText('₱206.00 in last 14 days')).toBeTruthy();
    expect(requested).toContain('/api/admin/stats?days=14');
  });

  it('charts the days, and asks again for 7 or 30 when the window is changed', async () => {
    view();
    await screen.findByTestId('tile-sales');
    expect(screen.getAllByTestId('chart-bar')).toHaveLength(14);
    fireEvent.click(screen.getByRole('button', { name: '30 days' }));
    await waitFor(() => expect(screen.getAllByTestId('chart-bar')).toHaveLength(30));
    expect(requested).toContain('/api/admin/stats?days=30');
    fireEvent.click(screen.getByRole('button', { name: '7 days' }));
    await waitFor(() => expect(screen.getAllByTestId('chart-bar')).toHaveLength(7));
    expect(screen.getByRole('button', { name: '7 days' }).getAttribute('aria-pressed')).toBe('true');
  });

  it('says where tickets ended up, and the busiest trips', async () => {
    view();
    await screen.findByTestId('tile-sales');
    expect(screen.getByTestId('status-paid').textContent).toBe('2');
    expect(screen.getByTestId('status-used').textContent).toBe('3');
    expect(screen.getByTestId('status-cancelled').textContent).toBe('1');
    const rows = within(screen.getByTestId('top-routes')).getAllByRole('row').slice(1);
    // rank badge, the trip, the share bar (no text), tickets, sales
    expect(rows[0]!.textContent).toBe('1Bus Shelter S3Bus Shelter S203₱147.00');
    expect(rows).toHaveLength(2);
  });

  it('warns, with a link to the payments page, when payments are waiting for an admin; says nothing otherwise', async () => {
    const { unmount } = view();
    await screen.findByTestId('tile-sales');
    expect(screen.queryByTestId('review-alert')).toBeNull();
    unmount();
    fakeApi({ paymentsNeedingReview: 2 });
    view();
    const alert = await screen.findByTestId('review-alert');
    expect(alert.textContent).toContain('2 payments could not be applied to a ticket and need a look.');
    expect(alert.getAttribute('href')).toBe('/admin/payments');
  });

  it('says so when there are no tickets in the period, and still shows the management links', async () => {
    cleanup();
    fakeApi({ byStatus: { pending_payment: 0, paid: 0, used: 0, expired: 0, cancelled: 0 }, topRoutes: [] });
    view();
    expect(await screen.findByText('No tickets in this period.')).toBeTruthy();
    expect(screen.getByText('No paid tickets in this period.')).toBeTruthy();
    for (const name of ['Live map', 'Stations', 'Buses', 'Konduktors', 'Payments', 'Scans', 'Fares']) expect(screen.getByRole('link', { name: new RegExp(name) })).toBeTruthy();
  });

  it('shows no passenger names or emails', async () => {
    view();
    await screen.findByTestId('tile-sales');
    expect(document.body.textContent).not.toMatch(/pax@|passenger1/i);
  });
});
