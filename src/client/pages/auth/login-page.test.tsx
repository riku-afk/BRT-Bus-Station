import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LoginPage } from './login-page';

const calls: { method: string; url: string }[] = [];
const realAgent = window.navigator.userAgent;
const setAgent = (value: string) => Object.defineProperty(window.navigator, 'userAgent', { value, configurable: true });

function fakeApi(role: 'passenger' | 'konduktor' | 'admin') {
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', url });
      const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data, timestamp: '' }), { status: 200 });
      if (url === '/api/auth/login') return ok({ id: 'u1', email: 'u@t.test', fullName: 'Una', role });
      return ok({ ok: true });
    }),
  );
}

const view = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/konduktor" element={<p>KONDUKTOR HOME</p>} />
          <Route path="/" element={<p>PASSENGER HOME</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );

const signIn = () => {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'u@t.test' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'Password123' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'Sign in' })[0]!);
};

afterEach(() => {
  cleanup();
  setAgent(realAgent);
  vi.unstubAllGlobals();
});

describe('sign-in in a browser', () => {
  it('offers passenger registration, and a passenger signs in to the passenger home', async () => {
    fakeApi('passenger');
    view();
    expect(screen.getByRole('link', { name: /Create a passenger account/ })).toBeTruthy();
    signIn();
    expect(await screen.findByText('PASSENGER HOME')).toBeTruthy();
  });
});

describe('sign-in inside the BRT Konduktor Android app', () => {
  it('has no passenger registration', () => {
    setAgent(`${realAgent} BRTKonduktorApp`);
    fakeApi('konduktor');
    view();
    expect(screen.queryByRole('link', { name: /Create a passenger account/ })).toBeNull();
  });

  it('lets a konduktor in', async () => {
    setAgent(`${realAgent} BRTKonduktorApp`);
    fakeApi('konduktor');
    view();
    signIn();
    expect(await screen.findByText('KONDUKTOR HOME')).toBeTruthy();
    expect(calls.some((c) => c.url === '/api/auth/logout')).toBe(false);
  });

  it('signs a passenger or an admin straight back out, and says the app is for konduktors', async () => {
    setAgent(`${realAgent} BRTKonduktorApp`);
    for (const role of ['passenger', 'admin'] as const) {
      fakeApi(role);
      const { unmount } = view();
      signIn();
      await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/api/auth/logout')).toBe(true));
      expect(await screen.findByText(/This app is for konduktors/)).toBeTruthy();
      expect(screen.queryByText('PASSENGER HOME')).toBeNull();
      unmount();
    }
  });
});
