import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { MyBus } from '@shared/tracking/models';
import { KonduktorHomePage } from './konduktor-home-page';

type MapProps = {
  stations: { id: string; name: string }[];
  originId?: string | null;
  destinationId?: string | null;
  selectedBusId?: string | null;
  onStationClick?: (id: string) => void;
};
vi.mock('@/components/map/station-map', () => ({
  StationMap: (props: MapProps) => (
    <div data-testid="map" data-origin={props.originId ?? ''} data-destination={props.destinationId ?? ''} data-selected-bus={props.selectedBusId ?? ''} data-tappable={String(Boolean(props.onStationClick))}>
      {props.stations.map((s) => (
        <button key={s.id} type="button" onClick={() => props.onStationClick?.(s.id)}>{`tap ${s.name}`}</button>
      ))}
    </div>
  ),
}));

const stations = ['S1', 'S2', 'S3', 'S4', 'S5'].map((n, i) => ({
  id: `st-${i + 1}`, name: `Bus Shelter ${n}`, sequence: i + 1, latitude: 14, longitude: 121, isActive: true, distanceMeters: i * 1000,
}));

const available = (overrides: Partial<MyBus> = {}): MyBus => ({
  bus: { id: 'bus-1', name: 'Bus 1', plateNumber: 'NCV 1101' },
  operation: 'available',
  station: { id: 'st-3', name: 'Bus Shelter S3' },
  expectedDepartureAt: null,
  plannedDestination: null,
  trip: null,
  defaultDestination: { id: 'st-5', name: 'Bus Shelter S5' },
  workerOnline: true,
  ...overrides,
});

type Call = { method: string; url: string; body: unknown };

/** A fake API whose `/tracking/my-bus` answer is whatever `state.mine` currently is. */
function fakeApi(state: { mine: MyBus; etaSeconds?: number; ride?: unknown }) {
  const calls: Call[] = [];
  const ok = (data: unknown, status = 200) => new Response(JSON.stringify({ success: true, data, timestamp: '' }), { status });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      const body = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ method, url, body });
      if (url === '/api/tracking/my-bus' && method === 'GET') return ok(state.mine);
      if (url === '/api/tracking/my-bus/departure') {
        state.mine = { ...state.mine, expectedDepartureAt: body.inMinutes === null ? null : new Date(Date.now() + body.inMinutes * 60_000).toISOString() };
        return ok(state.mine);
      }
      if (url === '/api/tracking/my-bus/destination') {
        const picked = stations.find((s) => s.id === body.destinationId);
        state.mine = { ...state.mine, plannedDestination: picked ? { id: picked.id, name: picked.name } : null };
        return ok(state.mine);
      }
      if (url === '/api/tracking/my-bus/dispatch') return ok({ tripId: 't1', busName: 'Bus 1', originName: 'Bus Shelter S3', destinationName: 'Bus Shelter S5' }, 201);
      if (url === '/api/eta/buses') {
        const to = { stationId: 'st-5', stationName: 'Bus Shelter S5', seconds: state.etaSeconds ?? 420 };
        return ok([{ busId: 'bus-1', next: to, destination: to }]);
      }
      if (url === '/api/scans/ride') return ok(state.ride ?? null);
      if (url === '/api/stations') return ok(stations);
      if (url === '/api/konduktors/me') return ok({ fullName: 'Ramon Dela Cruz', employeeNo: 'KND-001', phone: null });
      return ok(null);
    }),
  );
  return calls;
}

const renderPage = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter><KonduktorHomePage /></MemoryRouter>
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  // The old browser pop-up must never be used.
  vi.stubGlobal('confirm', vi.fn(() => true));
});

