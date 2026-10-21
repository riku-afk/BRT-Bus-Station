import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from 'next-themes';
import { AppShell } from './app-shell';

type Role = 'passenger' | 'konduktor' | 'admin' | null;
const calls: { method: string; url: string }[] = [];

function fakeApi(role: Role, tickets: unknown[] = []) {
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
      if (url === '/api/system/info') return ok({ versionLabel: 'Cavite Smart Transport Terminal v0.1.0', showPocBanner: false });
      if (url === '/api/tickets/mine') return ok(tickets);
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
              <Route path="konduktor" element={<p>MY BUS PAGE</p>} />
              <Route path="login" element={<p>LOGIN PAGE</p>} />
              <Route path="admin" element={<p>ADMIN PAGE</p>} />
            </Route>
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    </ThemeProvider>,
  );

const sideNav = () => screen.getByRole('complementary', { name: 'Side navigation' });
const tabBar = () => screen.getByRole('navigation', { name: 'Main (tabs)' });
const labels = (el: HTMLElement) => within(el).getAllByRole('link').map((a) => a.textContent?.trim());

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the passenger and konduktor frame', () => {
  it('has a side bar with the menu for the role, and a subtitle that says which app this is', async () => {
    fakeApi('passenger');
    view();
    await screen.findAllByTestId('nav-user');
    expect(labels(sideNav())).toEqual(['Cavite Smart Transport TerminalRide the line', 'Map', 'My tickets']);
    expect(screen.getByText('HOME PAGE')).toBeTruthy();
    cleanup();
    fakeApi('konduktor');
    view();
    await screen.findAllByTestId('nav-user');
    expect(labels(sideNav())).toEqual(['Cavite Smart Transport TerminalKonduktor app', 'My bus', 'Scan', 'History']);
  });

  it('marks the page you are on, in the side bar and in the tab bar', async () => {
    fakeApi('passenger');
    view('/tickets');
    await screen.findAllByTestId('nav-user');
    expect(within(sideNav()).getByRole('link', { name: 'My tickets' }).getAttribute('aria-current')).toBe('page');
    expect(within(sideNav()).getByRole('link', { name: 'Map' }).getAttribute('aria-current')).toBeNull();
    expect(within(tabBar()).getByRole('link', { name: 'My tickets' }).getAttribute('aria-current')).toBe('page');
  });

  it('shows the breadcrumb and title in the header, and who is signed in with a role badge', async () => {
    fakeApi('konduktor');
    view('/konduktor');
    await screen.findAllByTestId('nav-user');
    const header = screen.getAllByRole('banner')[0]!;
    expect(within(header).getByText('Konduktor / My bus')).toBeTruthy();
    const who = screen.getByTestId('nav-user');
    expect(who.textContent).toContain('Jordan Reyes');
    expect(who.textContent?.toLowerCase()).toContain('konduktor');
  });

  it('logging out goes to the login page', async () => {
    fakeApi('passenger');
    view('/tickets');
    await screen.findAllByTestId('nav-user');
    fireEvent.click(screen.getAllByRole('button', { name: 'Log out' })[0]!);
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/api/auth/logout')).toBe(true));
    expect(await screen.findByText('LOGIN PAGE')).toBeTruthy();
  });

  it('shows the software name and version', async () => {
    fakeApi('passenger');
    view();
    expect(await screen.findByText('Cavite Smart Transport Terminal v0.1.0')).toBeTruthy();
  });
});

describe('on a phone: an app bar and a tab bar instead of the side bar', () => {
  it('the app bar has the avatar, name, role, theme toggle and a log-out button; the side bar and header are for wide screens', async () => {
    fakeApi('passenger');
    view();
    await screen.findAllByTestId('nav-user');
    const bar = screen.getByTestId('app-bar');
    expect(bar.className).toContain('md:hidden');
    expect(within(bar).getByText('Jordan Reyes')).toBeTruthy();
    expect(within(bar).getByText('JR')).toBeTruthy();
    expect(within(bar).getByText('passenger')).toBeTruthy();
    expect(within(bar).getByRole('button', { name: /dark mode/i })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: 'Log out' })).toBeTruthy();
    expect(sideNav().className).toContain('hidden');
    expect(sideNav().className).toContain('md:flex');
  });

  it('the tab bar is fixed to the bottom with one tab per page, and only on a phone', async () => {
    fakeApi('konduktor');
    view();
    await screen.findAllByTestId('nav-user');
    expect(tabBar().className).toMatch(/fixed/);
    expect(tabBar().className).toContain('bottom-0');
    expect(tabBar().className).toContain('md:hidden');
    expect(labels(tabBar())).toEqual(['My bus', 'Scan', 'History']);
  });

  it('a passenger sees how many tickets are waiting for payment on the My tickets tab', async () => {
    fakeApi('passenger', [{ id: 't1', status: 'pending_payment' }, { id: 't2', status: 'pending_payment' }, { id: 't3', status: 'paid' }]);
    view();
    await screen.findAllByTestId('nav-user');
    expect((await within(tabBar()).findByLabelText('2 awaiting payment')).textContent).toBe('2');
    expect(await within(sideNav()).findByLabelText('2 awaiting payment')).toBeTruthy();
  });

  it('no badge when nothing is waiting', async () => {
    fakeApi('passenger', [{ id: 't3', status: 'paid' }]);
    view();
    await screen.findAllByTestId('nav-user');
    await waitFor(() => expect(calls.some((c) => c.url === '/api/tickets/mine')).toBe(true));
    expect(screen.queryByLabelText(/awaiting payment/)).toBeNull();
  });
});

