import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { RequireRole } from './guards';
import type { CurrentUser } from './use-auth';

function mockMe(user: CurrentUser | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ success: true, data: user, timestamp: new Date().toISOString() }), { status: 200 })),
  );
}

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/login" element={<div>login page</div>} />
          <Route path="/" element={<div>passenger home</div>} />
          <Route path="/admin" element={<RequireRole roles={['admin']}><div>admin page</div></RequireRole>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('RequireRole', () => {
  it('sends signed-out visitors to the login page', async () => {
    mockMe(null);
    renderAt('/admin');
    expect(await screen.findByText('login page')).toBeTruthy();
  });

  it('sends the wrong role to their own home', async () => {
    mockMe({ id: '1', email: 'p@x.y', fullName: 'P', role: 'passenger' });
    renderAt('/admin');
    expect(await screen.findByText('passenger home')).toBeTruthy();
  });

  it('lets the right role in', async () => {
    mockMe({ id: '2', email: 'a@x.y', fullName: 'A', role: 'admin' });
    renderAt('/admin');
    expect(await screen.findByText('admin page')).toBeTruthy();
  });
});
