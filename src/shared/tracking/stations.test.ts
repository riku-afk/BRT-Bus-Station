import { describe, expect, it } from 'vitest';
import type { BusPosition } from './models';
import { farEndIndex, groupParkedByStation } from './stations';

const bus = (overrides: Partial<BusPosition>): BusPosition => ({
  busId: 'b1', busName: 'Bus 1', plateNumber: 'P1', latitude: 14, longitude: 121, headingDegrees: 0, speedKmh: 0, distanceMeters: 0,
  direction: 1, nextStationId: null, nextStationName: null, atStation: true, service: 'parked', originStationId: 's1',
  originStationName: 'S1', destinationStationId: null, destinationStationName: null, tripId: null, konduktorName: 'Ramon',
  dispatchedAt: null, expectedDepartureAt: null, plannedDestinationId: null, plannedDestinationName: null, headingToId: null, headingToName: null, updatedAt: '2026-10-16T02:00:00Z', ...overrides,
});

describe('farEndIndex', () => {
  it('sends a bus at one terminal to the other', () => {
    expect(farEndIndex(0, 20)).toBe(19);
    expect(farEndIndex(19, 20)).toBe(0);
  });

  it('sends a bus in the middle to the farther terminal', () => {
    expect(farEndIndex(3, 20)).toBe(19);
    expect(farEndIndex(15, 20)).toBe(0);
    expect(farEndIndex(9, 20)).toBe(19); // 9 is nearer the start of 0..19
    expect(farEndIndex(10, 20)).toBe(0);
  });

  it('breaks an exact tie towards the last station, and works on a two-station line', () => {
    expect(farEndIndex(2, 5)).toBe(0); // middle of 0..4: tie
    expect(farEndIndex(0, 2)).toBe(1);
    expect(farEndIndex(1, 2)).toBe(0);
  });

  it('never returns the station the bus is already at', () => {
    for (let count = 2; count <= 12; count++) for (let i = 0; i < count; i++) expect(farEndIndex(i, count)).not.toBe(i);
  });

  it('refuses a line with fewer than two stations', () => {
    expect(() => farEndIndex(0, 1)).toThrow();
  });
});

describe('groupParkedByStation', () => {
  it('groups only parked buses, by the station they wait at', () => {
    const grouped = groupParkedByStation([
      bus({ busId: 'a', originStationId: 's3' }),
      bus({ busId: 'b', originStationId: 's3' }),
      bus({ busId: 'c', originStationId: 's7' }),
      bus({ busId: 'd', service: 'dispatch', originStationId: 's3', atStation: false }),
      bus({ busId: 'e', service: 'line', originStationId: 's1' }),
      bus({ busId: 'f', originStationId: null }),
    ]);
    expect([...grouped.keys()].sort()).toEqual(['s3', 's7']);
    expect(grouped.get('s3')!.map((b) => b.busId)).toEqual(['a', 'b']);
    expect(grouped.get('s7')!.map((b) => b.busId)).toEqual(['c']);
  });

  it('is empty when nothing is parked', () => {
    expect(groupParkedByStation([]).size).toBe(0);
  });
});
