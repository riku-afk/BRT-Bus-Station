import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { BusPosition } from '@shared/tracking/models';
import type { BusEta } from '@shared/eta/eta';
import { BusList } from './bus-list';

const bus = (overrides: Partial<BusPosition> = {}): BusPosition => ({
  busId: 'bus-4',
  busName: 'Bus 4',
  plateNumber: 'NCV 1104',
  latitude: 14.4,
  longitude: 120.9,
  headingDegrees: 0,
  speedKmh: 60,
  distanceMeters: 5000,
  direction: 1,
  nextStationId: 'st-4',
  nextStationName: 'Bus Shelter S4',
  atStation: false,
  service: 'line',
  originStationId: 'st-1',
  originStationName: 'Bus Shelter S1',
  destinationStationId: 'st-20',
  destinationStationName: 'Bus Shelter S20',
  konduktorName: null,
  tripId: null,
  dispatchedAt: null,
  expectedDepartureAt: null,
  plannedDestinationId: null,
  plannedDestinationName: null,
  headingToId: null,
  headingToName: null,
  updatedAt: '2026-10-16T02:00:00Z',
  ...overrides,
});

/** Arrival estimates, as the ETA endpoint reports them. */
const etas = new Map<string, BusEta>([
  ['bus-4', { busId: 'bus-4', next: { stationId: 'st-4', stationName: 'Bus Shelter S4', seconds: 100 }, destination: { stationId: 'st-20', stationName: 'Bus Shelter S20', seconds: 1500 } }],
  ['bus-1', { busId: 'bus-1', next: { stationId: 'st-9', stationName: 'Bus Shelter S9', seconds: 240 }, destination: { stationId: 'st-9', stationName: 'Bus Shelter S9', seconds: 240 } }],
]);

/** A konduktor's bus on the road: dispatched from S3 to S9, halfway. */
const onRoad = bus({
  busId: 'bus-1',
  busName: 'Bus 1',
  plateNumber: 'NCV 1101',
  service: 'dispatch',
  originStationId: 'st-3',
  originStationName: 'Bus Shelter S3',
  destinationStationId: 'st-9',
  destinationStationName: 'Bus Shelter S9',
  nextStationId: 'st-9',
  nextStationName: 'Bus Shelter S9',
  distanceMeters: 5000,
  konduktorName: 'Ramon Dela Cruz',
  dispatchedAt: '2026-10-16T01:45:00Z', // 9:45 AM in Manila
  tripId: 'trip-1',
});

/** A konduktor's bus waiting at S3, leaving about 10:20 AM Manila. */
const parked = bus({
  busId: 'bus-2',
  busName: 'Bus 2',
  plateNumber: 'NCV 1102',
  service: 'parked',
  atStation: true,
  speedKmh: 0,
  originStationId: 'st-3',
  originStationName: 'Bus Shelter S3',
  destinationStationId: null,
  destinationStationName: null,
  nextStationId: null,
  nextStationName: null,
  konduktorName: 'Liza Mendoza',
  expectedDepartureAt: '2099-10-16T02:20:00Z',
});