/** The dispatch pop-up: what it says, then answer it. */
const dialog = () => screen.findByRole('alertdialog');
const answer = async (name: RegExp) => fireEvent.click(within(await dialog()).getByRole('button', { name }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('KonduktorHomePage: my bus', () => {
  it('an available bus shows where it waits and what it would do', async () => {
    fakeApi({ mine: available() });
    renderPage();
    expect(await screen.findByText('Bus Shelter S3')).toBeTruthy();
    expect(screen.getByText('Available')).toBeTruthy();
    expect(screen.getByText('Bus 1 · NCV 1101')).toBeTruthy();
    expect(screen.getByText('No departure time set yet')).toBeTruthy();
    // The default destination is the far end; the list offers the other stations, but not this one.
    const select = screen.getByLabelText('Dispatch to') as HTMLSelectElement;
    expect([...select.options].map((o) => o.text)).toEqual(['End of the line · Bus Shelter S5', '1. Bus Shelter S1', '2. Bus Shelter S2', '4. Bus Shelter S4']);
  });

  it('sets the expected departure with one tap, and clears it', async () => {
    const calls = fakeApi({ mine: available() });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'In 10 min' }));
    await waitFor(() => expect(calls.some((c) => c.url === '/api/tracking/my-bus/departure' && (c.body as { inMinutes: number }).inMinutes === 10)).toBe(true));
    expect(await screen.findByText(/Departs about .* \(in 10 min\)/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(calls.filter((c) => c.url === '/api/tracking/my-bus/departure').at(-1)!.body).toEqual({ inMinutes: null }));
    expect(await screen.findByText('No departure time set yet')).toBeTruthy();
  });

  it('there is nothing to clear until a departure time is set', async () => {
    fakeApi({ mine: available() });
    renderPage();
    const clear = (await screen.findByRole('button', { name: 'Clear' })) as HTMLButtonElement;
    expect(clear.disabled).toBe(true);
  });

  it('dispatches to the end of the line with one button, after confirming', async () => {
    const calls = fakeApi({ mine: available() });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Dispatch bus/ }));
    // Nothing is sent until the pop-up is answered.
    expect((await dialog()).textContent).toContain('Bus Shelter S3 → Bus Shelter S5');
    expect((await dialog()).textContent).toContain('cannot be called back');
    expect(calls.some((c) => c.url === '/api/tracking/my-bus/dispatch')).toBe(false);
    await answer(/Dispatch now/);
    await waitFor(() => expect(calls.some((c) => c.url === '/api/tracking/my-bus/dispatch')).toBe(true));
    expect(confirm).not.toHaveBeenCalled();
    expect(calls.find((c) => c.url === '/api/tracking/my-bus/dispatch')!.body).toEqual({});
  });

  it('cannot dispatch while the ride that just ended is not completed, and says why', async () => {
    const calls = fakeApi({
      mine: available(),
      ride: { passengers: 7, tickets: 3, since: null, atShelter: 'Bus Shelter S3', canComplete: true, mustCompleteBeforeDispatch: true, unfinishedPassengers: 7 },
    });
    renderPage();
    expect((await screen.findByTestId('dispatch-blocked')).textContent).toContain('Complete your ride first. 7 passengers from your last trip are still counted');
    await waitFor(() => expect((screen.getByRole('button', { name: /Dispatch bus/ }) as HTMLButtonElement).disabled).toBe(true));
    fireEvent.click(screen.getByRole('button', { name: /Dispatch bus/ }));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(calls.some((c) => c.url === '/api/tracking/my-bus/dispatch')).toBe(false);
  });

  it('can dispatch again once the ride is completed (nothing is left to complete)', async () => {
    fakeApi({
      mine: available(),
      ride: { passengers: 0, tickets: 0, since: '2026-10-20T01:30:00.000Z', atShelter: 'Bus Shelter S3', canComplete: false, mustCompleteBeforeDispatch: false, unfinishedPassengers: 0 },
    });
    renderPage();
    await screen.findByRole('button', { name: /Dispatch bus/ });
    expect(screen.queryByTestId('dispatch-blocked')).toBeNull();
    await waitFor(() => expect((screen.getByRole('button', { name: /Dispatch bus/ }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('can pick a nearer station instead', async () => {
    const calls = fakeApi({ mine: available() });
    renderPage();
    fireEvent.change(await screen.findByLabelText('Dispatch to'), { target: { value: 'st-4' } });
    fireEvent.click(screen.getByRole('button', { name: /Dispatch bus/ }));
    expect((await dialog()).textContent).toContain('Bus Shelter S3 → Bus Shelter S4');
    await answer(/Dispatch now/);
    await waitFor(() => expect(calls.some((c) => c.url === '/api/tracking/my-bus/dispatch')).toBe(true));
    expect(calls.find((c) => c.url === '/api/tracking/my-bus/dispatch')!.body).toEqual({ destinationId: 'st-4' });
  });

  it('does nothing if the konduktor cancels the pop-up', async () => {
    const calls = fakeApi({ mine: available() });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Dispatch bus/ }));
    await answer(/Cancel/);
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    await new Promise((r) => setTimeout(r, 100));
    expect(calls.some((c) => c.url === '/api/tracking/my-bus/dispatch')).toBe(false);
  });

  it('never names a bus in anything it sends: the bus is always the konduktor\'s own', async () => {
    const calls = fakeApi({ mine: available() });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'In 5 min' }));
    fireEvent.click(screen.getByRole('button', { name: /Dispatch bus/ }));
    await answer(/Dispatch now/);
    await waitFor(() => expect(calls.some((c) => c.url === '/api/tracking/my-bus/dispatch')).toBe(true));
    for (const c of calls.filter((x) => x.method !== 'GET')) expect(JSON.stringify(c.body)).not.toMatch(/busId|konduktorId|bus-1/);
  });

  it('a bus on the road shows when it arrives, not a progress bar', async () => {
    fakeApi({
      etaSeconds: 420,
      mine: available({
        operation: 'on_road',
        station: null,
        defaultDestination: null,
        trip: { id: 't1', originStationId: 'st-3', originName: 'Bus Shelter S3', destinationStationId: 'st-5', destinationName: 'Bus Shelter S5', dispatchedAt: '2026-10-16T02:00:00Z' },
      }),
    });
    renderPage();
    const eta = await screen.findByTestId('my-eta');
    await waitFor(() => expect(eta.textContent).toContain('7 min'));
    expect(eta.textContent).toContain('Arrives at Bus Shelter S5');
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByText(/Progress/)).toBeNull();
  });

  it('a bus on the road shows its route and cannot be dispatched again, but its next departure can be timed', async () => {
    fakeApi({
      mine: available({
        operation: 'on_road',
        station: null,
        defaultDestination: null,
        trip: { id: 't1', originStationId: 'st-3', originName: 'Bus Shelter S3', destinationStationId: 'st-5', destinationName: 'Bus Shelter S5', dispatchedAt: '2026-10-16T02:00:00Z' },
      }),
    });
    renderPage();
    expect(await screen.findByText('On the road')).toBeTruthy();
    expect(screen.getByText('Bus Shelter S3 → Bus Shelter S5')).toBeTruthy();
    expect(screen.getByText(/becomes available at Bus Shelter S5 when it arrives/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Dispatch bus/ })).toBeNull();
    // But it can say when it will leave the shelter it is driving to: passengers waiting there see it.
    expect(screen.getByText('When will it leave Bus Shelter S5?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'In 10 min' })).toBeTruthy();
  });

  it('explains a konduktor with no bus, and a bus that is not on the map yet', async () => {
    fakeApi({ mine: { bus: null, operation: 'no_bus', station: null, expectedDepartureAt: null, plannedDestination: null, trip: null, defaultDestination: null, workerOnline: true } });
    renderPage();
    expect(await screen.findByText(/No bus is assigned to you yet/)).toBeTruthy();
    cleanup();

    fakeApi({ mine: available({ operation: 'not_on_map', station: null, defaultDestination: null }) });
    renderPage();
    expect(await screen.findByText(/not been placed at a station yet/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Dispatch bus/ })).toBeNull();
  });

  it('warns when the simulator is not running', async () => {
    fakeApi({ mine: available({ workerOnline: false }) });
    renderPage();
    expect(await screen.findByText(/The simulator is not running/)).toBeTruthy();
  });
});