describe('a visitor who is not signed in', () => {
  it('has no side navigation, only a top bar with Sign in', async () => {
    fakeApi(null);
    view();
    const bar = await screen.findByRole('banner');
    expect(within(bar).getByRole('link', { name: 'Sign in' }).getAttribute('href')).toBe('/login');
    expect(screen.queryByRole('complementary', { name: 'Side navigation' })).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Main (tabs)' })).toBeNull();
    expect(screen.queryByTestId('nav-user')).toBeNull();
    expect(screen.getByText('HOME PAGE')).toBeTruthy();
  });

  it('signing out takes the navigation away', async () => {
    fakeApi('admin');
    view('/admin');
    await screen.findByTestId('nav-user');
    expect(screen.getByRole('complementary', { name: 'Side navigation' })).toBeTruthy();
    fakeApi(null); // from now on the server says nobody is signed in
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    expect(await screen.findByText('LOGIN PAGE')).toBeTruthy();
    expect(screen.queryByRole('complementary', { name: 'Side navigation' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Overview' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Map' })).toBeNull();
  });
});

describe('the admin console frame', () => {
  it('has the whole admin menu', async () => {
    fakeApi('admin');
    view('/admin');
    await screen.findByTestId('nav-user');
    const names = within(sideNav())
      .getAllByRole('link')
      .map((a) => a.textContent?.trim());
    expect(names).toEqual(expect.arrayContaining(['Overview', 'Live map', 'Map', 'Stations', 'Buses', 'Konduktors', 'Fares', 'Payments', 'Scans']));
    expect(names).not.toContain('My tickets');
  });

  it('groups the menu under Operations and Revenue and marks the current page', async () => {
    fakeApi('admin');
    view('/admin');
    await screen.findByTestId('nav-user');
    const nav = within(sideNav());
    expect(nav.getByText('Operations')).toBeTruthy();
    expect(nav.getByText('Revenue')).toBeTruthy();
    expect(nav.getByText('Admin console')).toBeTruthy();
    expect(nav.getByRole('link', { name: 'Overview' }).getAttribute('aria-current')).toBe('page');
    expect(nav.getByRole('link', { name: 'Buses' }).getAttribute('aria-current')).toBeNull();
    expect(nav.getByText('Need help?')).toBeTruthy();
    expect(nav.getByText('Cavite Smart Transport Terminal v0.1.0')).toBeTruthy();
  });

  it('puts the breadcrumb, page title, who is signed in and Log out in the header', async () => {
    fakeApi('admin');
    view('/admin');
    const who = await screen.findByTestId('nav-user');
    expect(who.textContent).toContain('Jordan Reyes');
    expect(who.textContent).toContain('JR');
    expect(who.textContent?.toLowerCase()).toContain('admin');
    const header = screen.getByRole('banner');
    expect(within(header).getByText('Admin / Overview')).toBeTruthy();
    expect(within(header).getByText('Dashboard')).toBeTruthy();
    expect(within(header).getByRole('button', { name: /dark mode/i })).toBeTruthy();
  });

  it('logging out goes to the login page', async () => {
    fakeApi('admin');
    view('/admin');
    await screen.findByTestId('nav-user');
    fireEvent.click(screen.getByRole('button', { name: 'Log out' }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/api/auth/logout')).toBe(true));
    expect(await screen.findByText('LOGIN PAGE')).toBeTruthy();
  });

  it('is a drawer behind the menu button on a phone, closed by its button, the backdrop, Escape or choosing a page', async () => {
    fakeApi('admin');
    view('/admin');
    await screen.findByTestId('nav-user');
    expect(sideNav().className).toContain('-translate-x-full');
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    expect(sideNav().className).toContain('translate-x-0');
    expect(screen.getByRole('button', { name: 'Open menu' }).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Close menu' }));
    expect(sideNav().className).toContain('-translate-x-full');
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.click(screen.getByTestId('nav-backdrop'));
    expect(sideNav().className).toContain('-translate-x-full');
    fireEvent.click(screen.getByRole('button', { name: 'Open menu' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(sideNav().className).toContain('-translate-x-full');
    expect(sideNav().className).toMatch(/md:translate-x-0/);
    expect(sideNav().className).toMatch(/md:sticky/);
  });
});