function Harness({ buses }: { buses: BusPosition[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  return <BusList buses={buses} etas={etas} selectedId={selected} onSelect={setSelected} />;
}

afterEach(cleanup);

describe('BusList', () => {
  it('shows each bus with its route, and no details until one is clicked', () => {
    render(<Harness buses={[bus(), onRoad, parked]} />);
    expect(screen.getByText('Bus Shelter S1 → Bus Shelter S20')).toBeTruthy();
    expect(screen.getByText('Bus Shelter S3 → Bus Shelter S9')).toBeTruthy();
    expect(screen.getByText('On the road')).toBeTruthy();
    expect(screen.getByText('Available')).toBeTruthy();
    expect(screen.queryByText('Came from')).toBeNull();
  });

  it('a line bus: clicking it opens where it came from, where it is going and when it gets there', () => {
    render(<Harness buses={[bus()]} />);
    const row = screen.getByRole('button', { name: /Bus 4/ });
    expect(row.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(row);
    expect(row.getAttribute('aria-expanded')).toBe('true');

    const details = screen.getByTestId('bus-details-bus-4');
    expect(within(details).getByText('Regular line service (automatic)')).toBeTruthy();
    expect(within(details).getByText('Came from').nextSibling?.textContent).toBe('Bus Shelter S1');
    expect(within(details).getByText('Going to').nextSibling?.textContent).toBe('Bus Shelter S20');
    expect(within(details).getByText('Next stop').nextSibling?.textContent).toBe('Bus Shelter S4');
    expect(within(details).getByText('Moving · 60 km/h')).toBeTruthy();
    expect(within(details).queryByText('Konduktor')).toBeNull(); // no konduktor: it runs by itself
    expect(within(details).getByTestId('eta-next').textContent).toBe('2 min');
    expect(within(details).getByText('Arrives at Bus Shelter S20').nextSibling?.textContent).toBe('25 min');
    expect(within(details).queryByRole('progressbar')).toBeNull();
  });

  it('a bus on the road names its konduktor and when it was sent, and goes straight to its destination', () => {
    render(<Harness buses={[onRoad]} />);
    fireEvent.click(screen.getByRole('button', { name: /Bus 1/ }));
    const details = screen.getByTestId('bus-details-bus-1');
    expect(within(details).getByText('On the road, dispatched by its konduktor')).toBeTruthy();
    expect(within(details).getByText('Konduktor').nextSibling?.textContent).toBe('Ramon Dela Cruz');
    expect(within(details).getByText('Came from').nextSibling?.textContent).toBe('Bus Shelter S3');
    expect(within(details).getByText('Going to').nextSibling?.textContent).toBe('Bus Shelter S9');
    expect(within(details).getByText('Dispatched at').nextSibling?.textContent).toBe('9:45 AM');
    expect(within(details).queryByText('Next stop')).toBeNull();
    expect(within(details).getByText('Arrives at Bus Shelter S9').nextSibling?.textContent).toBe('4 min');
    expect(within(details).queryByTestId('eta-next')).toBeNull(); // non-stop: next stop is the destination
    expect(within(details).queryByRole('progressbar')).toBeNull();
  });

  it('a parked bus says where it waits, its konduktor and when they expect to leave', () => {
    render(<Harness buses={[parked]} />);
    expect(screen.getByText('Waiting at Bus Shelter S3')).toBeTruthy();
    expect(screen.getByText(/Departs about/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Bus 2/ }));
    const details = screen.getByTestId('bus-details-bus-2');
    expect(within(details).getByText('Waiting at a station')).toBeTruthy();
    expect(within(details).getByText('Waiting at').nextSibling?.textContent).toBe('Bus Shelter S3');
    expect(within(details).getByText('Konduktor').nextSibling?.textContent).toBe('Liza Mendoza');
    expect(within(details).getByText('Expected departure').nextSibling?.textContent).toMatch(/10:20 AM/);
    expect(within(details).queryByText('Going to')).toBeNull();
    expect(within(details).queryByRole('progressbar')).toBeNull();
  });

  it('a parked bus with no departure time says the konduktor has not set one', () => {
    render(<Harness buses={[{ ...parked, expectedDepartureAt: null }]} />);
    expect(screen.getByText('No departure time set yet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Bus 2/ }));
    expect(screen.getByText('Not set by the konduktor yet')).toBeTruthy();
  });

  it('clicking the same bus again closes it, and clicking another switches', () => {
    render(<Harness buses={[bus(), onRoad]} />);
    fireEvent.click(screen.getByRole('button', { name: /Bus 4/ }));
    expect(screen.queryByTestId('bus-details-bus-4')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Bus 1/ }));
    expect(screen.queryByTestId('bus-details-bus-4')).toBeNull();
    expect(screen.queryByTestId('bus-details-bus-1')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Bus 1/ }));
    expect(screen.queryByTestId('bus-details-bus-1')).toBeNull();
  });

  it('is monitoring only: no bus can be dispatched or recalled from here', () => {
    render(<Harness buses={[bus(), onRoad, parked]} />);
    for (const name of [/Bus 4/, /Bus 1/, /Bus 2/]) fireEvent.click(screen.getByRole('button', { name: name }));
    expect(screen.queryByRole('button', { name: /Recall|Dispatch|Send/i })).toBeNull();
  });

  it('never shows a passenger count, capacity or seats (GEN-01)', () => {
    render(<Harness buses={[bus(), onRoad, parked]} />);
    for (const name of [/Bus 4/, /Bus 1/, /Bus 2/]) fireEvent.click(screen.getByRole('button', { name: name }));
    fireEvent.click(screen.getByRole('button', { name: /Bus 4/ }));
    expect(document.body.textContent).not.toMatch(/passengers?\b|capacity|seats?\b|occupan|on board/i);
  });

  it('shows a message when no buses are running', () => {
    render(<Harness buses={[]} />);
    expect(screen.getByText(/No buses on the line/)).toBeTruthy();
  });
});

describe('arrival estimates in the details', () => {
  it('say nothing while the estimates are still loading, and none for a parked bus', () => {
    render(<BusList buses={[bus(), parked]} selectedId="bus-4" />);
    expect(screen.queryByTestId('eta-destination')).toBeNull();
    expect(screen.queryByText(/Arrives at/)).toBeNull();
  });
});
