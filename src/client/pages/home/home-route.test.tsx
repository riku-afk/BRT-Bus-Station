import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Role } from '@shared/rbac/roles';
import { HomeRoute } from './home-route';

// The real home page draws a Leaflet map; this test is only about who gets it.
vi.mock('./home-page', () => ({ HomePage: () => <div>the all-buses map</div> }));

function renderAs(role: Role | null) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify({ success: true, data: role ? { id: '1', email: 'x@y.z', fullName: 'X', role } : null, timestamp: '' }), { status: 200 })),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<HomeRoute />} />
          <Route path="/konduktor" element={<div>konduktor page</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('HomeRoute', () => {
  it('sends a konduktor to their own page instead of the map with every bus', async () => {
    renderAs('konduktor');
    expect(await screen.findByText('konduktor page')).toBeTruthy();
    expect(screen.queryByText('the all-buses map')).toBeNull();
  });

  it.each([['passenger' as const], ['admin' as const], [null]])('shows the map to %s', async (role) => {
    renderAs(role);
    expect(await screen.findByText('the all-buses map')).toBeTruthy();
  });
});
