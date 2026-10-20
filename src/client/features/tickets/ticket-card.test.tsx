import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { formatCountdown } from '@/lib/use-now';
import { formatManilaDateTime } from '@shared/datetime/ph-time';
import { TicketCard } from './ticket-card';
import type { Ticket } from './use-tickets';

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
  payBeforeAt: '2026-10-16T02:15:00.000Z',
  ...overrides,
});

const view = (t: Ticket, handlers: { onPay?: () => void; onCancel?: () => void } = {}) =>
  render(
    <MemoryRouter>
      <TicketCard ticket={t} onPay={handlers.onPay} onCancel={handlers.onCancel} />
    </MemoryRouter>,
  );

afterEach(cleanup);

describe('TicketCard', () => {
  it('says how many passengers a group ticket covers', () => {
    view(ticket({ quantity: 5, fareCentavos: 17500, busName: 'Bus 2' }));
    expect(screen.getByText(/5 passengers/)).toBeTruthy();
    expect(screen.getByText('₱175.00')).toBeTruthy();
  });

  it('does not mention passengers for a single ticket', () => {
    view(ticket());
    expect(screen.queryByText(/passengers/)).toBeNull();
  });

  it('shows the route, reference, fare and status', () => {
    view(ticket());
    expect(screen.getByText('Bus Shelter S3 → Bus Shelter S12')).toBeTruthy();
    expect(screen.queryByText('BRT-ABC234')).toBeNull(); // not until it is paid
    expect(screen.getByText('₱35.00')).toBeTruthy();
    expect(screen.getByText('Awaiting payment')).toBeTruthy();
  });

  it('an unpaid ticket can be paid or cancelled', () => {
    const onPay = vi.fn();
    const onCancel = vi.fn();
    const t = ticket();
    view(t, { onPay, onCancel });
    fireEvent.click(screen.getByRole('button', { name: 'Pay now' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onPay).toHaveBeenCalledWith(t);
    expect(onCancel).toHaveBeenCalledWith(t);
  });

  it('a paid ticket can only be viewed: no pay, no cancel (no refunds)', () => {
    view(ticket({ status: 'paid', paidAt: '2026-10-16T02:05:00.000Z', payBeforeAt: null }), { onPay: vi.fn(), onCancel: vi.fn() });
    expect(screen.getByText('Paid')).toBeTruthy();
    expect(screen.getByText('BRT-ABC234')).toBeTruthy(); // the reference appears once it is paid
    expect(screen.queryByRole('button', { name: 'Pay now' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(screen.getByRole('link', { name: 'View ticket' }).getAttribute('href')).toBe('/tickets/t-1');
  });

  it.each(['used', 'expired', 'cancelled'] as const)('a %s ticket offers no actions', (status) => {
    view(ticket({ status, payBeforeAt: null }), { onPay: vi.fn(), onCancel: vi.fn() });
    expect(screen.queryByRole('button', { name: /Pay now|Cancel/ })).toBeNull();
  });
});

describe('formatting', () => {
  it('formats a countdown as m:ss and never goes negative', () => {
    expect(formatCountdown(14 * 60_000 + 5_000)).toBe('14:05');
    expect(formatCountdown(59_500)).toBe('1:00');
    expect(formatCountdown(-5000)).toBe('0:00');
  });

  it('formats a date and time in Manila time', () => {
    expect(formatManilaDateTime('2026-10-16T01:45:00Z')).toMatch(/Oct 16, 9:45 AM/);
  });
});
