import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { StationArrival } from '@shared/eta/eta';
import type { BusPosition } from '@shared/tracking/models';
import { ShelterContent, ShelterDialog, type Viewer } from './shelter-dialog';

const shelter = { id: 'st-3', name: 'Bus Shelter S3', sequence: 3 };

const bus = (overrides: Partial<BusPosition> = {}): BusPosition => ({
  busId: 'b1', busName: 'Bus 2', plateNumber: 'NCV 1102', latitude: 14, longitude: 121, headingDegrees: 0, speedKmh: 0, distanceMeters: 2000,
  direction: 1, nextStationId: null, nextStationName: null, atStation: true, service: 'parked', originStationId: 'st-3',
  originStationName: 'Bus Shelter S3', destinationStationId: null, destinationStationName: null, tripId: null,
  konduktorName: 'Liza Mendoza', dispatchedAt: null, expectedDepartureAt: null, plannedDestinationId: null, plannedDestinationName: null,
  headingToId: 'st-20', headingToName: 'Bus Shelter S20', updatedAt: '2026-10-16T02:00:00Z', ...overrides,
});

const arrival = (overrides: Partial<StationArrival> = {}): StationArrival => ({
  busId: 'a1', busName: 'Bus 5', plateNumber: 'NCV 1105', service: 'dispatch', towardsName: 'Bus Shelter S3', fromName: 'Bus Shelter S1', seconds: 240, stopsAway: 1, ...overrides,
});

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const quote = url.includes('/fares/quote')
        ? { originId: 'st-3', destinationId: 'st-20', stationsTravelled: 17, fareCentavos: 4900, source: 'computed' }
        : null;
      return new Response(JSON.stringify({ success: true, data: quote, timestamp: '' }), { status: 200 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

type Extra = { arrivals?: StationArrival[]; viewer?: Viewer; buyingBusId?: string | null; onBuy?: (b: BusPosition) => void };
const view = (buses: BusPosition[], extra: Extra = {}) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter>
        <ShelterContent shelter={shelter} buses={buses} arrivals={extra.arrivals ?? []} viewer={extra.viewer ?? 'passenger'} buyingBusId={extra.buyingBusId} onBuy={extra.onBuy ?? (() => {})} />
      </MemoryRouter>
    </QueryClientProvider>,
  );

describe('the buses waiting at a shelter', () => {
  it('lists each one with where it is headed and when it leaves, and none from other shelters', () => {
    view([bus({ expectedDepartureAt: '2099-10-16T02:20:00Z' }), bus({ busId: 'b2', busName: 'Bus 3', plateNumber: 'NCV 1103' }), bus({ busId: 'x', busName: 'Elsewhere', originStationId: 'st-9' })]);
    expect(screen.getByText('2 buses available here')).toBeTruthy();
    const rows = screen.getAllByTestId('shelter-bus');
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByTestId('bus-departure').textContent).toMatch(/Departs about 10:20 AM/);
    expect(within(rows[1]!).getByTestId('bus-departure').textContent).toContain('No departure time set yet');
    expect(screen.queryByText('Elsewhere')).toBeNull();
  });

  it('says "Headed to" when the konduktor has chosen, and "Likely headed to" when not', () => {
    view([bus({ plannedDestinationId: 'st-5', plannedDestinationName: 'Bus Shelter S5', headingToId: 'st-5', headingToName: 'Bus Shelter S5' }), bus({ busId: 'b2', busName: 'Bus 3' })]);
    const headings = screen.getAllByTestId('bus-heading');
    expect(headings[0]!.textContent?.trim()).toBe('Headed to Bus Shelter S5');
    expect(headings[1]!.textContent?.trim()).toBe('Likely headed to Bus Shelter S20');
  });

  it('says plainly when nothing is waiting', () => {
    view([]);
    expect(screen.getByText('No bus is waiting here right now')).toBeTruthy();
    expect(screen.queryByTestId('shelter-bus')).toBeNull();
  });

  it('shows no passenger count, and no konduktor name', () => {
    view([bus()]);
    expect(document.body.textContent).not.toMatch(/Liza|Mendoza|passengers?\b/i);
  });
});

