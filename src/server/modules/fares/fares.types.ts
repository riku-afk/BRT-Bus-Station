export type FareSettingsRow = { base_fare_centavos: number; per_station_centavos: number };

export type StationForFare = { id: string; sequence: number; is_active: boolean };

export type FareQuote = {
  originId: string;
  destinationId: string;
  stationsTravelled: number;
  fareCentavos: number;
  /** `override` when an admin set a fixed fare for this pair. */
  source: 'computed' | 'override';
};

export type FareSettings = { baseFareCentavos: number; perStationCentavos: number };

export type OverrideRow = {
  station_a_id: string;
  station_b_id: string;
  station_a_name: string;
  station_b_name: string;
  fare_centavos: number;
};

/** `origin` is the station nearer the start of the line; the fare applies in both directions. */
export type FareOverrideView = {
  originId: string;
  destinationId: string;
  originName: string;
  destinationName: string;
  fareCentavos: number;
};
