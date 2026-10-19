import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Ticket } from '@/features/tickets/use-tickets';
import { TicketPage } from './ticket-page';

const ticket = (overrides: Partial<Ticket> = {}): Ticket => ({
  id: 't-1',
  referenceCode: 'BRT-ABC234',
  originStationId: 'a',
  originName: 'Bus Shelter S3',
  destinationStationId: 'b',
  destinationName: 'Bus Shelter S12',
  fareCentavos: 3500,
  quantity: 1,
  status: 'pending_payment',
  validUntil: '2026-10-16T15:59:59.000Z',
  paidAt: null,
  usedAt: null,
  createdAt: '2026-10-16T02:00:00.000Z',
  busId: null,
  busName: null,
  payBeforeAt: new Date(Date.now() + 14 * 60_000).toISOString(),
  ...overrides,
});

/** A fake API: GET /tickets/t-1 returns whatever `current.ticket` is. Every request is recorded. */
function fakeApi(current: { ticket: Ticket }) {
  const calls: { method: string; url: string }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', url });
      return new Response(JSON.stringify({ success: true, data: current.ticket, timestamp: new Date().toISOString() }), { status: 200 });
    }),
  );
  return calls;
}

function renderPage(path: string | string[]) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={Array.isArray(path) ? path : [path]} initialIndex={Array.isArray(path) ? path.length - 1 : 0}>
        <Routes>
          <Route path="/" element={<p>PREVIOUS PAGE</p>} />
          <Route path="/tickets" element={<p>MY TICKETS</p>} />
          <Route path="/tickets/:id" element={<TicketPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }));
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('TicketPage (the return page)', () => {
  it('waits while the payment is unconfirmed, then shows paid once the server says so', async () => {
    const current = { ticket: ticket() };
    fakeApi(current);
    renderPage('/tickets/t-1?return=1');

    expect(await screen.findByText('Confirming your payment…')).toBeTruthy();
    expect(screen.queryByText(/Payment received/)).toBeNull();

    // The webhook lands on the server; the page's next poll picks it up.
    current.ticket = ticket({ status: 'paid', paidAt: '2026-10-16T02:01:00.000Z', payBeforeAt: null });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(await screen.findByText(/Payment received/)).toBeTruthy();
    expect(screen.queryByText('Confirming your payment…')).toBeNull();
    expect(screen.getByText('BRT-ABC234')).toBeTruthy();
  });

  it('only ever READS the ticket: it never sends anything that could mark it paid (PAY-03)', async () => {
    const current = { ticket: ticket() };
    const calls = fakeApi(current);
    renderPage('/tickets/t-1?return=1');
    await screen.findByText('Confirming your payment…');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000); // several polls
    });
    expect(calls.length).toBeGreaterThan(2);
    // Only reads: the ticket and its payment status. Nothing here can mark anything paid.
    expect(calls.every((c) => c.method === 'GET' && c.url.startsWith('/api/tickets/t-1'))).toBe(true);
  });

  it('stops polling once the ticket is paid', async () => {
    const current = { ticket: ticket({ status: 'paid', paidAt: '2026-10-16T02:01:00.000Z', payBeforeAt: null }) };
    const calls = fakeApi(current);
    renderPage('/tickets/t-1?return=1');
    await screen.findByText(/Payment received/);
    const after = calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(6000);
    });
    expect(calls.length).toBe(after);
  });

  it('offers a way out if the confirmation takes too long', async () => {
    fakeApi({ ticket: ticket() });
    renderPage('/tickets/t-1?return=1');
    await screen.findByText('Confirming your payment…');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50_000);
    });
    expect(await screen.findByText(/Still waiting for the payment confirmation/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Pay again' })).toBeTruthy();
  });

  it('after a failed payment it says so, does not wait for a confirmation, and offers to try again', async () => {
    const calls = fakeApi({ ticket: ticket() });
    renderPage('/tickets/t-1?failed=1');
    expect(await screen.findByText('The payment did not go through.')).toBeTruthy();
    expect(screen.queryByText('Confirming your payment…')).toBeNull();
    expect(screen.getByRole('button', { name: 'Pay again' })).toBeTruthy();
    expect(calls.every((c) => c.method === 'GET')).toBe(true);
  });

  it('an unpaid ticket opened normally offers Pay now, Cancel and a countdown', async () => {
    fakeApi({ ticket: ticket() });
    renderPage('/tickets/t-1');
    expect(await screen.findByRole('button', { name: 'Pay now' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cancel ticket' })).toBeTruthy();
    expect(screen.getByText(/Pay within/)).toBeTruthy();
    expect(screen.queryByText('Confirming your payment…')).toBeNull();
  });

  it('a paid ticket offers no payment or cancel buttons; an expired one says it can no longer be used', async () => {
    fakeApi({ ticket: ticket({ status: 'paid', paidAt: '2026-10-16T02:01:00.000Z', payBeforeAt: null }) });
    renderPage('/tickets/t-1');
    await screen.findByText(/Payment received/);
    expect(screen.queryByRole('button', { name: /Pay now|Cancel ticket/ })).toBeNull();
    cleanup();

    fakeApi({ ticket: ticket({ status: 'expired', payBeforeAt: null }) });
    renderPage('/tickets/t-1');
    expect(await screen.findByText('This ticket has expired.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Pay now/ })).toBeNull();
  });

  describe('emailing the ticket', () => {
    it('a paid ticket offers to email it again, and asks the server for exactly that ticket', async () => {
      const calls = fakeApi({ ticket: ticket({ status: 'paid', paidAt: '2026-10-16T02:05:00.000Z', payBeforeAt: null }) });
      renderPage('/tickets/t-1');
      fireEvent.click(await screen.findByRole('button', { name: /Email me this ticket/ }));
      await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/api/tickets/t-1/email')).toBe(true));
    });

    it('a ticket that is not paid does not offer it', async () => {
      fakeApi({ ticket: ticket() });
      renderPage('/tickets/t-1');
      await screen.findByText(/Pay within/);
      expect(screen.queryByRole('button', { name: /Email me this ticket/ })).toBeNull();
    });
  });

  describe('a ticket for a group', () => {
    it('says how many it admits and the fare for each, and the total', async () => {
      fakeApi({ ticket: ticket({ quantity: 5, fareCentavos: 24500, status: 'pending_payment' }) });
      renderPage('/tickets/t-1');
      expect((await screen.findByTestId('ticket-passengers')).textContent).toBe('5 (₱49.00 each)');
      expect(screen.getByText('Total fare')).toBeTruthy();
      expect(screen.getByText('₱245.00')).toBeTruthy();
    });

    it('a single ticket shows no passenger line', async () => {
      fakeApi({ ticket: ticket() });
      renderPage('/tickets/t-1');
      await screen.findByText(/Pay within/);
      expect(screen.queryByTestId('ticket-passengers')).toBeNull();
      expect(screen.getByText('Fare')).toBeTruthy();
    });
  });

  describe('the 15-minute payment window', () => {
    it('sends the passenger back to the previous page when the time runs out', async () => {
      fakeApi({ ticket: ticket({ payBeforeAt: new Date(Date.now() + 3000).toISOString() }) });
      renderPage(['/', '/tickets/t-1']);
      expect(await screen.findByText(/Pay within/)).toBeTruthy();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(await screen.findByText('PREVIOUS PAGE')).toBeTruthy();
    });

    it('goes to the ticket list when the page was opened directly (no previous page)', async () => {
      fakeApi({ ticket: ticket({ payBeforeAt: new Date(Date.now() + 3000).toISOString() }) });
      renderPage('/tickets/t-1');
      expect(await screen.findByText(/Pay within/)).toBeTruthy();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000);
      });
      expect(await screen.findByText('MY TICKETS')).toBeTruthy();
    });

    it('also leaves when the server reports the ticket expired while it is being watched', async () => {
      const current = { ticket: ticket() };
      fakeApi(current);
      renderPage(['/', '/tickets/t-1']);
      expect(await screen.findByText(/Pay within/)).toBeTruthy();
      current.ticket = ticket({ status: 'expired', payBeforeAt: null });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(4000);
      });
      expect(await screen.findByText('PREVIOUS PAGE')).toBeTruthy();
    });

    it('a ticket that was already expired when opened just shows as expired (no redirect)', async () => {
      fakeApi({ ticket: ticket({ status: 'expired', payBeforeAt: null }) });
      renderPage(['/', '/tickets/t-1']);
      expect(await screen.findByText('This ticket has expired.')).toBeTruthy();
      expect(screen.queryByText('PREVIOUS PAGE')).toBeNull();
    });
  });
});
