import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { MockSession } from '@/features/payments/use-mock-payment';
import { MockPaymentPage } from './mock-payment-page';

const session = (overrides: Partial<MockSession> = {}): MockSession => ({
  providerRef: 'mock_cs_abc',
  payable: true,
  paymentStatus: 'pending',
  ticketStatus: 'pending_payment',
  amountCentavos: 3500,
  referenceCode: 'BRT-ABC234',
  originName: 'Bus Shelter S3',
  destinationName: 'Bus Shelter S12',
  returnPath: '/tickets/t-1?return=1',
  methods: ['gcash', 'maya', 'qrph'],
  ...overrides,
});

function fakeApi(getResult: { status: number; session?: MockSession }) {
  const posts: { url: string; body: unknown }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === 'POST') {
        posts.push({ url, body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify({ success: true, data: { outcome: 'applied', returnPath: '/tickets/t-1?return=1' }, timestamp: '' }), { status: 200 });
      }
      if (getResult.status !== 200) {
        return new Response(JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'Payment session not found' }, timestamp: '' }), { status: 404 });
      }
      return new Response(JSON.stringify({ success: true, data: getResult.session, timestamp: '' }), { status: 200 });
    }),
  );
  return posts;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/pay/mock/mock_cs_abc']}>
        <Routes>
          <Route path="/pay/mock/:ref" element={<MockPaymentPage />} />
          <Route path="/tickets/:id" element={<div>ticket page reached</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('MockPaymentPage', () => {
  it('shows what is being paid and that it is a test gateway', async () => {
    fakeApi({ status: 200, session: session() });
    renderPage();
    expect(await screen.findByText('BRT-ABC234')).toBeTruthy();
    expect(screen.getByText(/test mode/)).toBeTruthy();
    expect(screen.getByText('Bus Shelter S3 → Bus Shelter S12')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Pay ₱35\.00/ })).toBeTruthy();
    for (const label of ['GCash', 'Maya', 'QR Ph']) expect(screen.getByLabelText(label)).toBeTruthy();
  });

  it('Pay sends the chosen method to the server and returns to the ticket page (which does the waiting)', async () => {
    const posts = fakeApi({ status: 200, session: session() });
    renderPage();
    fireEvent.click(await screen.findByLabelText('Maya'));
    fireEvent.click(screen.getByRole('button', { name: /Pay ₱35\.00/ }));
    expect(await screen.findByText('ticket page reached')).toBeTruthy();
    expect(posts).toEqual([{ url: '/api/payments/mock/sessions/mock_cs_abc/complete', body: { outcome: 'paid', method: 'maya' } }]);
  });

  it('the Fail button reports a failed payment', async () => {
    const posts = fakeApi({ status: 200, session: session() });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Fail this payment/ }));
    await waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0]!.body).toEqual({ outcome: 'failed', method: 'gcash' });
  });

  it('offers no payment buttons when the ticket can no longer be paid', async () => {
    fakeApi({ status: 200, session: session({ payable: false, ticketStatus: 'cancelled' }) });
    renderPage();
    expect(await screen.findByText('This payment can no longer be made.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Pay ₱/ })).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to the ticket' })).toBeTruthy();
  });

  it('says so for a link that does not exist', async () => {
    fakeApi({ status: 404 });
    renderPage();
    expect(await screen.findByText('This payment link is not valid.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Pay/ })).toBeNull();
  });
});
