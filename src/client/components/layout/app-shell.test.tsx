import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { AppShell } from './app-shell';

type Role = 'passenger' | 'konduktor' | 'admin' | null;
const calls: { method: string; url: string }[] = [];

function fakeApi(role: Role) {
  calls.length = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ method: init?.method ?? 'GET', url });
      const ok = (data: unknown) => new Response(JSON.stringify({ success: true, data, timestamp: '' }), { status: 200 });
      if (url === '/api/auth/me') {
        return role
          ? ok({ id: 'u1', email: 'u@t.test', fullName: 'Jordan Reyes', role })
          : new Response(JSON.stringify({ success: false, error: { code: 'UNAUTHORIZED', message: 'Sign in' }, timestamp: '' }), { status: 401 });
      }
      if (url === '/api/system/info') return ok({ versionLabel: 'BRT Bus Station v0.1.0', showPocBanner: false });
      return ok({});
    }),
  );
}

const view = (path = '/') =>
  render(
    <ThemeProvider attribute="class" defaultTheme="light">
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<p>HOME PAGE</p>} />
              <Route path="tickets" element={<p>TICKETS PAGE</p>} />
              <Route path="login" element={<p>LOGIN PAGE</p>} />
              <Route path="admin" element={<p>ADMIN PAGE</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );

const sideNav = () => screen.getByRole('complementary', { name: 'Side navigation' });
const links = () => within(sideNav()).getAllByRole('link').map((a) => a.textContent?.trim());

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the side navigation bar', () => {
  it('holds the menu for the signed-in role, down the side, not across a header', async () => {
    fakeApi('passenger');
    view();
    await screen.findByTestId('nav-user');
    expect(links()).toEqual(['BRT Bus Station', 'Map', 'My tickets']);
    // The page sits beside it.
    expect(screen.getByText('HOME PAGE')).toBeTruthy();
    expect(screen.queryByRole('banner')?.className).toMatch(/md:hidden/); // the only header is the phone's menu bar
  });

  it('gives an admin the management pages and a konduktor their three', async () => {
    fakeApi('admin');
    const { unmount } = view('/admin');
    await screen.findByTestId('nav-user');
    expect(links()).toEqual(expect.arrayContaining(['Admin', 'Live map', 'Stations', 'Buses', 'Konduktors', 'Fares', 'Payments', 'Scans']));
    expect(links()).not.toContain('My tickets');
    unmount();
    fakeApi('konduktor');
    view();
    await screen.findByTestId('nav-user');
    expect(links()).toEqual(['BRT Bus Station', 'My bus', 'Scan', 'History']);
  });

  it('marks the page you are on', async () => {
    fakeApi('passenger');
    view('/tickets');
    await screen.findByTestId('nav-user');
    expect(within(sideNav()).getByRole('link', { name: 'My tickets' }).className).toContain('bg-accent');
    expect(within(sideNav()).getByRole('link', { name: 'Map' }).className).not.toContain('font-medium');
  });

  it('shows who is signed in at the bottom, and signing out goes to the login page', async () => {
    fakeApi('passenger');
    view('/tickets');
    const who = await screen.findByTestId('nav-user');
    expect(who.textContent).toContain('Jordan Reyes');
    expect(who.textContent?.toLowerCase()).toContain('passenger');
    fireEvent.click(within(sideNav()).getByRole('button', { name: /Sign out/ }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/api/auth/logout')).toBe(true));
    expect(await screen.findByText('LOGIN PAGE')).toBeTruthy();
  });

  it('a visitor who is not signed in gets the map and a Sign in button', async () => {
    fakeApi(null);
    view();
    await waitFor(() => expect(links()).toContain('Sign in'));
    expect(links()).toEqual(['BRT Bus Station', 'Map', 'Sign in']);
    expect(screen.queryByTestId('nav-user')).toBeNull();
  });

  it('shows the software name and version', async () => {
    fakeApi('passenger');
    view();
    expect(await screen.findByText('BRT Bus Station v0.1.0')).toBeTruthy();
  });
});

describe('on a phone: the bar is a drawer behind a menu button', () => {
  it('opens from the menu button, and closes from its own button, the backdrop, Escape, or choosing a page', async () => {
    fakeApi('passenger');
    view();
    await screen.findByTestId('nav-user');
    const open = screen.getByRole('button', { name: 'Open menu' });
    expect(open.getAttribute('aria-expanded')).toBe('false');
    expect(sideNav().className).toContain('-translate-x-full');
    expect(screen.queryByTestId('nav-backdrop')).toBeNull();

    fireEvent.click(open);
    expect(sideNav().className).toContain('translate-x-0');
    expect(sideNav().className).not.toContain('-translate-x-full');
    expect(screen.getByRole('button', { name: 'Open menu' }).getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(sideNav().className).toContain('-translate-x-full');

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(screen.getByTestId('nav-backdrop'));
    expect(sideNav().className).toContain('-translate-x-full');

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(sideNav().className).toContain('-translate-x-full');

    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(within(sideNav()).getByRole('link', { name: 'My tickets' }));
    expect(await screen.findByText('TICKETS PAGE')).toBeTruthy();
    expect(sideNav().className).toContain('-translate-x-full');
  });

  it('is always in place on a wide screen: the classes that keep it there do not depend on the drawer', async () => {
    fakeApi('passenger');
    view();
    await screen.findByTestId('nav-user');
    expect(sideNav().className).toMatch(/md:translate-x-0/);
    expect(sideNav().className).toMatch(/md:sticky/);
  });
});
