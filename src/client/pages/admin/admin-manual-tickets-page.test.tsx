import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { ManualTicket } from '@/features/tickets/use-manual-tickets';
import { AdminManualTicketsPage } from './admin-manual-tickets-page';

const stations = ['A', 'B', 'C'].map((n, i) => ({ id: `st-${i + 1}`, name: `Shelter ${n}`, sequence: i + 1, latitude: 14, longitude: 121, isActive: true, distanceMeters: i * 1000 }));

const ticket = (over: Partial<ManualTicket> = {}): ManualTicket => ({
  id: 'tk-1',
  referenceCode: 'BRT-ABC123',
  originStationId: 'st-1',
  originName: 'Shelter A',
  destinationStationId: 'st-3',
  destinationName: 'Shelter C',
  fareCentavos: 6000,
  quantity: 2,
  status: 'paid',
  validUntil: '2026-10-22T15:59:59.000Z',
  paidAt: '2026-10-22T02:00:00.000Z',
  usedAt: null,
  createdAt: '2026-10-22T02:00:00.000Z',
  busId: null,
  busName: null,
  payBeforeAt: null,
  passengerName: 'Maria Santos',
  encodedByName: 'Ana Admin',
  ...over,
});

type Call = { method: string; url: string; body: unknown };

function fakeApi(list: ManualTicket[] = []) {
  const calls: Call[] = [];
  const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data, timestamp: '' }), { status });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      calls.push({ method, url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url === '/api/stations') return ok(stations);
      if (url.startsWith('/api/fares/quote')) return ok({ originId: 'st-1', destinationId: 'st-3', stationsTravelled: 2, fareCentavos: 3000, source: 'computed' });
      if (url === '/api/manual-tickets' && method === 'POST') return ok(ticket(), 201);
      if (url.startsWith('/api/manual-tickets?')) return ok({ items: list, page: 1, pageSize: 10, total: list.length, totalPages: 1 });
      return ok(null);
    }),
  );
  return calls;
}

const view = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <AdminManualTicketsPage />
    </QueryClientProvider>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Manual tickets (admin)', () => {
  it('shows an empty state and no ticket until one is issued', async () => {
    fakeApi();
    view();
    expect(await screen.findByText('Nothing sold yet')).toBeTruthy();
    expect(screen.getByText('No ticket yet')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Issue ticket' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('works out the total on the screen from the server fare, and sends only where, how many and who (never a fare)', async () => {
    const calls = fakeApi();
    view();
    await screen.findAllByRole('option', { name: '1. Shelter A' });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: 'st-1' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: 'st-3' } });
    fireEvent.change(screen.getByLabelText('Passengers'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText(/Passenger name/), { target: { value: ' Maria Santos ' } });
    await waitFor(() => expect(screen.getByTestId('fare-preview').textContent).toContain('₱60.00'));
    expect(screen.getByTestId('fare-preview').textContent).toContain('₱30.00 each');

    fireEvent.click(screen.getByRole('button', { name: 'Issue ticket' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/api/manual-tickets')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ originId: 'st-1', destinationId: 'st-3', quantity: 2, passengerName: 'Maria Santos' });
  });

  it('shows the issued ticket with its QR code, a download link and a print button', async () => {
    fakeApi();
    const print = vi.fn();
    vi.stubGlobal('print', print);
    view();
    await screen.findAllByRole('option', { name: '1. Shelter A' });
    fireEvent.change(screen.getByLabelText('From'), { target: { value: 'st-1' } });
    fireEvent.change(screen.getByLabelText('To'), { target: { value: 'st-3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Issue ticket' }));

    const slip = await screen.findByTestId('ticket-slip');
    expect(within(slip).getByTestId('slip-reference').textContent).toBe('BRT-ABC123');
    expect(slip.textContent).toContain('Shelter A → Shelter C');
    expect(slip.textContent).toContain('₱60.00');
    expect(slip.textContent).toContain('Maria Santos');
    expect(within(slip).getByAltText('QR code for ticket BRT-ABC123').getAttribute('src')).toBe('/api/manual-tickets/tk-1/qr.png');

    const download = screen.getByRole('link', { name: /Download QR/ });
    expect(download.getAttribute('href')).toBe('/api/manual-tickets/tk-1/qr.png');
    expect(download.getAttribute('download')).toBe('ticket-BRT-ABC123.png');

    fireEvent.click(screen.getByRole('button', { name: /Print ticket/ }));
    expect(print).toHaveBeenCalledTimes(1);
  });

  it('lists what was sold, and shows a ticket\'s QR again; a used ticket has no QR to show', async () => {
    fakeApi([ticket(), ticket({ id: 'tk-2', referenceCode: 'BRT-USED99', status: 'used', passengerName: null })]);
    view();
    const list = await screen.findByTestId('manual-list');
    expect(list.textContent).toContain('BRT-ABC123');
    expect(list.textContent).toContain('by Ana Admin');

    fireEvent.click(screen.getByRole('button', { name: 'View ticket BRT-ABC123' }));
    expect(screen.getByAltText('QR code for ticket BRT-ABC123')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'View ticket BRT-USED99' }));
    expect(screen.queryByAltText('QR code for ticket BRT-USED99')).toBeNull();
    expect(screen.getByTestId('ticket-slip').textContent).toContain('no QR code any more');
    expect(screen.queryByRole('button', { name: /Print ticket/ })).toBeNull();
  });
});
