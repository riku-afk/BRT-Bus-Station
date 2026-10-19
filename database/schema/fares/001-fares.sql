-- Fare rule: base + per_station * |stations travelled| (FARE-01), with per-pair overrides (FARE-02).
-- Money is integer centavos (PHP).
CREATE TABLE IF NOT EXISTS fare_settings (
  id                   smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  base_fare_centavos   integer NOT NULL CHECK (base_fare_centavos >= 0),
  per_station_centavos integer NOT NULL CHECK (per_station_centavos >= 0),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

-- Stored with station_a_id < station_b_id so A→B and B→A share one row.
CREATE TABLE IF NOT EXISTS fare_overrides (
  station_a_id  uuid NOT NULL REFERENCES stations (id) ON DELETE CASCADE,
  station_b_id  uuid NOT NULL REFERENCES stations (id) ON DELETE CASCADE,
  fare_centavos integer NOT NULL CHECK (fare_centavos >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (station_a_id, station_b_id),
  CHECK (station_a_id < station_b_id)
);
