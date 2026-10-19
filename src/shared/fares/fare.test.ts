import { describe, expect, it } from 'vitest';
import { computeFareCentavos, stationsTravelled } from './fare';

const settings = { baseFareCentavos: 1500, perStationCentavos: 200 };

describe('fare rule', () => {
  it('charges base plus per-station, in either direction', () => {
    expect(computeFareCentavos(settings, 1, 2)).toBe(1700);
    expect(computeFareCentavos(settings, 2, 1)).toBe(1700);
    expect(computeFareCentavos(settings, 1, 20)).toBe(1500 + 200 * 19);
  });

  it('counts stations travelled', () => {
    expect(stationsTravelled(5, 12)).toBe(7);
    expect(stationsTravelled(12, 5)).toBe(7);
  });

  it('rejects a zero-length trip', () => {
    expect(() => computeFareCentavos(settings, 3, 3)).toThrow();
  });

  it('stays an integer number of centavos', () => {
    expect(Number.isInteger(computeFareCentavos({ baseFareCentavos: 1550, perStationCentavos: 225 }, 1, 9))).toBe(true);
  });
});
