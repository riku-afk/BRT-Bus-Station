import { afterEach, describe, expect, it } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { PayWithQr, type PaymentStatus } from './pay-with-qr';

const status = (overrides: Partial<PaymentStatus> = {}): PaymentStatus => ({
  ticketStatus: 'pending_payment',
  paymentStatus: 'pending',
  provider: 'pisopay',
  amountCentavos: 3300,
  channelCode: 'QR1',
  referenceNo: 'REF-ABC',
  hasQr: true,
  ...overrides,
});

const view = (s: PaymentStatus | undefined) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <PayWithQr ticketId="t-1" fareCentavos={3300} payBeforeAt={new Date(Date.now() + 10 * 60_000).toISOString()} status={s} />
    </QueryClientProvider>,
  );

afterEach(cleanup);

describe('PayWithQr', () => {
  it('shows the QR Ph code with the amount already in it, no reference, and that it is waiting', () => {
    view(status());
    const img = screen.getByTestId('pay-qr') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/api/tickets/t-1/payment-qr.png?ref=REF-ABC');
    expect(img.getAttribute('alt')).toContain('₱33.00');
    expect(screen.getByText('₱33.00')).toBeTruthy();
    expect(screen.queryByText('REF-ABC')).toBeNull(); // the reference is not shown under the payment QR
    expect(screen.getByText(/Waiting for your payment/)).toBeTruthy();
    expect(screen.getByText(/expires in 9:5\d|expires in 10:00/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Download QR/ }).getAttribute('download')).toBe('pay-qrph.png');
  });

  it('asks for a fresh picture when the payment changes (a new reference)', () => {
    view(status({ referenceNo: 'REF-NEW' }));
    expect((screen.getByTestId('pay-qr') as HTMLImageElement).getAttribute('src')).toContain('ref=REF-NEW');
  });

  it('says so while loading, and when there is no open QR', () => {
    const { unmount } = view(undefined);
    expect(screen.getByText('Getting your QR code…')).toBeTruthy();
    unmount();
    view(status({ hasQr: false }));
    expect(screen.getByText(/No QR code is open/)).toBeTruthy();
    expect(screen.queryByTestId('pay-qr')).toBeNull();
  });

  it('warns not to pay again when a payment needs review', () => {
    view(status({ paymentStatus: 'needs_review' }));
    expect(screen.getByRole('alert').textContent).toMatch(/do not pay again/);
  });
});
