import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { BusPosition } from '@shared/tracking/models';
import { StationBuses } from './station-buses';

const waiting = (overrides: Partial<BusPosition> = {}): BusPosition => ({
  busId: 'b1', busName: 'Bus 2', plateNumber: 'NCV 1102', latitude: 14, longitude: 121, headingDegrees: 0, speedKmh: 0, distanceMeters: 2000,
  direction: 1, nextStationId: null, nextStationName: null, atStation: true, service: 'parked', originStationId: 'st-3',
  originStationName: 'Bus Shelter S3', destinationStationId: null, destinationStationName: null, tripId: null,
  konduktorName: 'Liza Mendoza', dispatchedAt: null, expectedDepartureAt: null, plannedDestinationId: null, plannedDestinationName: null, headingToId: null, headingToName: null, updatedAt: '2026-10-16T02:00:00Z', ...overrides,
});

afterEach(cleanup);

describe('StationBuses', () => {
  it('says so when no bus is waiting', () => {
    render(<StationBuses stationName="Bus Shelter S3" buses={[]} />);
    expect(screen.getByText('Buses waiting at Bus Shelter S3')).toBeTruthy();
    expect(screen.getByText('No bus is waiting here right now.')).toBeTruthy();
  });

  it('lists each waiting bus with its konduktor and expected departure', () => {
    render(
      <StationBuses
        stationName="Bus Shelter S3"
        buses={[waiting({ expectedDepartureAt: '2099-10-16T02:20:00Z' }), waiting({ busId: 'b2', busName: 'Bus 3', plateNumber: 'NCV 1103', konduktorName: 'Jun Villanueva' })]}
      />,
    );
    expect(screen.getByText('Bus 2')).toBeTruthy();
    expect(screen.getByText('Konduktor Liza Mendoza')).toBeTruthy();
    expect(screen.getByText(/Departs about 10:20 AM/)).toBeTruthy();
    expect(screen.getByText('Bus 3')).toBeTruthy();
    expect(screen.getByText('Konduktor Jun Villanueva')).toBeTruthy();
    expect(screen.getByText('No departure time set yet')).toBeTruthy();
    expect(screen.queryByText('No bus is waiting here right now.')).toBeNull();
  });

  it('says a bus is about to leave once its expected time has passed', () => {
    render(<StationBuses stationName="Bus Shelter S3" buses={[waiting({ expectedDepartureAt: '2020-01-01T00:00:00Z' })]} />);
    expect(screen.getByText('Departing any moment')).toBeTruthy();
  });
});
