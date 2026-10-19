-- P2 Stations + fares (STN-01, FARE-01/02). Idempotent: a fresh install also runs this after the schema files.
CREATE TABLE IF NOT EXISTS stations (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name      text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  sequence  integer NOT NULL CHECK (sequence >= 1),
  latitude  double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT stations_sequence_unique UNIQUE (sequence) DEFERRABLE INITIALLY DEFERRED
);

CREATE TABLE IF NOT EXISTS fare_settings (
  id                   smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  base_fare_centavos   integer NOT NULL CHECK (base_fare_centavos >= 0),
  per_station_centavos integer NOT NULL CHECK (per_station_centavos >= 0),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fare_overrides (
  station_a_id  uuid NOT NULL REFERENCES stations (id) ON DELETE CASCADE,
  station_b_id  uuid NOT NULL REFERENCES stations (id) ON DELETE CASCADE,
  fare_centavos integer NOT NULL CHECK (fare_centavos >= 0),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (station_a_id, station_b_id),
  CHECK (station_a_id < station_b_id)
);