const map = () => screen.getByTestId('map');
const destinationSelect = () => screen.getByLabelText('Dispatch to') as HTMLSelectElement;

describe('KonduktorHomePage: choosing where to go on the map', () => {
  it('shows the route on a map: where the bus is, and where it would go by default (the end of the line)', async () => {
    fakeApi({ mine: available() });
    renderPage();
    await screen.findByText('Dispatch to');
    expect(map().getAttribute('data-origin')).toBe('st-3');
    expect(map().getAttribute('data-destination')).toBe('st-5'); // the default is already marked, before any choice
    expect(map().getAttribute('data-selected-bus')).toBe('bus-1'); // their own bus is the highlighted one
    expect(map().getAttribute('data-tappable')).toBe('true');
    expect(screen.getByTestId('trip-summary').textContent).toContain('Bus Shelter S3 → Bus Shelter S5');
    expect(screen.getByTestId('trip-summary').textContent).toContain('2 stations · about 2.0 km');
  });

  it('tapping a station on the map chooses it as the destination, and the list and summary follow', async () => {
    fakeApi({ mine: available() });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'tap Bus Shelter S4' }));
    expect(map().getAttribute('data-destination')).toBe('st-4');
    expect(destinationSelect().value).toBe('st-4');
    expect(screen.getByTestId('trip-summary').textContent).toContain('Bus Shelter S3 → Bus Shelter S4');
    expect(screen.getByTestId('trip-summary').textContent).toContain('1 station · about 1.0 km');
  });

  it('saves the chosen destination at once, so passengers at the shelter see where the bus is headed', async () => {
    const calls = fakeApi({ mine: available() });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'tap Bus Shelter S4' }));
    await waitFor(() => expect(calls.some((c) => c.url === '/api/tracking/my-bus/destination')).toBe(true));
    expect(calls.filter((c) => c.url === '/api/tracking/my-bus/destination').at(-1)!.body).toEqual({ destinationId: 'st-4' });
    // Nothing is dispatched by choosing.
    expect(calls.some((c) => c.url === '/api/tracking/my-bus/dispatch')).toBe(false);

    fireEvent.change(destinationSelect(), { target: { value: 'st-2' } });
    await waitFor(() => expect(calls.filter((c) => c.url === '/api/tracking/my-bus/destination').at(-1)!.body).toEqual({ destinationId: 'st-2' }));
    fireEvent.change(destinationSelect(), { target: { value: '' } });
    await waitFor(() => expect(calls.filter((c) => c.url === '/api/tracking/my-bus/destination').at(-1)!.body).toEqual({ destinationId: null }));
  });

  it('follows the destination already saved on the server (another device, or a reload)', async () => {
    fakeApi({ mine: available({ plannedDestination: { id: 'st-2', name: 'Bus Shelter S2' } }) });
    renderPage();
    await screen.findByLabelText('Dispatch to');
    await waitFor(() => expect(destinationSelect().value).toBe('st-2'));
    expect(map().getAttribute('data-destination')).toBe('st-2');
    expect(screen.getByTestId('trip-summary').textContent).toContain('Bus Shelter S3 → Bus Shelter S2');
  });

  it('dispatches to the station that was tapped', async () => {
    const calls = fakeApi({ mine: available() });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'tap Bus Shelter S1' }));
    fireEvent.click(screen.getByRole('button', { name: /Dispatch bus/ }));
    expect((await dialog()).textContent).toContain('to Bus Shelter S1'.replace('to ', '→ '));
    await answer(/Dispatch now/);
    await waitFor(() => expect(calls.some((c) => c.url === '/api/tracking/my-bus/dispatch')).toBe(true));
    expect(calls.find((c) => c.url === '/api/tracking/my-bus/dispatch')!.body).toEqual({ destinationId: 'st-1' });
  });

  it('choosing from the list moves the destination on the map', async () => {
    fakeApi({ mine: available() });
    renderPage();
    fireEvent.change(await screen.findByLabelText('Dispatch to'), { target: { value: 'st-2' } });
    expect(map().getAttribute('data-destination')).toBe('st-2');
    expect(screen.getByTestId('trip-summary').textContent).toContain('Bus Shelter S3 → Bus Shelter S2');
  });

  it('tapping the station where the bus already waits changes nothing', async () => {
    fakeApi({ mine: available() });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'tap Bus Shelter S4' }));
    fireEvent.click(screen.getByRole('button', { name: 'tap Bus Shelter S3' })); // where the bus is
    expect(map().getAttribute('data-destination')).toBe('st-4');
    expect(destinationSelect().value).toBe('st-4');
  });

  it('tapping the end of the line goes back to "end of the line", which sends no station (the server picks it)', async () => {
    const calls = fakeApi({ mine: available() });
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'tap Bus Shelter S4' }));
    fireEvent.click(screen.getByRole('button', { name: 'tap Bus Shelter S5' })); // the default end
    expect(destinationSelect().value).toBe('');
    expect(map().getAttribute('data-destination')).toBe('st-5');
    fireEvent.click(screen.getByRole('button', { name: /Dispatch bus/ }));
    await answer(/Dispatch now/);
    await waitFor(() => expect(calls.some((c) => c.url === '/api/tracking/my-bus/dispatch')).toBe(true));
    expect(calls.find((c) => c.url === '/api/tracking/my-bus/dispatch')!.body).toEqual({});
  });

  it('while the bus is on the road, the map shows where it is headed and cannot be used to re-dispatch', async () => {
    fakeApi({
      mine: available({
        operation: 'on_road',
        station: null,
        defaultDestination: null,
        trip: { id: 't1', originStationId: 'st-2', originName: 'Bus Shelter S2', destinationStationId: 'st-5', destinationName: 'Bus Shelter S5', dispatchedAt: '2026-10-16T02:00:00Z' },
      }),
    });
    renderPage();
    await screen.findByText('On the road');
    expect(map().getAttribute('data-origin')).toBe('st-2');
    expect(map().getAttribute('data-destination')).toBe('st-5');
    expect(map().getAttribute('data-tappable')).toBe('false');
    expect(map().getAttribute('data-selected-bus')).toBe('bus-1');
  });

  it('shows no map for a konduktor with no bus, or a bus that is not on the map yet', async () => {
    fakeApi({ mine: { bus: null, operation: 'no_bus', station: null, expectedDepartureAt: null, plannedDestination: null, trip: null, defaultDestination: null, workerOnline: true } });
    renderPage();
    await screen.findByText(/No bus is assigned to you yet/);
    expect(screen.queryByTestId('map')).toBeNull();
    cleanup();

    fakeApi({ mine: available({ operation: 'not_on_map', station: null, defaultDestination: null }) });
    renderPage();
    await screen.findByText(/not been placed at a station yet/);
    expect(screen.queryByTestId('map')).toBeNull();
  });
});