describe('buying a ticket on a bus', () => {
  it('one bus: its offer is open straight away, with the trip and fare, and Buy ticket buys on that bus', async () => {
    const onBuy = vi.fn();
    view([bus({ expectedDepartureAt: '2099-10-16T02:20:00Z' })], { onBuy });
    const offer = screen.getByTestId('bus-offer');
    expect(within(offer).getByText('Bus Shelter S3')).toBeTruthy();
    expect(within(offer).getByText('Bus Shelter S20')).toBeTruthy();
    expect(within(offer).getByText(/about 10:20 AM/)).toBeTruthy();
    const button = await screen.findByRole('button', { name: 'Buy ticket · ₱49.00' });
    expect(within(offer).getByText('₱49.00')).toBeTruthy();
    fireEvent.click(button);
    expect(onBuy).toHaveBeenCalledOnce();
    expect(onBuy.mock.calls[0]![0].busId).toBe('b1');
    // The passenger is told the ticket is for this bus and who scans it.
    expect(screen.getByText(/Your ticket is for Bus 2 only/)).toBeTruthy();
    expect(screen.getByText(/konduktor of Bus 2 scans at Bus Shelter S3/)).toBeTruthy();
  });

  it('several buses: tap one to open its offer, and the choice is the one that is bought', async () => {
    const onBuy = vi.fn();
    view([bus(), bus({ busId: 'b2', busName: 'Bus 3', plateNumber: 'NCV 1103' }), bus({ busId: 'b3', busName: 'Bus 4', plateNumber: 'NCV 1104' })], { onBuy });
    expect(screen.queryByTestId('bus-offer')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Bus 3/ }));
    expect(screen.getAllByTestId('bus-offer')).toHaveLength(1);
    fireEvent.click(await screen.findByRole('button', { name: /Buy ticket · ₱49/ }));
    expect(onBuy.mock.calls[0]![0].busId).toBe('b2');
    // Tapping another switches; tapping the open one closes it.
    fireEvent.click(screen.getByRole('button', { name: /Bus 4/ }));
    expect(screen.getByText(/Your ticket is for Bus 4 only/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Bus 4/ }));
    expect(screen.queryByTestId('bus-offer')).toBeNull();
  });

  it('a family buys once: the + and - buttons set how many are riding, the total follows, and the purchase carries the count', async () => {
    const onBuy = vi.fn();
    view([bus()], { onBuy });
    await screen.findByRole('button', { name: 'Buy ticket · ₱49.00' });
    expect(screen.getByLabelText('Number of passengers').textContent).toBe('1');
    // One passenger is the least: the minus button is off.
    expect((screen.getByRole('button', { name: 'Fewer passengers' }) as HTMLButtonElement).disabled).toBe(true);

    for (let i = 0; i < 4; i++) fireEvent.click(screen.getByRole('button', { name: 'More passengers' }));
    expect(screen.getByLabelText('Number of passengers').textContent).toBe('5');
    expect(screen.getByTestId('offer-fare').textContent).toBe('₱49.00 each · ₱245.00 for 5');
    expect(screen.getByRole('button', { name: 'Buy 5 tickets · ₱245.00' })).toBeTruthy();
    expect(screen.getByText(/one QR code for all 5 of you/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Fewer passengers' }));
    expect(screen.getByRole('button', { name: 'Buy 4 tickets · ₱196.00' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Buy 4 tickets · ₱196.00' }));
    expect(onBuy).toHaveBeenCalledOnce();
    expect(onBuy.mock.calls[0]![0].busId).toBe('b1');
    expect(onBuy.mock.calls[0]![1]).toBe(4);
  });

  it('is limited to 10 passengers: the plus button stops there', async () => {
    view([bus()]);
    await screen.findByRole('button', { name: /Buy ticket/ });
    const plus = screen.getByRole('button', { name: 'More passengers' }) as HTMLButtonElement;
    for (let i = 0; i < 15; i++) fireEvent.click(plus);
    expect(screen.getByLabelText('Number of passengers').textContent).toBe('10');
    expect(plus.disabled).toBe(true);
  });

  it('one passenger is bought as one ticket, with the plain price', async () => {
    const onBuy = vi.fn();
    view([bus()], { onBuy });
    fireEvent.click(await screen.findByRole('button', { name: 'Buy ticket · ₱49.00' }));
    expect(onBuy.mock.calls[0]![1]).toBe(1);
    expect(screen.getByTestId('offer-fare').textContent).toBe('₱49.00');
  });

  it('each bus keeps its own party size, and the steppers are locked while buying; an admin sees no stepper', async () => {
    view([bus(), bus({ busId: 'b2', busName: 'Bus 3' })]);
    fireEvent.click(screen.getByRole('button', { name: /Bus 2/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'More passengers' }));
    expect(screen.getByLabelText('Number of passengers').textContent).toBe('2');
    cleanup();

    view([bus()], { buyingBusId: 'b1' });
    await screen.findByRole('button', { name: /Preparing payment/ });
    expect((screen.getByRole('button', { name: 'More passengers' }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();

    view([bus()], { viewer: 'other' });
    expect(screen.queryByTestId('party-size')).toBeNull();
  });

  it('shows Preparing payment while buying, and the button cannot be pressed twice', async () => {
    view([bus()], { buyingBusId: 'b1' });
    const button = (await screen.findByRole('button', { name: /Preparing payment/ })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('a guest is asked to sign in instead; an admin or konduktor can only look', () => {
    const { unmount } = view([bus()], { viewer: 'guest' });
    expect(screen.getByRole('link', { name: /Sign in to buy a ticket/ }).getAttribute('href')).toBe('/login');
    expect(screen.queryByRole('button', { name: /Buy ticket/ })).toBeNull();
    unmount();
    view([bus()], { viewer: 'other' });
    expect(screen.queryByRole('button', { name: /Buy ticket/ })).toBeNull();
    expect(screen.getByText(/bought with a passenger account/)).toBeTruthy();
  });

  it('cannot buy a bus with no destination yet', async () => {
    view([bus({ headingToId: null, headingToName: null })]);
    const button = (await screen.findByRole('button', { name: 'Buy ticket' })) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getAllByText('Destination not set yet').length).toBeGreaterThan(0);
  });
});

describe('the buses arriving', () => {
  it('lists each with when it arrives, where it comes from and is heading, and when it leaves again', () => {
    view(
      [bus({ busId: 'a1', busName: 'Bus 5', service: 'dispatch', originStationId: 'st-1', expectedDepartureAt: '2099-10-16T02:40:00Z' })],
      { arrivals: [arrival(), arrival({ busId: 'c', busName: 'Bus 6', service: 'line', fromName: null, towardsName: 'Bus Shelter S20', seconds: 600, stopsAway: 3 })] },
    );
    const rows = screen.getAllByTestId('shelter-arriving');
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain('Bus 5');
    expect(rows[0]!.textContent).toContain('4 min');
    expect(rows[0]!.textContent).toContain('from Bus Shelter S1');
    expect(within(rows[0]!).getByTestId('arriving-departure').textContent).toMatch(/Leaves here about 10:40 AM/);
    expect(rows[1]!.textContent).toContain('10 min');
    expect(rows[1]!.textContent).toContain('2 stops before here');
    expect(rows[1]!.textContent).toMatch(/Regular service bus/);
  });

  it('says the konduktor sets the departure once the bus arrives, when no time is known yet', () => {
    view([bus({ busId: 'a1', busName: 'Bus 5', service: 'dispatch', originStationId: 'st-1' })], { arrivals: [arrival()] });
    expect(screen.getByTestId('arriving-departure').textContent).toContain('set by the konduktor once it arrives');
  });

  it('says "Arriving now" for a bus about to pull in', () => {
    view([], { arrivals: [arrival({ seconds: 20 })] });
    expect(screen.getByText('Arriving now')).toBeTruthy();
  });

  it('says so while estimates load, and when no bus is coming', () => {
    const { unmount } = render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ShelterContent shelter={shelter} buses={[]} arrivals={undefined} viewer="passenger" onBuy={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    expect(screen.getByText('Working out arrival times…')).toBeTruthy();
    unmount();
    view([], { arrivals: [] });
    expect(screen.getByText('No bus is on its way here right now.')).toBeTruthy();
  });
});

describe('ShelterDialog', () => {
  it('is a pop-up with the shelter name, and the close button closes it', () => {
    const onOpenChange = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter>
          <ShelterDialog open onOpenChange={onOpenChange} shelter={shelter} buses={[]} arrivals={[]} viewer="passenger" onBuy={() => {}} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Bus Shelter S3')).toBeTruthy();
    expect(within(dialog).getByText('Shelter 3')).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
