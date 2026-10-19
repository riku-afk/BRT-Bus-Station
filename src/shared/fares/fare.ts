/** Fare rule (FARE-01): base + per_station × |stations travelled|, unless an admin override exists for the pair. */

export type FareSettings = { baseFareCentavos: number; perStationCentavos: number };

export function stationsTravelled(originSequence: number, destinationSequence: number): number {
  return Math.abs(destinationSequence - originSequence);
}

export function computeFareCentavos(settings: FareSettings, originSequence: number, destinationSequence: number): number {
  const n = stationsTravelled(originSequence, destinationSequence);
  if (n === 0) throw new Error('Origin and destination must differ');
  return settings.baseFareCentavos + settings.perStationCentavos * n;
}
