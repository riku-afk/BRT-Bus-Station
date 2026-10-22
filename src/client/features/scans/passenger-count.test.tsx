import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { RideSummary } from '@shared/scans/models';
import { PassengerCount } from './passenger-count';

const calls: { method: string; url: string }[] = [];

function fakeApi(initial: RideSummary) {
  calls.length = 0;
  let current = initial;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, url });
      const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data, timestamp: '' }), { status: 200 });
      if (url === '/api/scans/ride/complete' && method === 'POST') {
        const done = { passengers: current.passengers, tickets: current.tickets, completedAt: '2026-10-20T03:00:00.000Z' };
        current = { passengers: 0, tickets: 0, since: done.completedAt, atShelter: current.atShelter, canComplete: false, mustCompleteBeforeDispatch: false, unfinishedPassengers: 0 };
        return ok(done);
      }
      if (url === '/api/scans/ride') return ok(current);
      return ok({});
    }),
  );
}

const ride = (over: Partial<RideSummary> = {}): RideSummary => ({ passengers: 7, tickets: 3, since: null, atShelter: 'Bus Shelter S3', canComplete: true, mustCompleteBeforeDispatch: false, unfinishedPassengers: 0, ...over });

const view = (compact = false) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PassengerCount compact={compact} />
    </QueryClientProvider>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the passenger count', () => {
  it('shows how many passengers are on board and from how many tickets', async () => {
    fakeApi(ride());
    view();
    expect((await screen.findByTestId('passenger-total')).textContent).toBe('7');
    expect(screen.getByText(/from 3 tickets/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Complete ride/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('says since when, once a ride has been completed', async () => {
    fakeApi(ride({ passengers: 2, tickets: 1, since: '2026-10-20T01:30:00.000Z' }));
    view();
    expect(await screen.findByText(/from 1 ticket · since 9:30 AM/)).toBeTruthy();
  });

  it('cannot complete the ride while the bus is on the road, and says when it can', async () => {
    fakeApi(ride({ atShelter: null, canComplete: false }));
    view();
    await screen.findByTestId('passenger-total');
    expect((screen.getByRole('button', { name: /Complete ride/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('You can complete the ride when your bus arrives.')).toBeTruthy();
  });

  it('cannot complete a ride with nobody on board', async () => {
    fakeApi(ride({ passengers: 0, tickets: 0, canComplete: false }));
    view();
    await screen.findByTestId('passenger-total');
    expect((screen.getByRole('button', { name: /Complete ride/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Scan tickets to start counting.')).toBeTruthy();
  });

  it('asks first, then completes the ride, and the count goes back to zero', async () => {
    fakeApi(ride());
    view();
    await screen.findByTestId('passenger-total');
    fireEvent.click(screen.getByRole('button', { name: /Complete ride/ }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/7 passengers will be cleared/)).toBeTruthy();
    expect(calls.some((c) => c.method === 'POST')).toBe(false); // nothing is sent until they confirm
    fireEvent.click(within(dialog).getByRole('button', { name: 'Complete ride' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/api/scans/ride/complete')).toBe(true));
    await waitFor(() => expect(screen.getByTestId('passenger-total').textContent).toBe('0'));
    expect((screen.getByRole('button', { name: /Complete ride/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('keeps the count when they change their mind', async () => {
    fakeApi(ride());
    view(true);
    await screen.findByTestId('passenger-total');
    fireEvent.click(screen.getByRole('button', { name: /Complete ride/ }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /Cancel|Not yet|Keep/i }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    expect(screen.getByTestId('passenger-total').textContent).toBe('7');
  });
});
